from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.sse import EventSourceResponse, ServerSentEvent
from sqlalchemy.orm import Session

from app.database import get_session
from app.repositories.sync import (
    REPLICATED_COLLECTIONS,
    pull_documents,
    push_documents,
)
from app.schemas.sync import PullRequest, PullResponse, PushRequest, PushResponse
from app.security import require_token
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
    return response


@router.get("/events", response_class=EventSourceResponse)
async def events() -> AsyncIterator[ServerSentEvent]:
    async for message in broadcaster.subscribe():
        yield ServerSentEvent(raw_data=message, event="change")
