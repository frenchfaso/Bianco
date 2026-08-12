import json
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import SyncDocument, SyncSequence
from app.schemas.sync import (
    PullRequest,
    PullResponse,
    PushRequest,
    PushResponse,
    ReceiptAggregate,
    ReceiptAggregateUpdate,
    validate_sync_document,
)

OWNER_ID = "single-user"
REPLICATED_COLLECTIONS = frozenset({"receipts", "receipt_items"})


class ReceiptAggregateNotFoundError(LookupError):
    pass


class ReceiptAggregateConflictError(RuntimeError):
    def __init__(self, aggregate: ReceiptAggregate):
        super().__init__("Receipt aggregate revision does not match")
        self.aggregate = aggregate


def utc_now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def _parse_utc_timestamp(value: object) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return None
    return parsed.astimezone(UTC)


def _monotonic_aggregate_timestamp(documents: list[dict[str, Any]]) -> str:
    """Stay newer than the current master so legacy LWW clients converge.

    This does not make client clocks authoritative: the aggregate revision is
    still the write precondition. It only preserves ordering relative to
    timestamps the server has already accepted through legacy replication.
    """

    timestamp = datetime.now(UTC)
    for document in documents:
        existing = _parse_utc_timestamp(document.get("updatedAt"))
        if existing is not None and existing >= timestamp:
            # JavaScript Date (used by the legacy conflict resolver) has
            # millisecond precision, so advance by a full millisecond.
            timestamp = existing + timedelta(milliseconds=1)
    # Always include six fractional digits. Legacy clients compare ISO strings,
    # so one stable representation is required for chronological ordering.
    return timestamp.isoformat(timespec="microseconds").replace("+00:00", "Z")


def _normalize_json(value: Any) -> Any:
    # JavaScript JSON has a single number type, so a value pulled as 2.0 is
    # pushed back as 2. Treat those representations as the same document.
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, list):
        return [_normalize_json(entry) for entry in value]
    if isinstance(value, dict):
        return {key: _normalize_json(entry) for key, entry in value.items()}
    return value


def _canonical(document: dict[str, Any]) -> str:
    return json.dumps(
        _normalize_json(document),
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    )


def read_document(
    session: Session, collection: str, document_id: str
) -> dict[str, Any] | None:
    row = session.get(SyncDocument, (OWNER_ID, collection, document_id))
    return json.loads(row.document_json) if row else None


def write_server_document(
    session: Session,
    collection: str,
    document: dict[str, Any],
    *,
    timestamp: str | None = None,
) -> None:
    if collection not in REPLICATED_COLLECTIONS:
        raise ValueError("Unknown replicated collection")
    document_id = document.get("id")
    if not isinstance(document_id, str) or not document_id:
        raise ValueError("Every replicated document must contain a non-empty id")
    now = timestamp or utc_now()
    sequence = SyncSequence(created_at=now)
    session.add(sequence)
    session.flush()
    row = session.get(SyncDocument, (OWNER_ID, collection, document_id))
    canonical = _canonical(document)
    if row is None:
        session.add(
            SyncDocument(
                owner_id=OWNER_ID,
                collection_name=collection,
                document_id=document_id,
                document_json=canonical,
                server_sequence=sequence.sequence,
                is_deleted=bool(document.get("_deleted", False)),
                created_at=now,
                updated_at=now,
            )
        )
        return
    row.document_json = canonical
    row.server_sequence = sequence.sequence
    row.is_deleted = bool(document.get("_deleted", False))
    row.updated_at = now


def pull_documents(
    session: Session, collection: str, request: PullRequest
) -> PullResponse:
    sequence = request.checkpoint.sequence if request.checkpoint else 0
    rows = session.scalars(
        select(SyncDocument)
        .where(
            SyncDocument.owner_id == OWNER_ID,
            SyncDocument.collection_name == collection,
            SyncDocument.server_sequence > sequence,
        )
        .order_by(SyncDocument.server_sequence)
        .limit(request.batch_size)
    ).all()
    documents = [json.loads(row.document_json) for row in rows]
    checkpoint = rows[-1].server_sequence if rows else sequence
    return PullResponse(documents=documents, checkpoint={"sequence": checkpoint})


def push_documents(
    session: Session, collection: str, request: PushRequest
) -> tuple[PushResponse, bool]:
    conflicts: list[dict[str, Any]] = []
    accepted = False
    now = utc_now()

    try:
        for row in request.rows:
            new_state = row.new_document_state
            validate_sync_document(collection, new_state)
            document_id = new_state.get("id")
            if not isinstance(document_id, str) or not document_id:
                raise ValueError("Every replicated document must contain a non-empty id")

            master = session.get(SyncDocument, (OWNER_ID, collection, document_id))
            master_state = json.loads(master.document_json) if master else None
            assumed = row.assumed_master_state
            if assumed not in (None, {}):
                validate_sync_document(collection, assumed)

            if master is None:
                matches = assumed is None or assumed == {}
            else:
                matches = (
                    assumed is not None
                    and master_state is not None
                    and _canonical(assumed) == _canonical(master_state)
                )

            if not matches:
                if master_state is not None:
                    conflicts.append(master_state)
                continue

            sequence = SyncSequence(created_at=now)
            session.add(sequence)
            session.flush()
            document_json = _canonical(new_state)

            if master is None:
                session.add(
                    SyncDocument(
                        owner_id=OWNER_ID,
                        collection_name=collection,
                        document_id=document_id,
                        document_json=document_json,
                        server_sequence=sequence.sequence,
                        is_deleted=bool(new_state.get("_deleted", False)),
                        created_at=now,
                        updated_at=now,
                    )
                )
            else:
                master.document_json = document_json
                master.server_sequence = sequence.sequence
                master.is_deleted = bool(new_state.get("_deleted", False))
                master.updated_at = now
            accepted = True

        session.commit()
    except Exception:
        session.rollback()
        raise

    return PushResponse(conflicts=conflicts), accepted


def _receipt_item_rows(session: Session, receipt_id: str) -> list[SyncDocument]:
    return list(
        session.scalars(
            select(SyncDocument).where(
                SyncDocument.owner_id == OWNER_ID,
                SyncDocument.collection_name == "receipt_items",
                func.json_extract(SyncDocument.document_json, "$.receiptId")
                == receipt_id,
            )
        ).all()
    )


def _aggregate_from_rows(
    receipt_row: SyncDocument | None,
    item_rows: list[SyncDocument],
) -> ReceiptAggregate:
    if receipt_row is None or receipt_row.is_deleted:
        raise ReceiptAggregateNotFoundError("Receipt not found")
    receipt = json.loads(receipt_row.document_json)
    items = [
        json.loads(row.document_json)
        for row in item_rows
        if not row.is_deleted
    ]
    items.sort(key=lambda item: (item.get("position", 0), item["id"]))
    revision = max(
        [receipt_row.server_sequence, *(row.server_sequence for row in item_rows)]
    )
    return ReceiptAggregate(revision=revision, receipt=receipt, items=items)


def get_receipt_aggregate(session: Session, receipt_id: str) -> ReceiptAggregate:
    receipt_row = session.get(SyncDocument, (OWNER_ID, "receipts", receipt_id))
    return _aggregate_from_rows(receipt_row, _receipt_item_rows(session, receipt_id))


def _new_receipt_item_id(session: Session) -> str:
    while True:
        item_id = str(uuid4())
        if session.get(SyncDocument, (OWNER_ID, "receipt_items", item_id)) is None:
            return item_id


def update_receipt_aggregate(
    session: Session,
    receipt_id: str,
    request: ReceiptAggregateUpdate,
) -> ReceiptAggregate:
    """Compare-and-swap a receipt and all its items in one database transaction."""

    try:
        # SQLite's default deferred transaction leaves a race between checking the
        # revision and writing. Take the single-writer lock before reading it.
        if session.bind is not None and session.bind.dialect.name == "sqlite":
            session.connection().exec_driver_sql("BEGIN IMMEDIATE")

        receipt_row = session.get(SyncDocument, (OWNER_ID, "receipts", receipt_id))
        item_rows = _receipt_item_rows(session, receipt_id)
        current = _aggregate_from_rows(receipt_row, item_rows)
        if current.revision != request.base_revision:
            session.rollback()
            raise ReceiptAggregateConflictError(current)

        current_item_documents = [
            json.loads(row.document_json) for row in item_rows
        ]
        now = _monotonic_aggregate_timestamp(
            [current.receipt.model_dump(by_alias=True), *current_item_documents]
        )
        receipt = dict(current.receipt.model_dump(by_alias=True))
        header = request.receipt.model_dump(by_alias=True)
        receipt.update(header)
        receipt.update(
            {
                "status": "confirmed",
                "userConfirmed": True,
                "updatedAt": now,
                "updatedByDevice": request.updated_by_device,
                "_deleted": False,
            }
        )
        validate_sync_document("receipts", receipt)

        existing_by_id = {
            row.document_id: (row, document)
            for row, document in zip(item_rows, current_item_documents, strict=True)
        }
        desired_ids: set[str] = set()
        desired_items: list[dict[str, Any]] = []
        for position, item_input in enumerate(request.items):
            item_id = item_input.id or _new_receipt_item_id(session)
            if item_id in desired_ids:
                # Generated UUID collisions are vanishingly unlikely, but the
                # invariant is cheap to enforce at the transactional boundary.
                raise ValueError("Receipt item ids must be unique")
            desired_ids.add(item_id)

            global_row = session.get(
                SyncDocument, (OWNER_ID, "receipt_items", item_id)
            )
            existing_entry = existing_by_id.get(item_id)
            if global_row is not None and existing_entry is None:
                raise ValueError("Receipt item id belongs to another receipt")

            existing = existing_entry[1] if existing_entry else None
            editable = item_input.model_dump(by_alias=True, exclude={"id"})
            item = (
                dict(existing)
                if existing is not None
                else {
                    "id": item_id,
                    "receiptId": receipt_id,
                    "rawName": item_input.normalized_name,
                    "confidence": None,
                }
            )
            item.update(editable)
            item.update(
                {
                    "id": item_id,
                    "receiptId": receipt_id,
                    "position": position,
                    "userEdited": True,
                    "updatedAt": now,
                    "updatedByDevice": request.updated_by_device,
                    "_deleted": False,
                }
            )
            validate_sync_document("receipt_items", item)
            desired_items.append(item)

        tombstones: list[dict[str, Any]] = []
        for item_id, (row, existing) in existing_by_id.items():
            if item_id in desired_ids or row.is_deleted:
                continue
            tombstone = {
                **existing,
                "updatedAt": now,
                "updatedByDevice": request.updated_by_device,
                "_deleted": True,
            }
            validate_sync_document("receipt_items", tombstone)
            tombstones.append(tombstone)

        write_server_document(session, "receipts", receipt, timestamp=now)
        for item in desired_items:
            write_server_document(session, "receipt_items", item, timestamp=now)
        for tombstone in tombstones:
            write_server_document(
                session, "receipt_items", tombstone, timestamp=now
            )
        session.commit()
    except ReceiptAggregateConflictError:
        raise
    except Exception:
        session.rollback()
        raise

    return get_receipt_aggregate(session, receipt_id)
