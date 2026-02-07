"""add user_id to account_classifications and new transaction indexes

Revision ID: a1b2c3d4e5f6
Revises: cc9fa860116e
Create Date: 2026-02-07 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: str | None = "cc9fa860116e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add user_id to account_classifications, new indexes to transactions."""
    # --- account_classifications: add user_id column ---
    # SQLite doesn't support ALTER TABLE ADD COLUMN with NOT NULL without a default,
    # so we add with a server_default first, then remove it.

    # Check if user_id column already exists (idempotent)
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_columns = [col["name"] for col in inspector.get_columns("account_classifications")]

    if "user_id" not in existing_columns:
        # Add user_id with a default of 1 (the first/only user in most dev setups)
        op.add_column(
            "account_classifications",
            sa.Column("user_id", sa.Integer(), nullable=False, server_default="1"),
        )
        # Remove the server_default after adding the column
        # (SQLite doesn't support this, but the column is already added with a value)

        # Create the foreign key index
        op.create_index(
            "ix_account_classifications_user_id",
            "account_classifications",
            ["user_id"],
        )

    # Remove old unique constraint on account_name (if it exists as a unique index)
    # SQLite doesn't support DROP CONSTRAINT, so we just create the new composite index
    # The ORM model no longer has unique=True on account_name alone

    # Create composite unique index for (user_id, account_name)
    existing_indexes = [idx["name"] for idx in inspector.get_indexes("account_classifications")]
    if "ix_account_classification_user_account" not in existing_indexes:
        op.create_index(
            "ix_account_classification_user_account",
            "account_classifications",
            ["user_id", "account_name"],
            unique=True,
        )

    # --- transactions: add new composite indexes ---
    existing_tx_indexes = [idx["name"] for idx in inspector.get_indexes("transactions")]

    if "ix_transactions_user_deleted" not in existing_tx_indexes:
        op.create_index(
            "ix_transactions_user_deleted",
            "transactions",
            ["user_id", "is_deleted"],
        )

    if "ix_transactions_user_type_deleted" not in existing_tx_indexes:
        op.create_index(
            "ix_transactions_user_type_deleted",
            "transactions",
            ["user_id", "type", "is_deleted"],
        )


def downgrade() -> None:
    """Remove user_id from account_classifications, remove new transaction indexes."""
    op.drop_index("ix_transactions_user_type_deleted", table_name="transactions")
    op.drop_index("ix_transactions_user_deleted", table_name="transactions")
    op.drop_index("ix_account_classification_user_account", table_name="account_classifications")
    op.drop_index("ix_account_classifications_user_id", table_name="account_classifications")
    op.drop_column("account_classifications", "user_id")
