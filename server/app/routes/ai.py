import asyncio
import hashlib
import hmac
import json
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import get_session
from app.insight_categories import CATEGORY_LABELS
from app.models import AIExtractionJob
from app.providers.common import (
    BASE_INSTRUCTIONS,
    INSIGHT_PROMPT,
    INSIGHT_PROMPT_VERSION,
    strict_json_schema,
)
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
    GroundedInsightSelection,
    InsightSnapshot,
    ProviderConfigurationUpdate,
)
from app.security import require_token
from app.services.ai import build_provider, select_provider
from app.services.ai_queue import (
    mark_receipt_for_reanalysis,
    mark_receipt_queued,
    wake_ai_worker,
)
from app.services.events import broadcaster
from app.services.openai_codex import get_openai_codex_service
from app.services.grounded_insights import (
    grounded_insight_renderer_fingerprint_material,
)

router = APIRouter(
    prefix="/api/ai", tags=["ai"], dependencies=[Depends(require_token)]
)
PROVIDER_STATUS_TIMEOUT_SECONDS = 8.0
INSIGHT_PIPELINE_VERSION = "grounded-insight-selection-v1"


def insight_configuration_fingerprint(
    provider: object,
    settings: Settings,
) -> str:
    """Return an opaque identifier for the effective insight pipeline.

    Only the digest leaves the backend. Credentials are deliberately excluded;
    model, endpoint and prompt details are inputs so their changes invalidate a
    cached summary without exposing those values in the fingerprint itself.
    """
    material = {
        "fingerprintVersion": 1,
        # Manual transport/generation contract version. Bump when fixed request
        # options or selection-to-render orchestration changes.
        "insightPipelineVersion": INSIGHT_PIPELINE_VERSION,
        "providerId": str(getattr(provider, "id", "")),
        "endpoint": str(getattr(provider, "base_url", "")),
        "model": str(
            getattr(provider, "insight_model", getattr(provider, "model", ""))
        ),
        "reasoningEffort": str(
            getattr(provider, "insight_reasoning_effort", "") or ""
        ),
        "promptVersion": INSIGHT_PROMPT_VERSION,
        "baseInstructions": BASE_INSTRUCTIONS,
        "prompt": INSIGHT_PROMPT,
        "categoryLabels": CATEGORY_LABELS,
        "outputSchema": GeneratedInsights.model_json_schema(mode="serialization"),
        "selectionSchema": strict_json_schema(
            GroundedInsightSelection.model_json_schema(mode="serialization")
        ),
        "renderer": grounded_insight_renderer_fingerprint_material(),
    }
    canonical = json.dumps(
        material,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    # HMAC keeps low-entropy model identifiers and internal endpoints from
    # being recoverable with a precomputed hash dictionary.
    return hmac.new(
        settings.secret_key.encode("utf-8"),
        canonical,
        hashlib.sha256,
    ).hexdigest()


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
    }
    if definition.id == "openai":
        connection_state = (
            chatgpt_status.get("connected") if chatgpt_status is not None else False
        )
        connected = connection_state is True
        # A transient account-status failure must not make an already active
        # pipeline look disconnected: that would erase a valid client cache.
        connection_unknown = connection_state is None
        entry.update(
            {
                "configured": configured and (connected or (active and connection_unknown)),
                "chatgptConnected": None if connection_unknown else connected,
                "planType": chatgpt_status.get("planType") if chatgpt_status else None,
                "subscriptionOnly": True,
            }
        )
    entry["insightConfigurationFingerprint"] = (
        insight_configuration_fingerprint(provider, settings)
        if entry["configured"]
        else None
    )
    return entry


async def _chatgpt_status(settings: Settings) -> dict[str, str | bool | None]:
    try:
        return await asyncio.wait_for(
            get_openai_codex_service(settings).account_status(),
            timeout=PROVIDER_STATUS_TIMEOUT_SECONDS,
        )
    except Exception:
        return {"connected": None, "planType": None, "status": "unknown"}


def _default_openai_model(models: list[dict[str, object]]) -> str | None:
    for model in models:
        if model.get("isDefault") and isinstance(model.get("id"), str):
            return str(model["id"])
    for model in models:
        if isinstance(model.get("id"), str):
            return str(model["id"])
    return None


async def _ensure_openai_common_model(
    settings: Settings,
    session: Session,
    *,
    known_connected: bool = False,
) -> tuple[ResolvedProviderConfiguration, list[dict[str, object]] | None]:
    """Fill only missing roles from the legacy/common account default.

    Explicit per-role environment models are resolved first and are never
    overwritten. The persisted common value exists solely for compatibility
    and for zero-configuration subscription login.
    """
    configuration = resolve_provider_configuration(session, settings, "openai")
    if configuration.receipt_model and configuration.insight_model:
        return configuration, None
    service = get_openai_codex_service(settings)
    if not known_connected:
        status = await asyncio.wait_for(
            service.account_status(),
            timeout=PROVIDER_STATUS_TIMEOUT_SECONDS,
        )
        if not status.get("connected"):
            return configuration, None
    models = await asyncio.wait_for(
        service.list_models(),
        timeout=PROVIDER_STATUS_TIMEOUT_SECONDS,
    )
    default_model = _default_openai_model(models)
    if default_model:
        configuration = save_provider_model(
            session,
            settings,
            "openai",
            default_model,
        )
    return configuration, models


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
        receipt_model=current.receipt_model,
        insight_model=current.insight_model,
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
        bool(chatgpt_status and chatgpt_status.get("connected") is True)
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
    try:
        await _ensure_openai_common_model(settings, session)
    except Exception:
        # Provider status remains available even when the optional catalog
        # lookup is temporarily unavailable.
        pass
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
            raise HTTPException(
                status_code=409,
                detail="The configured backend models are not available",
            )
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
    session: Annotated[Session, Depends(get_session)],
    login_id: Annotated[str, Query(alias="loginId", min_length=1, max_length=256)],
) -> dict[str, str | bool | None]:
    try:
        status = await asyncio.wait_for(
            get_openai_codex_service(settings).login_status(login_id),
            timeout=PROVIDER_STATUS_TIMEOUT_SECONDS,
        )
    except Exception as error:
        raise HTTPException(status_code=502, detail="ChatGPT login status is unavailable") from error
    if status.get("connected"):
        try:
            configuration, models = await _ensure_openai_common_model(
                settings,
                session,
                known_connected=True,
            )
            available_ids = (
                {str(entry["id"]) for entry in models if isinstance(entry.get("id"), str)}
                if models is not None
                else set(await build_provider(configuration, settings).list_models())
            )
            if {
                configuration.receipt_model,
                configuration.insight_model,
            }.issubset(available_ids):
                activate_provider_configuration(session, settings, "openai")
                release_jobs_for_provider(session, "openai")
                wake_ai_worker()
                await broadcaster.publish_ai_configuration_changed()
        except Exception:
            # Authorization succeeded. A missing or temporarily unavailable
            # backend model is reported by the provider status separately and
            # must not turn a successful OpenAI login into a false auth error.
            pass
    return status


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
    response: Response,
    settings: Annotated[Settings, Depends(get_settings)],
    session: Annotated[Session, Depends(get_session)],
    provider_id: str | None = None,
) -> GeneratedInsights:
    try:
        provider = select_provider(settings, session, provider_id)
        generated = await provider.generate_insights(snapshot)
        response.headers["X-Bianco-AI-Configuration-Fingerprint"] = (
            insight_configuration_fingerprint(provider, settings)
        )
        return generated
    except LookupError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except (httpx.HTTPError, KeyError, ValueError, ValidationError, asyncio.TimeoutError) as error:
        raise HTTPException(status_code=502, detail="AI provider returned an invalid response") from error
