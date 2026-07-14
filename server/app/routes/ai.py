import asyncio
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import ValidationError

from app.config import Settings, get_settings
from app.schemas.ai import (
    ExtractionContext,
    GeneratedInsights,
    InsightSnapshot,
    ReceiptExtraction,
)
from app.security import require_token
from app.services.ai import configured_providers, select_provider
from app.services.files import ALLOWED_MIME_TYPES, InvalidImage, validate_image_content

router = APIRouter(
    prefix="/api/ai", tags=["ai"], dependencies=[Depends(require_token)]
)


@router.get("/providers")
async def providers(
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, list[dict[str, str | bool]]]:
    entries = []
    for provider_id, provider in configured_providers(settings).items():
        if provider_id == "none":
            continue
        configured = bool(getattr(provider, "configured", False))
        available = await provider.health_check() if configured else False
        entries.append(
            {
                "id": provider.id,
                "label": provider.label,
                "configured": configured,
                "available": available,
                "model": provider.model,
            }
        )
    return {"providers": entries}


@router.post(
    "/receipts/extract",
    response_model=ReceiptExtraction,
    response_model_by_alias=True,
)
async def extract_receipt(
    image: Annotated[UploadFile, File()],
    settings: Annotated[Settings, Depends(get_settings)],
    provider_id: Annotated[str | None, Form(alias="providerId")] = None,
    currency: Annotated[str, Form()] = "EUR",
    locale: Annotated[str, Form()] = "it-IT",
) -> ReceiptExtraction:
    if image.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=422, detail="Only image/jpeg is accepted")
    payload = await image.read(settings.max_upload_bytes + 1)
    if len(payload) > settings.max_upload_bytes:
        raise HTTPException(status_code=413, detail="File is too large")
    try:
        validate_image_content(payload, image.content_type)
    except InvalidImage as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    try:
        provider = select_provider(settings, provider_id)
        context = ExtractionContext(locale=locale, currency=currency)
        return await provider.extract_receipt(payload, image.content_type, context)
    except LookupError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except (httpx.HTTPError, KeyError, ValueError, ValidationError, asyncio.TimeoutError) as error:
        raise HTTPException(status_code=502, detail="AI provider returned an invalid response") from error


@router.post("/insights", response_model=GeneratedInsights, response_model_by_alias=True)
async def generate_insights(
    snapshot: InsightSnapshot,
    settings: Annotated[Settings, Depends(get_settings)],
    provider_id: str | None = None,
) -> GeneratedInsights:
    try:
        provider = select_provider(settings, provider_id)
        return await provider.generate_insights(snapshot)
    except LookupError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except (httpx.HTTPError, KeyError, ValueError, ValidationError, asyncio.TimeoutError) as error:
        raise HTTPException(status_code=502, detail="AI provider returned an invalid response") from error
