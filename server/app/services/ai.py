from app.config import Settings
from app.providers import DisabledProvider, OllamaProvider, OpenAICompatibleProvider
from app.repositories.ai_providers import (
    ResolvedProviderConfiguration,
    resolve_all_provider_configurations,
    resolve_active_provider_id,
)
from sqlalchemy.orm import Session


def build_provider(configuration: ResolvedProviderConfiguration):
    definition = configuration.definition
    if definition.id == "ollama":
        return OllamaProvider(configuration.base_url, configuration.model)
    return OpenAICompatibleProvider(
        configuration.base_url,
        configuration.api_key,
        configuration.model,
        provider_id=definition.id,
        label=definition.label,
        requires_api_key=definition.requires_api_key,
    )


def configured_providers(settings: Settings, session: Session):
    providers = {
        configuration.definition.id: build_provider(configuration)
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
