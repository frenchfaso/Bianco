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
    ai_provider: Literal["none", "openai-compatible", "ollama"] = Field(
        "none", alias="BIANCO_AI_PROVIDER"
    )
    max_upload_bytes: int = Field(10 * 1024 * 1024, alias="BIANCO_MAX_UPLOAD_BYTES")

    openai_base_url: str = Field("", alias="OPENAI_BASE_URL")
    openai_api_key: str = Field("", alias="OPENAI_API_KEY")
    openai_model: str = Field("", alias="OPENAI_MODEL")

    ollama_base_url: str = Field("", alias="OLLAMA_BASE_URL")
    ollama_model: str = Field("", alias="OLLAMA_MODEL")

    @property
    def files_dir(self) -> Path:
        return self.data_dir / "files"


@lru_cache
def get_settings() -> Settings:
    return Settings()
