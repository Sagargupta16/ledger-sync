"""add AI assistant config columns to user_preferences

Revision ID: a1b2c3d4e5f7
Revises: f1a2b3c4d5e6
Create Date: 2026-04-18 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a1b2c3d4e5f7"
down_revision: str | None = "f1a2b3c4d5e6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("user_preferences", sa.Column("ai_provider", sa.String(20), nullable=True))
    op.add_column("user_preferences", sa.Column("ai_model", sa.String(100), nullable=True))
    op.add_column("user_preferences", sa.Column("ai_api_key_encrypted", sa.Text(), nullable=True))


def downgrade() -> None:
    pass
