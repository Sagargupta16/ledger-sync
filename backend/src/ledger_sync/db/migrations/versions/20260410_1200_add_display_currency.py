"""add display_currency to user_preferences

Revision ID: e4f5a6b7c8d9
Revises: d2a3b4c5e6f7
Create Date: 2026-04-10 12:00:00.000000

Changes:
- Add display_currency column to user_preferences table
- Defaults to 'INR' for all existing users
"""

import sqlalchemy as sa
from alembic import op

revision = "e4f5a6b7c8d9"
down_revision = "d2a3b4c5e6f7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_preferences",
        sa.Column("display_currency", sa.String(3), nullable=False, server_default="INR"),
    )


def downgrade() -> None:
    # Rollback not supported; restore from database backup if needed
    pass
