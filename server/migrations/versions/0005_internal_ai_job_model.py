"""Keep the effective extraction model in backend audit metadata.

Revision ID: 0005_internal_ai_job_model
Revises: 0004_openai_subscription_only
"""

from alembic import op
import sqlalchemy as sa


revision = "0005_internal_ai_job_model"
down_revision = "0004_openai_subscription_only"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "ai_extraction_jobs",
        sa.Column("model_id", sa.String(length=255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("ai_extraction_jobs", "model_id")
