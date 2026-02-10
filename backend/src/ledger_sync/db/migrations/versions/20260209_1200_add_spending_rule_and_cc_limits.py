"""add spending rule targets and credit card limits to preferences

Revision ID: b2c3d4e5f6g7
Revises: a1b2c3d4e5f6
Create Date: 2026-02-09 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b2c3d4e5f6g7"
down_revision: str | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add spending rule targets and credit card limits columns."""
    # 9. Spending Rule Targets (Needs/Wants/Savings)
    op.add_column(
        "user_preferences",
        sa.Column("needs_target_percent", sa.Float(), nullable=False, server_default="50.0"),
    )
    op.add_column(
        "user_preferences",
        sa.Column("wants_target_percent", sa.Float(), nullable=False, server_default="30.0"),
    )
    op.add_column(
        "user_preferences",
        sa.Column("savings_target_percent", sa.Float(), nullable=False, server_default="20.0"),
    )

    # 10. Credit Card Limits (JSON text)
    op.add_column(
        "user_preferences",
        sa.Column("credit_card_limits", sa.Text(), nullable=False, server_default="{}"),
    )


def downgrade() -> None:
    """Remove spending rule targets and credit card limits columns."""
    op.drop_column("user_preferences", "credit_card_limits")
    op.drop_column("user_preferences", "savings_target_percent")
    op.drop_column("user_preferences", "wants_target_percent")
    op.drop_column("user_preferences", "needs_target_percent")
