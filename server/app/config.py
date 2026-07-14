from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = Field("sqlite:////data/bianco.db", alias="BIANCO_DATABASE_URL")
    data_dir: Path = Field(Path("/data"), alias="BIANCO_DATA_DIR")
    sync_token: str = Field(..., min_length=8, alias="BIANCO_SYNC_TOKEN")
    secret_key: str = Field(..., min_length=32, alias="BIANCO_SECRET_KEY")
    ai_provider: Literal["none", "openai", "openai-compatible", "ollama"] = Field(
        "none", alias="BIANCO_AI_PROVIDER"
    )
    max_upload_bytes: int = Field(10 * 1024 * 1024, alias="BIANCO_MAX_UPLOAD_BYTES")
    ai_worker_enabled: bool = Field(True, alias="BIANCO_AI_WORKER_ENABLED")
    ai_worker_poll_seconds: float = Field(
        2.0, ge=0.25, le=60, alias="BIANCO_AI_WORKER_POLL_SECONDS"
    )
    ai_worker_max_attempts: int = Field(
        5, ge=1, le=20, alias="BIANCO_AI_WORKER_MAX_ATTEMPTS"
    )

    openai_base_url: str = Field("https://api.openai.com/v1", alias="OPENAI_BASE_URL")
    openai_api_key: str = Field("", alias="OPENAI_API_KEY")
    openai_model: str = Field("", alias="OPENAI_MODEL")

    openai_compatible_base_url: str = Field(
        "", alias="OPENAI_COMPATIBLE_BASE_URL"
    )
    openai_compatible_api_key: str = Field(
        "", alias="OPENAI_COMPATIBLE_API_KEY"
    )
    openai_compatible_model: str = Field("", alias="OPENAI_COMPATIBLE_MODEL")

    ollama_base_url: str = Field("", alias="OLLAMA_BASE_URL")
    ollama_model: str = Field("", alias="OLLAMA_MODEL")

    @property
    def files_dir(self) -> Path:
        return self.data_dir / "files"


@lru_cache
def get_settings() -> Settings:
    return Settings()
