import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import or_, select, update
from sqlalchemy.orm import Session

from app.config import Settings
from app.models import AIExtractionJob
from app.repositories.ai_providers import resolve_active_provider_id
from app.repositories.sync import utc_now


def enqueue_extraction(
    session: Session,
    settings: Settings,
    *,
    receipt_id: str,
    image_hash: str,
    locale: str,
    currency: str,
) -> AIExtractionJob:
    existing = session.scalar(
        select(AIExtractionJob).where(AIExtractionJob.receipt_id == receipt_id)
    )
    if existing is not None:
        if existing.image_hash != image_hash:
            existing.image_hash = image_hash
            existing.provider_id = resolve_active_provider_id(session, settings)
            existing.locale = locale
            existing.currency = currency
            existing.status = "pending"
            existing.attempts = 0
            existing.next_attempt_at = None
            existing.last_error_code = None
            existing.last_error_message = None
            existing.updated_at = utc_now()
            session.commit()
        return existing

    now = utc_now()
    job = AIExtractionJob(
        id=str(uuid.uuid4()),
        receipt_id=receipt_id,
        image_hash=image_hash,
        provider_id=resolve_active_provider_id(session, settings),
        locale=locale,
        currency=currency,
        status="pending",
        attempts=0,
        next_attempt_at=None,
        last_error_code=None,
        last_error_message=None,
        created_at=now,
        updated_at=now,
    )
    session.add(job)
    session.commit()
    return job


def claim_next_extraction(session: Session) -> str | None:
    now = utc_now()
    candidate = session.scalar(
        select(AIExtractionJob)
        .where(
            AIExtractionJob.status == "pending",
            or_(
                AIExtractionJob.next_attempt_at.is_(None),
                AIExtractionJob.next_attempt_at <= now,
            ),
        )
        .order_by(AIExtractionJob.created_at)
        .limit(1)
    )
    if candidate is None:
        return None
    result = session.execute(
        update(AIExtractionJob)
        .where(
            AIExtractionJob.id == candidate.id,
            AIExtractionJob.status == "pending",
        )
        .values(status="processing", updated_at=now)
    )
    session.commit()
    return candidate.id if result.rowcount == 1 else None


def requeue_interrupted_extractions(session: Session) -> None:
    session.execute(
        update(AIExtractionJob)
        .where(AIExtractionJob.status == "processing")
        .values(status="pending", next_attempt_at=None, updated_at=utc_now())
    )
    session.commit()


def retry_extraction(
    session: Session, settings: Settings, receipt_id: str
) -> AIExtractionJob | None:
    job = session.scalar(
        select(AIExtractionJob).where(AIExtractionJob.receipt_id == receipt_id)
    )
    if job is None:
        return None
    job.provider_id = resolve_active_provider_id(session, settings)
    job.status = "pending"
    job.attempts = 0
    job.next_attempt_at = None
    job.last_error_code = None
    job.last_error_message = None
    job.updated_at = utc_now()
    session.commit()
    return job


def release_jobs_for_provider(session: Session, provider_id: str) -> None:
    session.execute(
        update(AIExtractionJob)
        .where(AIExtractionJob.status == "pending")
        .values(
            provider_id=provider_id,
            next_attempt_at=None,
            updated_at=utc_now(),
        )
    )
    session.commit()


def schedule_retry(
    session: Session,
    job: AIExtractionJob,
    *,
    code: str,
    message: str,
    delay_seconds: int,
    increment_attempts: bool,
    max_attempts: int,
) -> bool:
    attempts = job.attempts + (1 if increment_attempts else 0)
    terminal = increment_attempts and attempts >= max_attempts
    job.status = "failed" if terminal else "pending"
    job.attempts = attempts
    job.next_attempt_at = None if terminal else (
        datetime.now(UTC) + timedelta(seconds=delay_seconds)
    ).isoformat().replace("+00:00", "Z")
    job.last_error_code = code
    job.last_error_message = message[:300]
    job.updated_at = utc_now()
    session.commit()
    return terminal


def job_entry(job: AIExtractionJob) -> dict[str, str | int | None]:
    return {
        "id": job.id,
        "receiptId": job.receipt_id,
        "status": job.status,
        "attempts": job.attempts,
        "nextAttemptAt": job.next_attempt_at,
        "lastErrorCode": job.last_error_code,
    }
