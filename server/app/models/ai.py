from sqlalchemy import Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AIProviderConfiguration(Base):
    __tablename__ = "ai_provider_configurations"

    provider_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    base_url: Mapped[str] = mapped_column(String(2048), nullable=False, default="")
    model: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    api_key_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[str] = mapped_column(String, nullable=False)


class AISettings(Base):
    __tablename__ = "ai_settings"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    active_provider_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    updated_at: Mapped[str] = mapped_column(String, nullable=False)


class AIExtractionJob(Base):
    __tablename__ = "ai_extraction_jobs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    receipt_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    image_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    provider_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    locale: Mapped[str] = mapped_column(String(16), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    next_attempt_at: Mapped[str | None] = mapped_column(String, nullable=True)
    last_error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_error_message: Mapped[str | None] = mapped_column(String(300), nullable=True)
    created_at: Mapped[str] = mapped_column(String, nullable=False)
    updated_at: Mapped[str] = mapped_column(String, nullable=False)

    __table_args__ = (
        Index("idx_ai_extraction_jobs_pending", "status", "next_attempt_at", "created_at"),
    )
