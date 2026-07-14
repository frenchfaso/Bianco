import asyncio
import json
import logging
import uuid

import httpx
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.database import SessionLocal
from app.models import AIExtractionJob, SyncDocument
from app.repositories.ai_jobs import (
    claim_next_extraction,
    enqueue_extraction,
    requeue_interrupted_extractions,
    schedule_retry,
)
from app.repositories.sync import (
    OWNER_ID,
    read_document,
    utc_now,
    write_server_document,
)
from app.schemas.ai import ExtractionContext, ReceiptExtraction
from app.services.ai import select_provider
from app.services.events import broadcaster
from app.services.files import file_path

logger = logging.getLogger("bianco.ai-worker")
BACKEND_DEVICE_ID = "bianco-ai-worker"


class ReceiptNotReady(RuntimeError):
    pass


_worker_wake: asyncio.Event | None = None


def wake_ai_worker() -> None:
    if _worker_wake is not None:
        _worker_wake.set()


def mark_receipt_queued(session: Session, receipt_id: str) -> bool:
    return _set_receipt_status(session, receipt_id, "queued")


def _protected_receipt(document: dict | None) -> bool:
    return bool(
        not document
        or document.get("_deleted")
        or document.get("userConfirmed")
    )


def _set_receipt_status(session: Session, receipt_id: str, status: str) -> bool:
    document = read_document(session, "receipts", receipt_id)
    if _protected_receipt(document):
        return False
    now = utc_now()
    write_server_document(
        session,
        "receipts",
        {
            **document,
            "status": status,
            "updatedAt": now,
            "updatedByDevice": BACKEND_DEVICE_ID,
        },
        timestamp=now,
    )
    session.commit()
    return True


def _existing_item_documents(session: Session, receipt_id: str) -> list[dict]:
    rows = session.scalars(
        select(SyncDocument).where(
            SyncDocument.owner_id == OWNER_ID,
            SyncDocument.collection_name == "receipt_items",
        )
    ).all()
    documents = [json.loads(row.document_json) for row in rows]
    return [
        document
        for document in documents
        if document.get("receiptId") == receipt_id and not document.get("_deleted")
    ]


def _backfill_legacy_extractions(session: Session, settings: Settings) -> int:
    rows = session.scalars(
        select(SyncDocument).where(
            SyncDocument.owner_id == OWNER_ID,
            SyncDocument.collection_name == "receipts",
            SyncDocument.is_deleted.is_(False),
        )
    ).all()
    queued = 0
    for row in rows:
        receipt = json.loads(row.document_json)
        if receipt.get("status") not in {"queued", "processing", "failed"}:
            continue
        image_hash = receipt.get("imageHash")
        if not isinstance(image_hash, str):
            continue
        try:
            image_exists = file_path(settings.files_dir, image_hash).is_file()
        except ValueError:
            continue
        if not image_exists:
            continue
        existing = session.scalar(
            select(AIExtractionJob).where(
                AIExtractionJob.receipt_id == receipt.get("id")
            )
        )
        if existing is not None:
            continue
        ai_metadata = receipt.get("ai")
        legacy_confirmation = bool(
            receipt.get("userConfirmed")
            and receipt.get("merchantNormalized") is None
            and receipt.get("totalMinor") is None
            and not (
                isinstance(ai_metadata, dict) and ai_metadata.get("providerId")
            )
        )
        if legacy_confirmation or receipt.get("status") == "processing":
            now = utc_now()
            receipt = {
                **receipt,
                "status": "queued",
                "userConfirmed": False,
                "updatedAt": now,
                "updatedByDevice": BACKEND_DEVICE_ID,
            }
            write_server_document(
                session, "receipts", receipt, timestamp=now
            )
            session.commit()
        enqueue_extraction(
            session,
            settings,
            receipt_id=receipt["id"],
            image_hash=image_hash,
            locale="en-GB",
            currency=str(receipt.get("currency") or "EUR").upper(),
        )
        queued += 1
    return queued


def _complete_without_overwrite(session: Session, job: AIExtractionJob) -> None:
    job.status = "skipped"
    job.next_attempt_at = None
    job.last_error_code = "user_edited"
    job.last_error_message = "User edits were preserved"
    job.updated_at = utc_now()
    session.commit()


def _apply_extraction(
    session: Session,
    job: AIExtractionJob,
    extraction: ReceiptExtraction,
    *,
    provider_id: str,
    model: str | None,
) -> bool:
    receipt = read_document(session, "receipts", job.receipt_id)
    if _protected_receipt(receipt):
        _complete_without_overwrite(session, job)
        return False

    existing_items = _existing_item_documents(session, job.receipt_id)
    if any(document.get("userEdited") for document in existing_items):
        _complete_without_overwrite(session, job)
        return False

    now = utc_now()
    merchant = extraction.merchant
    write_server_document(
        session,
        "receipts",
        {
            **receipt,
            "status": "needs_review",
            "transactionDate": extraction.transaction_date or receipt.get("transactionDate"),
            "merchantRaw": merchant.raw_name,
            "merchantNormalized": merchant.normalized_name,
            "currency": extraction.currency,
            "subtotalMinor": extraction.subtotal_minor,
            "taxMinor": extraction.tax_minor,
            "discountMinor": extraction.discount_minor,
            "totalMinor": extraction.total_minor,
            "categoryId": extraction.category_id,
            "overallConfidence": extraction.confidence,
            "warnings": extraction.warnings,
            "ai": {
                "providerId": provider_id,
                "modelId": model,
                "promptVersion": "receipt-v1",
                "schemaVersion": extraction.schema_version,
            },
            "updatedAt": now,
            "updatedByDevice": BACKEND_DEVICE_ID,
        },
        timestamp=now,
    )
    for document in existing_items:
        write_server_document(
            session,
            "receipt_items",
            {
                **document,
                "_deleted": True,
                "updatedAt": now,
                "updatedByDevice": BACKEND_DEVICE_ID,
            },
            timestamp=now,
        )
    for position, item in enumerate(extraction.items):
        write_server_document(
            session,
            "receipt_items",
            {
                "id": str(uuid.uuid4()),
                "receiptId": job.receipt_id,
                "rawName": item.raw_name,
                "normalizedName": item.normalized_name or item.raw_name,
                "quantity": item.quantity,
                "unitPriceMinor": item.unit_price_minor,
                "totalPriceMinor": item.total_price_minor,
                "categoryId": item.category_id,
                "confidence": item.confidence,
                "position": position,
                "userEdited": False,
                "updatedAt": now,
                "updatedByDevice": BACKEND_DEVICE_ID,
                "_deleted": False,
            },
            timestamp=now,
        )
    job.status = "completed"
    job.next_attempt_at = None
    job.last_error_code = None
    job.last_error_message = None
    job.updated_at = now
    session.commit()
    return True


def _failure_details(error: Exception) -> tuple[str, str, int, bool]:
    if isinstance(error, ReceiptNotReady):
        return "receipt_not_ready", "Waiting for receipt synchronization", 2, False
    if isinstance(error, LookupError):
        return "provider_unavailable", "Waiting for an active AI provider", 30, False
    if isinstance(error, (httpx.HTTPError, asyncio.TimeoutError)):
        return "provider_unavailable", "AI provider is temporarily unavailable", 30, True
    if isinstance(error, (ValidationError, KeyError, ValueError)):
        return "invalid_response", "AI provider returned an invalid response", 30, True
    if isinstance(error, (FileNotFoundError, OSError)):
        return "image_unavailable", "Uploaded receipt image is unavailable", 10, True
    return "worker_error", "AI extraction failed", 30, True


async def process_next_ai_job(settings: Settings) -> bool:
    with SessionLocal() as session:
        job_id = claim_next_extraction(session)
    if job_id is None:
        return False

    try:
        with SessionLocal() as session:
            job = session.get(AIExtractionJob, job_id)
            if job is None:
                return True
            receipt = read_document(session, "receipts", job.receipt_id)
            if receipt is None:
                raise ReceiptNotReady()
            if _protected_receipt(receipt):
                _complete_without_overwrite(session, job)
                return True
            if receipt.get("imageHash") != job.image_hash:
                raise ValueError("Receipt image reference does not match the queued upload")
            provider = select_provider(settings, session, job.provider_id)
            provider_id = provider.id
            model = getattr(provider, "model", None)
            context = ExtractionContext(locale=job.locale, currency=job.currency)
            image = file_path(settings.files_dir, job.image_hash).read_bytes()
            changed = _set_receipt_status(session, job.receipt_id, "processing")
        if changed:
            await broadcaster.publish_resync()

        extraction = await provider.extract_receipt(image, "image/jpeg", context)
        with SessionLocal() as session:
            job = session.get(AIExtractionJob, job_id)
            if job is None:
                return True
            changed = _apply_extraction(
                session,
                job,
                extraction,
                provider_id=provider_id,
                model=model,
            )
        if changed:
            await broadcaster.publish_resync()
    except Exception as error:
        code, message, delay, increment_attempts = _failure_details(error)
        terminal = False
        with SessionLocal() as session:
            job = session.get(AIExtractionJob, job_id)
            if job is not None:
                terminal = schedule_retry(
                    session,
                    job,
                    code=code,
                    message=message,
                    delay_seconds=delay,
                    increment_attempts=increment_attempts,
                    max_attempts=settings.ai_worker_max_attempts,
                )
                changed = _set_receipt_status(
                    session, job.receipt_id, "failed" if terminal else "queued"
                )
            else:
                changed = False
        if changed:
            await broadcaster.publish_resync()
        logger.warning(
            "AI job %s failed with %s (%s)", job_id, type(error).__name__, code
        )
    return True


async def run_ai_worker(settings: Settings) -> None:
    global _worker_wake
    _worker_wake = asyncio.Event()
    with SessionLocal() as session:
        requeue_interrupted_extractions(session)
        backfilled = _backfill_legacy_extractions(session, settings)
    if backfilled:
        logger.info("Backfilled %s legacy AI extraction jobs", backfilled)
    while True:
        if await process_next_ai_job(settings):
            continue
        try:
            await asyncio.wait_for(
                _worker_wake.wait(), timeout=settings.ai_worker_poll_seconds
            )
        except TimeoutError:
            pass
        _worker_wake.clear()
