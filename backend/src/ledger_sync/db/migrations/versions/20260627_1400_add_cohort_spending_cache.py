"""add cohort_spending cache table

Revision ID: cohort_spending_2026
Revises: salary_tds_2026
Create Date: 2026-06-27 14:00:00.000000

Adds the ``cohort_spending`` rollup table that materializes the "Spending
Patterns" widget (average expense by day-of-week / day-of-month / month-of-year
with occurrence-correct divisors). Populated by the analytics engine on every
upload refresh so the frontend stops pulling the full ledger to bucket it.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "cohort_spending_2026"
down_revision: str | None = "salary_tds_2026"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "cohort_spending",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("dimension", sa.String(length=20), nullable=False),
        sa.Column("bucket", sa.Integer(), nullable=False),
        sa.Column("total_amount", sa.Numeric(precision=15, scale=2), nullable=True),
        sa.Column("occurrences", sa.Integer(), nullable=True),
        sa.Column("avg_amount", sa.Numeric(precision=15, scale=2), nullable=True),
        sa.Column("last_calculated", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_cohort_spending_user_id", "cohort_spending", ["user_id"], unique=False)
    op.create_index(
        "ix_cohort_spending_user_dim",
        "cohort_spending",
        ["user_id", "dimension", "bucket"],
        unique=True,
    )


def downgrade() -> None:
    # Per project convention: rollback via DB backup, not down-migration.
    pass
