"""Create synchronization tables.

Revision ID: 0001_initial
Revises:
"""

from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sync_sequences",
        sa.Column("sequence", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("sequence"),
    )
    op.create_table(
        "sync_documents",
        sa.Column("owner_id", sa.String(), nullable=False),
        sa.Column("collection_name", sa.String(), nullable=False),
        sa.Column("document_id", sa.String(), nullable=False),
        sa.Column("document_json", sa.Text(), nullable=False),
        sa.Column("server_sequence", sa.Integer(), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.Column("updated_at", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["server_sequence"], ["sync_sequences.sequence"]),
        sa.PrimaryKeyConstraint("owner_id", "collection_name", "document_id"),
    )
    op.create_index(
        "idx_sync_documents_pull",
        "sync_documents",
        ["owner_id", "collection_name", "server_sequence"],
    )


def downgrade() -> None:
    op.drop_index("idx_sync_documents_pull", table_name="sync_documents")
    op.drop_table("sync_documents")
    op.drop_table("sync_sequences")
