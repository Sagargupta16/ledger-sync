"""add earning start date to preferences

Revision ID: c3d4e5f6g7h8
Revises: b2c3d4e5f6g7
Create Date: 2026-02-09 14:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c3d4e5f6g7h8"
down_revision: str | None = "b2c3d4e5f6g7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add earning start date columns."""
    # 11. Earning Start Date (YYYY-MM-DD string, nullable)
    op.add_column(
        "user_preferences",
        sa.Column("earning_start_date", sa.String(10), nullable=True),
    )
    op.add_column(
        "user_preferences",
        sa.Column("use_earning_start_date", sa.Boolean(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    """Remove earning start date columns."""
    op.drop_column("user_preferences", "use_earning_start_date")
    op.drop_column("user_preferences", "earning_start_date")
