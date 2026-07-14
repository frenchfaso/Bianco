import json
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import SyncDocument, SyncSequence
from app.schemas.sync import PullRequest, PullResponse, PushRequest, PushResponse

OWNER_ID = "single-user"
REPLICATED_COLLECTIONS = frozenset({"receipts", "receipt_items"})


def utc_now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def _canonical(document: dict[str, Any]) -> str:
    return json.dumps(document, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


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
            document_id = new_state.get("id")
            if not isinstance(document_id, str) or not document_id:
                raise ValueError("Every replicated document must contain a non-empty id")

            master = session.get(SyncDocument, (OWNER_ID, collection, document_id))
            master_state = json.loads(master.document_json) if master else None
            assumed = row.assumed_master_state

            if master is None:
                matches = assumed is None or assumed == {}
            else:
                matches = assumed is not None and _canonical(assumed) == master.document_json

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
