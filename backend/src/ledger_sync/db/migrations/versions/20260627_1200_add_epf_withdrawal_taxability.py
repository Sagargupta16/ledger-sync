"""add epf withdrawal taxability preference

Revision ID: a1b2c3d4e5f6
Revises: f7a8b9c0d1e2
Create Date: 2026-06-27 12:00:00.000000

Adds two columns to user_preferences so EPF inflow taxability is a user-owned
choice instead of the old hardcoded 50% heuristic:
  - epf_withdrawal_taxable (bool, default False): treat EPF inflows as exempt
    (the common post-5-year-service case) unless the user opts in.
  - epf_taxable_percent (int 0-100, default 100): fraction counted as taxable
    when the toggle is on.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: str | None = "f7a8b9c0d1e2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # server_default backfills existing rows (columns are NOT NULL); the ORM
    # defaults (False / 100) govern new rows. SQLite reflects constraints
    # differently than the models declare, so autogenerate's spurious
    # index/FK churn is intentionally omitted -- the only real change is these
    # two preference columns.
    op.add_column(
        "user_preferences",
        sa.Column(
            "epf_withdrawal_taxable",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column(
        "user_preferences",
        sa.Column(
            "epf_taxable_percent",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("100"),
        ),
    )


def downgrade() -> None:
    # Per project convention: rollback via DB backup, not down-migration.
    pass
