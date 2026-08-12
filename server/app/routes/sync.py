from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path
from fastapi.sse import EventSourceResponse, ServerSentEvent
from sqlalchemy.orm import Session

from app.database import get_session
from app.repositories.sync import (
    REPLICATED_COLLECTIONS,
    ReceiptAggregateConflictError,
    ReceiptAggregateNotFoundError,
    get_receipt_aggregate,
    pull_documents,
    push_documents,
    update_receipt_aggregate,
)
from app.schemas.sync import (
    PullRequest,
    PullResponse,
    PushRequest,
    PushResponse,
    ReceiptAggregate,
    ReceiptAggregateUpdate,
)
from app.security import require_token
from app.services.ai_queue import wake_ai_worker
from app.services.events import broadcaster

router = APIRouter(
    prefix="/api/sync", tags=["sync"], dependencies=[Depends(require_token)]
)


def validate_collection(collection: str) -> str:
    if collection not in REPLICATED_COLLECTIONS:
        raise HTTPException(status_code=404, detail="Unknown replicated collection")
    return collection


@router.post("/{collection}/pull", response_model=PullResponse, response_model_by_alias=True)
def pull(
    collection: str,
    request: PullRequest,
    session: Annotated[Session, Depends(get_session)],
) -> PullResponse:
    return pull_documents(session, validate_collection(collection), request)


@router.post("/{collection}/push", response_model=PushResponse, response_model_by_alias=True)
async def push(
    collection: str,
    request: PushRequest,
    session: Annotated[Session, Depends(get_session)],
) -> PushResponse:
    try:
        response, changed = push_documents(session, validate_collection(collection), request)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    if changed:
        await broadcaster.publish_resync()
        if collection == "receipts":
            wake_ai_worker()
    return response


@router.get(
    "/receipt-aggregates/{receipt_id}",
    response_model=ReceiptAggregate,
    response_model_by_alias=True,
)
def receipt_aggregate(
    receipt_id: Annotated[
        str,
        Path(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_-]+$"),
    ],
    session: Annotated[Session, Depends(get_session)],
) -> ReceiptAggregate:
    try:
        return get_receipt_aggregate(session, receipt_id)
    except ReceiptAggregateNotFoundError as error:
        raise HTTPException(status_code=404, detail="Receipt not found") from error


@router.put(
    "/receipt-aggregates/{receipt_id}",
    response_model=ReceiptAggregate,
    response_model_by_alias=True,
)
async def put_receipt_aggregate(
    receipt_id: Annotated[
        str,
        Path(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_-]+$"),
    ],
    request: ReceiptAggregateUpdate,
    session: Annotated[Session, Depends(get_session)],
) -> ReceiptAggregate:
    try:
        aggregate = update_receipt_aggregate(session, receipt_id, request)
    except ReceiptAggregateNotFoundError as error:
        raise HTTPException(status_code=404, detail="Receipt not found") from error
    except ReceiptAggregateConflictError as error:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "revision_conflict",
                "aggregate": error.aggregate.model_dump(by_alias=True),
            },
        ) from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    await broadcaster.publish_resync()
    return aggregate


@router.get("/events", response_class=EventSourceResponse)
async def events() -> AsyncIterator[ServerSentEvent]:
    async for message in broadcaster.subscribe():
        yield ServerSentEvent(raw_data=message, event="change")
