from sqlalchemy import Boolean, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SyncSequence(Base):
    __tablename__ = "sync_sequences"

    sequence: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    created_at: Mapped[str] = mapped_column(String, nullable=False)


class SyncDocument(Base):
    __tablename__ = "sync_documents"

    owner_id: Mapped[str] = mapped_column(String, primary_key=True)
    collection_name: Mapped[str] = mapped_column(String, primary_key=True)
    document_id: Mapped[str] = mapped_column(String, primary_key=True)
    document_json: Mapped[str] = mapped_column(Text, nullable=False)
    server_sequence: Mapped[int] = mapped_column(
        ForeignKey("sync_sequences.sequence"), nullable=False
    )
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[str] = mapped_column(String, nullable=False)
    updated_at: Mapped[str] = mapped_column(String, nullable=False)

    __table_args__ = (
        Index(
            "idx_sync_documents_pull",
            "owner_id",
            "collection_name",
            "server_sequence",
        ),
    )
