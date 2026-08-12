"""Remove legacy OpenAI API credentials.

Revision ID: 0004_openai_subscription_only
Revises: 0003_backend_ai_queue
"""

from alembic import op

revision = "0004_openai_subscription_only"
down_revision = "0003_backend_ai_queue"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # OpenAI now authenticates exclusively through ChatGPT device OAuth.
    # Do not retain credentials from the previous direct-API configuration.
    op.execute(
        "UPDATE ai_provider_configurations "
        "SET base_url = '', api_key_encrypted = NULL "
        "WHERE provider_id = 'openai'"
    )


def downgrade() -> None:
    # Deleted secrets cannot and should not be reconstructed.
    pass
