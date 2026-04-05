"""add daily_summaries table

Revision ID: d2a3b4c5e6f7
Revises: c1511eec274c
Create Date: 2026-04-05 15:00:00.000000

Changes:
- Create daily_summaries table for pre-computed daily aggregations
- Used by YearInReview heatmap and daily trend charts
"""

import sqlalchemy as sa
from alembic import op

revision = "d2a3b4c5e6f7"
down_revision = "c1511eec274c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "daily_summaries",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("date", sa.String(10), nullable=False),
        sa.Column("total_income", sa.Numeric(precision=15, scale=2), server_default="0"),
        sa.Column("total_expenses", sa.Numeric(precision=15, scale=2), server_default="0"),
        sa.Column("net", sa.Numeric(precision=15, scale=2), server_default="0"),
        sa.Column("income_count", sa.Integer(), server_default="0"),
        sa.Column("expense_count", sa.Integer(), server_default="0"),
        sa.Column("transfer_count", sa.Integer(), server_default="0"),
        sa.Column("total_transactions", sa.Integer(), server_default="0"),
        sa.Column("top_category", sa.String(255), nullable=True),
        sa.Column("last_calculated", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_daily_summaries_user_id", "daily_summaries", ["user_id"])
    op.create_index(
        "ix_daily_summary_user_date",
        "daily_summaries",
        ["user_id", "date"],
        unique=True,
    )


def downgrade() -> None:
    pass
