"""Create AI provider configuration table.

Revision ID: 0002_ai_provider_configurations
Revises: 0001_initial
"""

from alembic import op
import sqlalchemy as sa

revision = "0002_ai_provider_configurations"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_provider_configurations",
        sa.Column("provider_id", sa.String(length=64), nullable=False),
        sa.Column("base_url", sa.String(length=2048), nullable=False),
        sa.Column("model", sa.String(length=255), nullable=False),
        sa.Column("api_key_encrypted", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("provider_id"),
    )


def downgrade() -> None:
    op.drop_table("ai_provider_configurations")
