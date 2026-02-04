"""Add user authentication tables.

Revision ID: add_user_auth
Revises: income_subcategory_format
Create Date: 2026-02-05 00:01:00.000000

This migration adds:
1. users table for authentication
2. user_id foreign key to transactions table
3. user_id foreign key to user_preferences table

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "add_user_auth"
down_revision: str | None = "income_subcategory_format"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create users table and add user_id to related tables."""
    # 1. Create users table
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("is_verified", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=True, onupdate=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)

    # 2. Add user_id to transactions table
    # SQLite doesn't support adding foreign keys directly, so we use batch mode
    with op.batch_alter_table("transactions") as batch_op:
        batch_op.add_column(sa.Column("user_id", sa.Integer(), nullable=True))
        batch_op.create_index("ix_transactions_user_id", ["user_id"])
        batch_op.create_foreign_key(
            "fk_transactions_user_id",
            "users",
            ["user_id"],
            ["id"],
            ondelete="CASCADE",
        )

    # 3. Add user_id to user_preferences table
    with op.batch_alter_table("user_preferences") as batch_op:
        batch_op.add_column(sa.Column("user_id", sa.Integer(), nullable=True))
        batch_op.create_index("ix_user_preferences_user_id", ["user_id"], unique=True)
        batch_op.create_foreign_key(
            "fk_user_preferences_user_id",
            "users",
            ["user_id"],
            ["id"],
            ondelete="CASCADE",
        )


def downgrade() -> None:
    """Remove user authentication tables and columns."""
    # Remove user_id from user_preferences
    with op.batch_alter_table("user_preferences") as batch_op:
        batch_op.drop_constraint("fk_user_preferences_user_id", type_="foreignkey")
        batch_op.drop_index("ix_user_preferences_user_id")
        batch_op.drop_column("user_id")

    # Remove user_id from transactions
    with op.batch_alter_table("transactions") as batch_op:
        batch_op.drop_constraint("fk_transactions_user_id", type_="foreignkey")
        batch_op.drop_index("ix_transactions_user_id")
        batch_op.drop_column("user_id")

    # Drop users table
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")
