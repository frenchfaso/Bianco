import asyncio
from functools import partial
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import get_session
from app.repositories.ai_jobs import enqueue_extraction, job_entry
from app.schemas.ai import SupportedLocale
from app.security import require_token
from app.services.ai_queue import wake_ai_worker
from app.services.files import (
    InvalidImage,
    ensure_thumbnail,
    file_path,
    mime_type_for_path,
    validate_and_store_image,
)

router = APIRouter(
    prefix="/api/files", tags=["files"], dependencies=[Depends(require_token)]
)


@router.post("")
async def upload_file(
    file: Annotated[UploadFile, File()],
    sha256: Annotated[str, Form()],
    mime_type: Annotated[str, Form(alias="mimeType")],
    receipt_id: Annotated[
        str,
        Form(
            alias="receiptId",
            min_length=1,
            max_length=64,
            pattern=r"^[A-Za-z0-9_-]+$",
        ),
    ],
    settings: Annotated[Settings, Depends(get_settings)],
    session: Annotated[Session, Depends(get_session)],
    locale: Annotated[SupportedLocale, Form()] = "en-GB",
    currency: Annotated[str, Form(pattern=r"^[A-Za-z]{3}$")] = "EUR",
) -> dict[str, object]:
    payload = await file.read(settings.max_upload_bytes + 1)
    if len(payload) > settings.max_upload_bytes:
        raise HTTPException(status_code=413, detail="File is too large")
    if file.content_type != mime_type:
        raise HTTPException(status_code=422, detail="MIME type fields do not match")
    try:
        file_id, existed = await asyncio.to_thread(
            partial(
                validate_and_store_image,
                settings.files_dir,
                payload,
                sha256.lower(),
                mime_type,
                max_pixels=settings.max_image_pixels,
                max_dimension=settings.max_image_dimension,
            )
        )
    except InvalidImage as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    job = enqueue_extraction(
        session,
        settings,
        receipt_id=receipt_id,
        image_hash=file_id,
        locale=locale,
        currency=currency.upper(),
    )
    wake_ai_worker()
    return {
        "fileId": file_id,
        "alreadyExisted": existed,
        "aiJob": job_entry(job),
    }


@router.get("/{file_id}")
def download_file(
    file_id: str,
    settings: Annotated[Settings, Depends(get_settings)],
    variant: Literal["full", "thumbnail"] = "full",
) -> FileResponse:
    try:
        path = (
            ensure_thumbnail(
                settings.files_dir,
                file_id,
                max_pixels=settings.max_image_pixels,
                max_dimension=settings.max_image_dimension,
            )
            if variant == "thumbnail"
            else file_path(settings.files_dir, file_id)
        )
    except (InvalidImage, FileNotFoundError) as error:
        raise HTTPException(status_code=404, detail="File not found") from error
    if not path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(
        path,
        media_type=mime_type_for_path(path),
        headers={"Cache-Control": "private, no-store"},
    )
