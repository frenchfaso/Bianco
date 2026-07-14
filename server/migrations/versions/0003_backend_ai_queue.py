"""Create the persistent backend AI queue.

Revision ID: 0003_backend_ai_queue
Revises: 0002_ai_provider_configurations
"""

from alembic import op
import sqlalchemy as sa

revision = "0003_backend_ai_queue"
down_revision = "0002_ai_provider_configurations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_settings",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("active_provider_id", sa.String(length=64), nullable=True),
        sa.Column("updated_at", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "ai_extraction_jobs",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("receipt_id", sa.String(length=64), nullable=False),
        sa.Column("image_hash", sa.String(length=64), nullable=False),
        sa.Column("provider_id", sa.String(length=64), nullable=True),
        sa.Column("locale", sa.String(length=16), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("next_attempt_at", sa.String(), nullable=True),
        sa.Column("last_error_code", sa.String(length=64), nullable=True),
        sa.Column("last_error_message", sa.String(length=300), nullable=True),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.Column("updated_at", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("receipt_id"),
    )
    op.create_index(
        "idx_ai_extraction_jobs_pending",
        "ai_extraction_jobs",
        ["status", "next_attempt_at", "created_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "idx_ai_extraction_jobs_pending", table_name="ai_extraction_jobs"
    )
    op.drop_table("ai_extraction_jobs")
    op.drop_table("ai_settings")
