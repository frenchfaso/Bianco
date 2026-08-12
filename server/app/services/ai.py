from app.config import Settings
from app.providers import (
    DisabledProvider,
    OllamaProvider,
    OpenAICompatibleProvider,
    OpenAISubscriptionProvider,
)
from app.repositories.ai_providers import (
    ResolvedProviderConfiguration,
    resolve_all_provider_configurations,
    resolve_active_provider_id,
)
from sqlalchemy.orm import Session

from app.services.openai_codex import get_openai_codex_service


def build_provider(
    configuration: ResolvedProviderConfiguration,
    settings: Settings,
):
    definition = configuration.definition
    if definition.id == "openai":
        return OpenAISubscriptionProvider(
            configuration.receipt_model,
            get_openai_codex_service(settings),
            settings.effective_openai_receipt_reasoning_effort,
            insight_model=configuration.insight_model,
            insight_reasoning_effort=(
                settings.effective_openai_insight_reasoning_effort
            ),
        )
    if definition.id == "ollama":
        return OllamaProvider(
            configuration.base_url,
            configuration.receipt_model,
            ocr_model=settings.ollama_ocr_model,
            audit_model=settings.ollama_audit_model,
            insight_model=configuration.insight_model,
        )
    return OpenAICompatibleProvider(
        configuration.base_url,
        configuration.api_key,
        configuration.receipt_model,
        provider_id=definition.id,
        label=definition.label,
        requires_api_key=definition.requires_api_key,
        insight_model=configuration.insight_model,
    )


def configured_providers(settings: Settings, session: Session):
    providers = {
        configuration.definition.id: build_provider(configuration, settings)
        for configuration in resolve_all_provider_configurations(session, settings)
    }
    providers["none"] = DisabledProvider()
    return providers


def select_provider(
    settings: Settings, session: Session, requested: str | None = None
):
    provider_id = requested or resolve_active_provider_id(session, settings)
    provider = configured_providers(settings, session).get(provider_id)
    if provider is None or provider.id == "none" or not getattr(provider, "configured", False):
        raise LookupError("Requested AI provider is not configured")
    return provider
