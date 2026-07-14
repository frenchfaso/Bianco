from app.config import Settings
from app.providers import DisabledProvider, OllamaProvider, OpenAICompatibleProvider


def configured_providers(settings: Settings):
    providers = {
        "openai-compatible": OpenAICompatibleProvider(
            settings.openai_base_url, settings.openai_api_key, settings.openai_model
        ),
        "ollama": OllamaProvider(settings.ollama_base_url, settings.ollama_model),
        "none": DisabledProvider(),
    }
    return providers


def select_provider(settings: Settings, requested: str | None = None):
    provider_id = requested or settings.ai_provider
    provider = configured_providers(settings).get(provider_id)
    if provider is None or provider.id == "none" or not getattr(provider, "configured", False):
        raise LookupError("Requested AI provider is not configured")
    return provider
