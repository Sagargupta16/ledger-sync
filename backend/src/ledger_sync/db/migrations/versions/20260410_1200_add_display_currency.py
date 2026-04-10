"""add display_currency to user_preferences

Revision ID: a1b2c3d4e5f6
Revises: d2a3b4c5e6f7
Create Date: 2026-04-10 12:00:00.000000

Changes:
- Add display_currency column to user_preferences table
- Defaults to 'INR' for all existing users
"""

import sqlalchemy as sa
from alembic import op

revision = "a1b2c3d4e5f6"
down_revision = "d2a3b4c5e6f7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_preferences",
        sa.Column("display_currency", sa.String(3), nullable=False, server_default="INR"),
    )


def downgrade() -> None:
    pass
