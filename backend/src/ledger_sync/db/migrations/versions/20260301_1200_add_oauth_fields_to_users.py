"""Add OAuth fields to users table

Revision ID: b1c2d3e4f5a6
Revises: af63e055055a
Create Date: 2026-03-01 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b1c2d3e4f5a6"
down_revision: str | None = "af63e055055a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Add OAuth columns to users table
    op.add_column("users", sa.Column("auth_provider", sa.String(20), nullable=True))
    op.add_column("users", sa.Column("auth_provider_id", sa.String(255), nullable=True))
    op.create_index("ix_users_auth_provider", "users", ["auth_provider"])


def downgrade() -> None:
    op.drop_index("ix_users_auth_provider", table_name="users")
    op.drop_column("users", "auth_provider_id")
    op.drop_column("users", "auth_provider")
