import base64
import hashlib
from dataclasses import dataclass
from datetime import UTC, datetime

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy.orm import Session

from app.config import Settings
from app.models import AIProviderConfiguration, AISettings
from app.schemas.ai import ProviderConfigurationUpdate


@dataclass(frozen=True)
class ProviderDefinition:
    id: str
    label: str
    default_base_url: str
    requires_api_key: bool


@dataclass(frozen=True)
class ResolvedProviderConfiguration:
    definition: ProviderDefinition
    base_url: str
    model: str
    api_key: str
    source: str


PROVIDER_DEFINITIONS = {
    "openai": ProviderDefinition(
        "openai", "OpenAI · ChatGPT subscription", "", False
    ),
    "ollama": ProviderDefinition("ollama", "Ollama", "", False),
    "openai-compatible": ProviderDefinition(
        "openai-compatible", "Altro / OpenAI-compatible", "", False
    ),
}

AI_SETTINGS_ID = "singleton"


def _fernet(settings: Settings) -> Fernet:
    digest = hashlib.sha256(settings.secret_key.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def _environment_values(settings: Settings, provider_id: str) -> tuple[str, str, str]:
    if provider_id == "openai":
        # OpenAI is deliberately subscription-only. API keys belong to the
        # separate OpenAI-compatible provider and are never used as a fallback.
        return "", "", ""
    if provider_id == "ollama":
        return settings.ollama_base_url, settings.ollama_model, ""
    return (
        settings.openai_compatible_base_url,
        settings.openai_compatible_model,
        settings.openai_compatible_api_key,
    )


def resolve_provider_configuration(
    session: Session, settings: Settings, provider_id: str
) -> ResolvedProviderConfiguration:
    definition = PROVIDER_DEFINITIONS.get(provider_id)
    if definition is None:
        raise KeyError(provider_id)
    base_url, model, api_key = _environment_values(settings, provider_id)
    row = session.get(AIProviderConfiguration, provider_id)
    if row is None:
        return ResolvedProviderConfiguration(
            definition, base_url.rstrip("/"), model, api_key, "environment"
        )
    if row.api_key_encrypted and provider_id != "openai":
        try:
            api_key = _fernet(settings).decrypt(
                row.api_key_encrypted.encode("ascii")
            ).decode("utf-8")
        except (InvalidToken, UnicodeDecodeError) as error:
            raise ValueError(f"Cannot decrypt API key for {provider_id}") from error
    return ResolvedProviderConfiguration(
        definition,
        "" if provider_id == "openai" else row.base_url.rstrip("/"),
        # Only the ChatGPT subscription stores a user-selected model. Ollama and
        # OpenAI-compatible models are backend-only, so their environment value
        # must also override rows written by older clients.
        row.model if provider_id == "openai" else model,
        "" if provider_id == "openai" else api_key,
        "database",
    )


def resolve_all_provider_configurations(
    session: Session, settings: Settings
) -> list[ResolvedProviderConfiguration]:
    return [
        resolve_provider_configuration(session, settings, provider_id)
        for provider_id in PROVIDER_DEFINITIONS
    ]


def provider_is_configured(configuration: ResolvedProviderConfiguration) -> bool:
    if configuration.definition.id == "openai":
        return bool(configuration.model)
    return bool(
        configuration.base_url
        and configuration.model
        and (
            not configuration.definition.requires_api_key
            or configuration.api_key
        )
    )


def _save_active_provider(session: Session, provider_id: str | None) -> None:
    row = session.get(AISettings, AI_SETTINGS_ID)
    if row is None:
        row = AISettings(id=AI_SETTINGS_ID)
        session.add(row)
    row.active_provider_id = provider_id
    row.updated_at = datetime.now(UTC).isoformat()
    session.commit()


def resolve_active_provider_id(session: Session, settings: Settings) -> str | None:
    row = session.get(AISettings, AI_SETTINGS_ID)
    if row and row.active_provider_id in PROVIDER_DEFINITIONS:
        configuration = resolve_provider_configuration(
            session, settings, row.active_provider_id
        )
        if provider_is_configured(configuration):
            return row.active_provider_id

    candidates: list[str] = []
    if settings.ai_provider != "none":
        configuration = resolve_provider_configuration(
            session, settings, settings.ai_provider
        )
        if provider_is_configured(configuration):
            candidates.append(settings.ai_provider)
    if not candidates:
        candidates = [
            configuration.definition.id
            for configuration in resolve_all_provider_configurations(session, settings)
            if provider_is_configured(configuration)
        ]
    active = candidates[0] if len(candidates) == 1 else None
    if active or row is None:
        _save_active_provider(session, active)
    return active


def activate_provider_configuration(
    session: Session, settings: Settings, provider_id: str
) -> ResolvedProviderConfiguration:
    configuration = resolve_provider_configuration(session, settings, provider_id)
    if not provider_is_configured(configuration):
        raise ValueError("AI provider is not completely configured")
    _save_active_provider(session, provider_id)
    return configuration


def save_provider_configuration(
    session: Session,
    settings: Settings,
    provider_id: str,
    update: ProviderConfigurationUpdate,
) -> ResolvedProviderConfiguration:
    if provider_id not in PROVIDER_DEFINITIONS:
        raise KeyError(provider_id)
    if provider_id == "openai":
        raise ValueError("OpenAI is configured through ChatGPT subscription login")
    row = session.get(AIProviderConfiguration, provider_id)
    if row is None:
        row = AIProviderConfiguration(provider_id=provider_id, model="")
        session.add(row)
    row.base_url = update.base_url
    if update.clear_api_key:
        row.api_key_encrypted = None
    elif update.api_key is not None and update.api_key.strip():
        row.api_key_encrypted = _fernet(settings).encrypt(
            update.api_key.strip().encode("utf-8")
        ).decode("ascii")
    row.updated_at = datetime.now(UTC).isoformat()
    session.commit()
    return resolve_provider_configuration(session, settings, provider_id)


def save_provider_model(
    session: Session,
    settings: Settings,
    provider_id: str,
    model: str,
) -> ResolvedProviderConfiguration:
    """Persist a model already validated against the provider's live catalog."""
    if provider_id not in PROVIDER_DEFINITIONS:
        raise KeyError(provider_id)
    normalized = model.strip()
    if not normalized or len(normalized) > 255:
        raise ValueError("Invalid AI model")
    row = session.get(AIProviderConfiguration, provider_id)
    if row is None:
        row = AIProviderConfiguration(provider_id=provider_id, base_url="")
        session.add(row)
    row.model = normalized
    if provider_id == "openai":
        row.base_url = ""
        row.api_key_encrypted = None
    row.updated_at = datetime.now(UTC).isoformat()
    session.commit()
    return resolve_provider_configuration(session, settings, provider_id)


def deactivate_provider_configuration(
    session: Session, provider_id: str
) -> None:
    row = session.get(AISettings, AI_SETTINGS_ID)
    if row and row.active_provider_id == provider_id:
        _save_active_provider(session, None)


def clear_openai_subscription_configuration(session: Session) -> None:
    """Forget the selected subscription model so logout cannot reactivate it."""
    row = session.get(AIProviderConfiguration, "openai")
    if row is not None:
        row.base_url = ""
        row.model = ""
        row.api_key_encrypted = None
        row.updated_at = datetime.now(UTC).isoformat()
        session.commit()
    deactivate_provider_configuration(session, "openai")
