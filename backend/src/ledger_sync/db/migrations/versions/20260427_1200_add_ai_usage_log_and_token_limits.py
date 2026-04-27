"""add ai_usage_log table and user_preferences token-limit columns

Revision ID: b2c3d4e5f6a8
Revises: a1b2c3d4e5f7
Create Date: 2026-04-27 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b2c3d4e5f6a8"
down_revision: str | None = "a1b2c3d4e5f7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ai_usage_log: one row per LLM round-trip
    op.create_table(
        "ai_usage_log",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "timestamp",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("provider", sa.String(20), nullable=False),
        sa.Column("model", sa.String(100), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("output_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("tool_rounds", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("cost_usd", sa.Float(), nullable=False, server_default="0"),
    )
    op.create_index("ix_ai_usage_log_user_id", "ai_usage_log", ["user_id"])
    op.create_index("ix_ai_usage_log_timestamp", "ai_usage_log", ["timestamp"])
    op.create_index("ix_ai_usage_user_timestamp", "ai_usage_log", ["user_id", "timestamp"])

    # Per-user token limits (BYOK mode, nullable = no limit)
    op.add_column(
        "user_preferences",
        sa.Column("ai_daily_token_limit", sa.Integer(), nullable=True),
    )
    op.add_column(
        "user_preferences",
        sa.Column("ai_monthly_token_limit", sa.Integer(), nullable=True),
    )
    # Mode: "app_bedrock" (shared server token, rate-limited) vs "byok".
    # Default is "app_bedrock" so users get a working chat out of the box.
    op.add_column(
        "user_preferences",
        sa.Column(
            "ai_mode",
            sa.String(16),
            nullable=False,
            server_default="app_bedrock",
        ),
    )


def downgrade() -> None:
    # Per project convention: downgrades are empty; rollback via DB backup.
    pass
