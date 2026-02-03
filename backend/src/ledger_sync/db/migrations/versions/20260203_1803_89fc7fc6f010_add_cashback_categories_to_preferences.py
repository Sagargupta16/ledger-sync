"""add_cashback_categories_to_preferences

Revision ID: 89fc7fc6f010
Revises: add_user_preferences
Create Date: 2026-02-03 18:03:42.121927

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "89fc7fc6f010"
down_revision: str | None = "add_user_preferences"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add cashback_categories column to user_preferences table."""
    op.add_column(
        "user_preferences",
        sa.Column(
            "cashback_categories",
            sa.Text(),
            nullable=False,
            server_default='{"Cashback": ["Credit Card Cashback", "Rewards"]}',
        ),
    )


def downgrade() -> None:
    """Remove cashback_categories column from user_preferences table."""
    op.drop_column("user_preferences", "cashback_categories")
