"""add new income categories (employment_benefits, freelance, gifts)

Revision ID: add_income_cats
Revises: 89fc7fc6f010
Create Date: 2026-02-04 09:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "add_income_cats"
down_revision: str | None = "89fc7fc6f010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add three new income category columns to user_preferences."""
    # Add employment_benefits_categories column
    op.add_column(
        "user_preferences",
        sa.Column(
            "employment_benefits_categories",
            sa.Text(),
            nullable=False,
            server_default='{"Employment Income": ["EPF Contribution", "Expense Reimbursement"]}',
        ),
    )

    # Add freelance_categories column
    op.add_column(
        "user_preferences",
        sa.Column(
            "freelance_categories",
            sa.Text(),
            nullable=False,
            server_default='{"Business/Self Employment Income": ["Gig Work Income"]}',
        ),
    )

    # Add gifts_categories column
    gifts_default = '{"One-time Income": ["Gifts", "Pocket Money", "Competition/Contest Prizes"]}'
    op.add_column(
        "user_preferences",
        sa.Column(
            "gifts_categories",
            sa.Text(),
            nullable=False,
            server_default=gifts_default,
        ),
    )


def downgrade() -> None:
    """Remove the three new income category columns."""
    op.drop_column("user_preferences", "gifts_categories")
    op.drop_column("user_preferences", "freelance_categories")
    op.drop_column("user_preferences", "employment_benefits_categories")
