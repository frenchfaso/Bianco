import asyncio
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import get_session
from app.models import AIExtractionJob
from app.repositories.ai_jobs import (
    job_entry,
    release_jobs_for_provider,
    retry_extraction,
)
from app.repositories.ai_providers import (
    PROVIDER_DEFINITIONS,
    ResolvedProviderConfiguration,
    activate_provider_configuration,
    resolve_all_provider_configurations,
    resolve_active_provider_id,
    resolve_provider_configuration,
    save_provider_configuration,
)
from app.schemas.ai import (
    GeneratedInsights,
    InsightSnapshot,
    ProviderConfigurationUpdate,
)
from app.security import require_token
from app.services.ai_queue import mark_receipt_queued, wake_ai_worker
from app.services.ai import build_provider, select_provider
from app.services.events import broadcaster

router = APIRouter(
    prefix="/api/ai", tags=["ai"], dependencies=[Depends(require_token)]
)


def provider_entry(
    configuration: ResolvedProviderConfiguration,
    available: bool,
    *,
    active: bool = False,
) -> dict[str, str | bool]:
    provider = build_provider(configuration)
    definition = configuration.definition
    return {
        "id": definition.id,
        "label": definition.label,
        "configured": bool(getattr(provider, "configured", False)),
        "available": available,
        "model": configuration.model,
        "baseUrl": configuration.base_url or definition.default_base_url,
        "hasApiKey": bool(configuration.api_key),
        "requiresApiKey": definition.requires_api_key,
        "source": configuration.source,
        "active": active,
    }


@router.get("/providers")
async def providers(
    settings: Annotated[Settings, Depends(get_settings)],
    session: Annotated[Session, Depends(get_session)],
) -> dict[str, list[dict[str, str | bool]]]:
    entries = []
    active_provider_id = resolve_active_provider_id(session, settings)
    for configuration in resolve_all_provider_configurations(session, settings):
        provider = build_provider(configuration)
        configured = bool(getattr(provider, "configured", False))
        entries.append(
            provider_entry(
                configuration,
                await provider.health_check() if configured else False,
                active=configuration.definition.id == active_provider_id,
            )
        )
    return {"providers": entries}


@router.put("/providers/{provider_id}")
async def update_provider(
    provider_id: str,
    update: ProviderConfigurationUpdate,
    settings: Annotated[Settings, Depends(get_settings)],
    session: Annotated[Session, Depends(get_session)],
) -> dict[str, str | bool]:
    if provider_id not in PROVIDER_DEFINITIONS:
        raise HTTPException(status_code=404, detail="Unknown AI provider")
    configuration = save_provider_configuration(
        session, settings, provider_id, update
    )
    provider = build_provider(configuration)
    configured = bool(getattr(provider, "configured", False))
    available = await provider.health_check() if configured else False
    return provider_entry(
        configuration,
        available,
        active=provider_id == resolve_active_provider_id(session, settings),
    )


@router.put("/providers/{provider_id}/active")
async def activate_provider(
    provider_id: str,
    settings: Annotated[Settings, Depends(get_settings)],
    session: Annotated[Session, Depends(get_session)],
) -> dict[str, str | bool]:
    if provider_id not in PROVIDER_DEFINITIONS:
        raise HTTPException(status_code=404, detail="Unknown AI provider")
    try:
        configuration = activate_provider_configuration(
            session, settings, provider_id
        )
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    release_jobs_for_provider(session, provider_id)
    wake_ai_worker()
    provider = build_provider(configuration)
    return provider_entry(
        configuration,
        await provider.health_check(),
        active=True,
    )


@router.get("/providers/{provider_id}/models")
async def provider_models(
    provider_id: str,
    settings: Annotated[Settings, Depends(get_settings)],
    session: Annotated[Session, Depends(get_session)],
) -> dict[str, list[str]]:
    if provider_id not in PROVIDER_DEFINITIONS:
        raise HTTPException(status_code=404, detail="Unknown AI provider")
    configuration = resolve_provider_configuration(session, settings, provider_id)
    if not configuration.base_url or (
        configuration.definition.requires_api_key and not configuration.api_key
    ):
        raise HTTPException(status_code=503, detail="AI provider connection is incomplete")
    try:
        return {"models": await build_provider(configuration).list_models()}
    except httpx.HTTPError as error:
        raise HTTPException(status_code=502, detail="AI provider is not reachable") from error


@router.get("/jobs/{receipt_id}")
def extraction_job(
    receipt_id: str,
    session: Annotated[Session, Depends(get_session)],
) -> dict[str, str | int | None]:
    job = session.scalar(
        select(AIExtractionJob).where(AIExtractionJob.receipt_id == receipt_id)
    )
    if job is None:
        raise HTTPException(status_code=404, detail="AI extraction job not found")
    return job_entry(job)


@router.post("/jobs/{receipt_id}/retry")
async def retry_job(
    receipt_id: str,
    settings: Annotated[Settings, Depends(get_settings)],
    session: Annotated[Session, Depends(get_session)],
) -> dict[str, str | int | None]:
    job = retry_extraction(session, settings, receipt_id)
    if job is None:
        raise HTTPException(status_code=404, detail="AI extraction job not found")
    changed = mark_receipt_queued(session, receipt_id)
    if changed:
        await broadcaster.publish_resync()
    wake_ai_worker()
    return job_entry(job)


@router.post("/insights", response_model=GeneratedInsights, response_model_by_alias=True)
async def generate_insights(
    snapshot: InsightSnapshot,
    settings: Annotated[Settings, Depends(get_settings)],
    session: Annotated[Session, Depends(get_session)],
    provider_id: str | None = None,
) -> GeneratedInsights:
    try:
        provider = select_provider(settings, session, provider_id)
        return await provider.generate_insights(snapshot)
    except LookupError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except (httpx.HTTPError, KeyError, ValueError, ValidationError, asyncio.TimeoutError) as error:
        raise HTTPException(status_code=502, detail="AI provider returned an invalid response") from error
