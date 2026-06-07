"""add show_tds_schedule preference

Revision ID: 9cbf967f67a6
Revises: b2c3d4e5f6a8
Create Date: 2026-06-07 19:12:09.894525

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "9cbf967f67a6"
down_revision: str | None = "b2c3d4e5f6a8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Autogenerate also reported a large set of index/FK "changes" -- those are
    # spurious (SQLite reflects constraints differently than the models declare
    # them) and are intentionally omitted. The only real change is the new
    # boolean preference column.
    #
    # server_default='0' backfills existing rows (column is NOT NULL); the ORM
    # default=False governs new rows.
    op.add_column(
        "user_preferences",
        sa.Column(
            "show_tds_schedule",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    # Per project convention: rollback via DB backup, not down-migration.
    pass
