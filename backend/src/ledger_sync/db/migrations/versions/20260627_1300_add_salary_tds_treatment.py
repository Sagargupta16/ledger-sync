"""add salary TDS treatment preference

Revision ID: salary_tds_2026
Revises: epf_taxability_2026
Create Date: 2026-06-27 13:00:00.000000

Adds user_preferences.salary_is_net_of_tds (bool, default True): whether the
salary amounts recorded in the ledger are NET of TDS (what hit the bank, the
default) or GROSS (pre-tax). The tax engine backs out the implied gross only in
the net case; in the gross case it taxes the recorded amount directly.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "salary_tds_2026"
down_revision: str | None = "epf_taxability_2026"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # server_default true backfills existing rows (column is NOT NULL) and
    # preserves the prior behaviour (recorded salary treated as net of TDS); the
    # ORM default=True governs new rows.
    op.add_column(
        "user_preferences",
        sa.Column(
            "salary_is_net_of_tds",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )


def downgrade() -> None:
    # Per project convention: rollback via DB backup, not down-migration.
    pass
