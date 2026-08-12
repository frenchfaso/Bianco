from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ReasoningEffort = Literal["none", "low", "medium", "high", "xhigh", "max"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = Field("sqlite:////data/bianco.db", alias="BIANCO_DATABASE_URL")
    data_dir: Path = Field(Path("/data"), alias="BIANCO_DATA_DIR")
    sync_token: str = Field(..., min_length=8, alias="BIANCO_SYNC_TOKEN")
    secret_key: str = Field(..., min_length=32, alias="BIANCO_SECRET_KEY")
    auth_user: str = Field(..., min_length=1, max_length=128, alias="BIANCO_AUTH_USER")
    auth_password_hash: str = Field(
        ..., min_length=20, alias="BIANCO_AUTH_PASSWORD_HASH"
    )
    session_cookie_secure: bool = Field(
        True, alias="BIANCO_SESSION_COOKIE_SECURE"
    )
    session_max_age_seconds: int = Field(
        30 * 24 * 60 * 60,
        ge=300,
        le=365 * 24 * 60 * 60,
        alias="BIANCO_SESSION_MAX_AGE_SECONDS",
    )
    auth_rate_limit_attempts: int = Field(
        10, ge=1, le=100, alias="BIANCO_AUTH_RATE_LIMIT_ATTEMPTS"
    )
    auth_rate_limit_window_seconds: int = Field(
        300,
        ge=10,
        le=3600,
        alias="BIANCO_AUTH_RATE_LIMIT_WINDOW_SECONDS",
    )
    ai_provider: Literal["none", "openai", "openai-compatible", "ollama"] = Field(
        "none", alias="BIANCO_AI_PROVIDER"
    )
    max_upload_bytes: int = Field(10 * 1024 * 1024, alias="BIANCO_MAX_UPLOAD_BYTES")
    max_image_pixels: int = Field(
        64_000_000,
        ge=1_000_000,
        le=200_000_000,
        alias="BIANCO_MAX_IMAGE_PIXELS",
    )
    max_image_dimension: int = Field(
        16_384,
        ge=1_024,
        le=65_535,
        alias="BIANCO_MAX_IMAGE_DIMENSION",
    )
    ai_worker_enabled: bool = Field(True, alias="BIANCO_AI_WORKER_ENABLED")
    ai_worker_poll_seconds: float = Field(
        2.0, ge=0.25, le=60, alias="BIANCO_AI_WORKER_POLL_SECONDS"
    )
    ai_worker_max_attempts: int = Field(
        5, ge=1, le=20, alias="BIANCO_AI_WORKER_MAX_ATTEMPTS"
    )
    ai_worker_orphan_timeout_seconds: int = Field(
        24 * 60 * 60,
        ge=60,
        le=30 * 24 * 60 * 60,
        alias="BIANCO_AI_WORKER_ORPHAN_TIMEOUT_SECONDS",
    )

    openai_request_timeout_seconds: int = Field(
        600, ge=30, le=1800, alias="BIANCO_OPENAI_REQUEST_TIMEOUT_SECONDS"
    )
    openai_receipt_model: str = Field("", alias="BIANCO_OPENAI_RECEIPT_MODEL")
    openai_insight_model: str = Field("", alias="BIANCO_OPENAI_INSIGHT_MODEL")
    # Deprecated common fallback. Keep it for existing deployments while the
    # role-specific settings remain unset.
    openai_reasoning_effort: ReasoningEffort = Field(
        "medium", alias="BIANCO_OPENAI_REASONING_EFFORT"
    )
    openai_receipt_reasoning_effort: ReasoningEffort | None = Field(
        None, alias="BIANCO_OPENAI_RECEIPT_REASONING_EFFORT"
    )
    openai_insight_reasoning_effort: ReasoningEffort | None = Field(
        None, alias="BIANCO_OPENAI_INSIGHT_REASONING_EFFORT"
    )

    openai_compatible_base_url: str = Field(
        "", alias="OPENAI_COMPATIBLE_BASE_URL"
    )
    openai_compatible_api_key: str = Field(
        "", alias="OPENAI_COMPATIBLE_API_KEY"
    )
    openai_compatible_model: str = Field("", alias="OPENAI_COMPATIBLE_MODEL")
    openai_compatible_insight_model: str = Field(
        "", alias="OPENAI_COMPATIBLE_INSIGHT_MODEL"
    )

    ollama_base_url: str = Field("", alias="OLLAMA_BASE_URL")
    ollama_model: str = Field("", alias="OLLAMA_MODEL")
    ollama_insight_model: str = Field("", alias="OLLAMA_INSIGHT_MODEL")
    ollama_ocr_model: str = Field("", alias="OLLAMA_OCR_MODEL")
    ollama_audit_model: str = Field("", alias="OLLAMA_AUDIT_MODEL")

    @field_validator(
        "openai_receipt_reasoning_effort",
        "openai_insight_reasoning_effort",
        mode="before",
    )
    @classmethod
    def empty_reasoning_effort_uses_legacy_fallback(cls, value):
        return None if value == "" else value

    @property
    def effective_openai_receipt_reasoning_effort(self) -> ReasoningEffort:
        return self.openai_receipt_reasoning_effort or self.openai_reasoning_effort

    @property
    def effective_openai_insight_reasoning_effort(self) -> ReasoningEffort:
        return self.openai_insight_reasoning_effort or self.openai_reasoning_effort

    @field_validator("sync_token", "secret_key")
    @classmethod
    def reject_documented_placeholder_secrets(cls, value: str) -> str:
        placeholders = {
            "replace-with-a-long-random-secret",
            "replace-with-an-independent-secret-of-at-least-32-characters",
        }
        if value in placeholders:
            raise ValueError("Replace the documented placeholder with a random secret")
        return value

    @property
    def files_dir(self) -> Path:
        return self.data_dir / "files"

    @property
    def openai_oauth_path(self) -> Path:
        return self.data_dir / "openai-oauth.json.enc"


@lru_cache
def get_settings() -> Settings:
    return Settings()
