import asyncio
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Response
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
    clear_openai_subscription_configuration,
    resolve_all_provider_configurations,
    resolve_active_provider_id,
    resolve_provider_configuration,
    save_provider_configuration,
    save_provider_model,
)
from app.schemas.ai import (
    GeneratedInsights,
    InsightSnapshot,
    ProviderConfigurationUpdate,
    ProviderModelSelection,
)
from app.security import require_token
from app.services.ai_queue import (
    mark_receipt_for_reanalysis,
    mark_receipt_queued,
    wake_ai_worker,
)
from app.services.ai import build_provider, select_provider
from app.services.openai_codex import get_openai_codex_service
from app.services.events import broadcaster

router = APIRouter(
    prefix="/api/ai", tags=["ai"], dependencies=[Depends(require_token)]
)
PROVIDER_STATUS_TIMEOUT_SECONDS = 8.0


def provider_entry(
    configuration: ResolvedProviderConfiguration,
    available: bool,
    settings: Settings,
    *,
    active: bool = False,
    chatgpt_status: dict[str, str | bool | None] | None = None,
) -> dict[str, object]:
    provider = build_provider(configuration, settings)
    definition = configuration.definition
    configured = bool(getattr(provider, "configured", False))
    entry: dict[str, object] = {
        "id": definition.id,
        "label": definition.label,
        "configured": configured,
        "available": available,
        "baseUrl": configuration.base_url or definition.default_base_url,
        "hasApiKey": bool(configuration.api_key),
        "requiresApiKey": definition.requires_api_key,
        "source": configuration.source,
        "active": active,
        "selectedModel": configuration.model or None,
    }
    if definition.id == "openai":
        connected = bool(chatgpt_status and chatgpt_status.get("connected"))
        entry.update(
            {
                "configured": configured and connected,
                "chatgptConnected": connected,
                "planType": chatgpt_status.get("planType") if chatgpt_status else None,
                "subscriptionOnly": True,
            }
        )
    return entry


async def _chatgpt_status(settings: Settings) -> dict[str, str | bool | None]:
    try:
        return await asyncio.wait_for(
            get_openai_codex_service(settings).account_status(),
            timeout=PROVIDER_STATUS_TIMEOUT_SECONDS,
        )
    except Exception:
        return {"connected": False, "planType": None}


async def _provider_available(configuration, settings: Settings) -> bool:
    provider = build_provider(configuration, settings)
    try:
        return bool(await asyncio.wait_for(
            provider.health_check(),
            timeout=PROVIDER_STATUS_TIMEOUT_SECONDS,
        ))
    except Exception:
        return False


def _candidate_configuration(
    current: ResolvedProviderConfiguration,
    update: ProviderConfigurationUpdate,
) -> ResolvedProviderConfiguration:
    api_key = current.api_key
    if update.clear_api_key:
        api_key = ""
    elif update.api_key is not None and update.api_key.strip():
        api_key = update.api_key.strip()
    return ResolvedProviderConfiguration(
        definition=current.definition,
        base_url=update.base_url,
        model=current.model,
        api_key=api_key,
        source="request",
    )


async def _provider_status_entry(
    configuration: ResolvedProviderConfiguration,
    settings: Settings,
    active_provider_id: str | None,
) -> dict[str, object]:
    chatgpt_status = (
        await _chatgpt_status(settings)
        if configuration.definition.id == "openai"
        else None
    )
    provider = build_provider(configuration, settings)
    configured = bool(getattr(provider, "configured", False)) and (
        bool(chatgpt_status and chatgpt_status["connected"])
        if chatgpt_status is not None
        else True
    )
    return provider_entry(
        configuration,
        await _provider_available(configuration, settings) if configured else False,
        settings,
        active=configuration.definition.id == active_provider_id,
        chatgpt_status=chatgpt_status,
    )


@router.get("/providers")
async def providers(
    settings: Annotated[Settings, Depends(get_settings)],
    session: Annotated[Session, Depends(get_session)],
) -> dict[str, list[dict[str, object]]]:
    active_provider_id = resolve_active_provider_id(session, settings)
    configurations = resolve_all_provider_configurations(session, settings)
    entries = await asyncio.gather(*(
        _provider_status_entry(configuration, settings, active_provider_id)
        for configuration in configurations
    ))
    return {"providers": entries}


@router.post("/providers/{provider_id}/test")
async def test_provider_configuration(
    provider_id: str,
    update: ProviderConfigurationUpdate,
    settings: Annotated[Settings, Depends(get_settings)],
    session: Annotated[Session, Depends(get_session)],
) -> dict[str, bool]:
    if provider_id not in PROVIDER_DEFINITIONS:
        raise HTTPException(status_code=404, detail="Unknown AI provider")
    if provider_id == "openai":
        raise HTTPException(
            status_code=409,
            detail="OpenAI is configured through ChatGPT subscription login",
        )
    current = resolve_provider_configuration(session, settings, provider_id)
    candidate = _candidate_configuration(current, update)
    candidate_provider = build_provider(candidate, settings)
    if not getattr(candidate_provider, "configured", False):
        return {"available": False}
    return {"available": await _provider_available(candidate, settings)}


@router.put("/providers/{provider_id}")
async def update_provider(
    provider_id: str,
    update: ProviderConfigurationUpdate,
    settings: Annotated[Settings, Depends(get_settings)],
    session: Annotated[Session, Depends(get_session)],
) -> dict[str, object]:
    if provider_id not in PROVIDER_DEFINITIONS:
        raise HTTPException(status_code=404, detail="Unknown AI provider")
    if provider_id == "openai":
        raise HTTPException(
            status_code=409,
            detail="OpenAI is configured through ChatGPT subscription login",
        )
    current = resolve_provider_configuration(session, settings, provider_id)
    candidate = _candidate_configuration(current, update)
    candidate_provider = build_provider(candidate, settings)
    if not getattr(candidate_provider, "configured", False):
        try:
            configuration = save_provider_configuration(
                session, settings, provider_id, update
            )
        except ValueError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        await broadcaster.publish_ai_configuration_changed()
        return provider_entry(
            configuration,
            False,
            settings,
            active=provider_id == resolve_active_provider_id(session, settings),
        )
    if not await _provider_available(candidate, settings):
        raise HTTPException(
            status_code=409,
            detail="AI provider configuration could not be validated",
        )
    try:
        configuration = save_provider_configuration(
            session, settings, provider_id, update
        )
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    await broadcaster.publish_ai_configuration_changed()
    return provider_entry(
        configuration,
        True,
        settings,
        active=provider_id == resolve_active_provider_id(session, settings),
    )


@router.put("/providers/{provider_id}/active")
async def activate_provider(
    provider_id: str,
    settings: Annotated[Settings, Depends(get_settings)],
    session: Annotated[Session, Depends(get_session)],
) -> dict[str, object]:
    if provider_id not in PROVIDER_DEFINITIONS:
        raise HTTPException(status_code=404, detail="Unknown AI provider")
    if provider_id == "openai":
        status = await _chatgpt_status(settings)
        if not status["connected"]:
            raise HTTPException(status_code=409, detail="Connect a ChatGPT subscription first")
        configuration = resolve_provider_configuration(session, settings, provider_id)
        if not await _provider_available(configuration, settings):
            raise HTTPException(status_code=409, detail="Select an available Codex model first")
    try:
        configuration = activate_provider_configuration(
            session, settings, provider_id
        )
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    release_jobs_for_provider(session, provider_id)
    wake_ai_worker()
    await broadcaster.publish_ai_configuration_changed()
    return provider_entry(
        configuration,
        await _provider_available(configuration, settings),
        settings,
        active=True,
        chatgpt_status=await _chatgpt_status(settings) if provider_id == "openai" else None,
    )


@router.post("/providers/openai/chatgpt/device")
async def start_openai_device_login(
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, str]:
    try:
        return await asyncio.wait_for(
            get_openai_codex_service(settings).start_device_login(),
            timeout=PROVIDER_STATUS_TIMEOUT_SECONDS,
        )
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=502, detail="ChatGPT login could not be started") from error


@router.get("/providers/openai/chatgpt/status")
async def openai_device_login_status(
    settings: Annotated[Settings, Depends(get_settings)],
    login_id: Annotated[str, Query(alias="loginId", min_length=1, max_length=256)],
) -> dict[str, str | bool | None]:
    try:
        return await asyncio.wait_for(
            get_openai_codex_service(settings).login_status(login_id),
            timeout=PROVIDER_STATUS_TIMEOUT_SECONDS,
        )
    except Exception as error:
        raise HTTPException(status_code=502, detail="ChatGPT login status is unavailable") from error


@router.delete("/providers/openai/chatgpt", status_code=204)
async def disconnect_openai_subscription(
    settings: Annotated[Settings, Depends(get_settings)],
    session: Annotated[Session, Depends(get_session)],
) -> Response:
    try:
        await asyncio.wait_for(
            get_openai_codex_service(settings).logout(),
            timeout=PROVIDER_STATUS_TIMEOUT_SECONDS,
        )
    except Exception as error:
        raise HTTPException(status_code=502, detail="ChatGPT logout failed") from error
    clear_openai_subscription_configuration(session)
    await broadcaster.publish_ai_configuration_changed()
    return Response(status_code=204)


@router.get("/providers/openai/models")
async def openai_models(
    settings: Annotated[Settings, Depends(get_settings)],
    session: Annotated[Session, Depends(get_session)],
) -> dict[str, object]:
    try:
        models = await asyncio.wait_for(
            get_openai_codex_service(settings).list_models(),
            timeout=PROVIDER_STATUS_TIMEOUT_SECONDS,
        )
    except PermissionError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=502, detail="Codex model catalog is unavailable") from error
    configuration = resolve_provider_configuration(session, settings, "openai")
    return {"models": models, "selectedModel": configuration.model or None}


@router.put("/providers/openai/model")
async def select_openai_model(
    selection: ProviderModelSelection,
    settings: Annotated[Settings, Depends(get_settings)],
    session: Annotated[Session, Depends(get_session)],
) -> dict[str, object]:
    service = get_openai_codex_service(settings)
    try:
        status = await asyncio.wait_for(
            service.account_status(),
            timeout=PROVIDER_STATUS_TIMEOUT_SECONDS,
        )
        if not status["connected"]:
            raise HTTPException(status_code=409, detail="Connect a ChatGPT subscription first")
        models = await asyncio.wait_for(
            service.list_models(),
            timeout=PROVIDER_STATUS_TIMEOUT_SECONDS,
        )
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=502, detail="Codex model catalog is unavailable") from error
    if selection.model not in {entry["id"] for entry in models}:
        raise HTTPException(status_code=422, detail="Model is not available for this account")
    configuration = save_provider_model(session, settings, "openai", selection.model)
    activate_provider_configuration(session, settings, "openai")
    release_jobs_for_provider(session, "openai")
    wake_ai_worker()
    await broadcaster.publish_ai_configuration_changed()
    return provider_entry(
        configuration,
        True,
        settings,
        active=True,
        chatgpt_status=status,
    )


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


@router.post("/jobs/{receipt_id}/reanalyze")
async def reanalyze_receipt(
    receipt_id: str,
    settings: Annotated[Settings, Depends(get_settings)],
    session: Annotated[Session, Depends(get_session)],
) -> dict[str, str | int | None]:
    existing = session.scalar(
        select(AIExtractionJob).where(AIExtractionJob.receipt_id == receipt_id)
    )
    if existing is None:
        raise HTTPException(status_code=404, detail="AI extraction job not found")
    if not mark_receipt_for_reanalysis(session, receipt_id):
        raise HTTPException(status_code=409, detail="Receipt cannot be reanalyzed")
    job = retry_extraction(session, settings, receipt_id)
    if job is None:  # Defensive: the row was verified immediately above.
        raise HTTPException(status_code=404, detail="AI extraction job not found")
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
