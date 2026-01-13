"""simplify_transfers_unified_type

Revision ID: b08e16c7e62c
Revises: 343e4412d829
Create Date: 2026-01-12 22:14:14.378079

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b08e16c7e62c"
down_revision: str | None = "343e4412d829"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Add from_account and to_account columns to transactions table
    op.add_column("transactions", sa.Column("from_account", sa.String(length=255), nullable=True))
    op.add_column("transactions", sa.Column("to_account", sa.String(length=255), nullable=True))
    op.create_index("ix_transactions_from_account", "transactions", ["from_account"], unique=False)
    op.create_index("ix_transactions_to_account", "transactions", ["to_account"], unique=False)

    # Migrate Transfer-In/Transfer-Out from transfers table to transactions as Transfer type
    # This SQL consolidates double-entry transfers into single entries
    op.execute(
        """
        INSERT INTO transactions (
            transaction_id, date, amount, currency, type, account, category, subcategory,
            note, from_account, to_account, source_file, last_seen_at, is_deleted
        )
        SELECT
            transfer_id,
            date,
            amount,
            currency,
            'Transfer' as type,
            from_account as account,
            category,
            subcategory,
            note,
            from_account,
            to_account,
            source_file,
            last_seen_at,
            is_deleted
        FROM transfers
        WHERE type = 'Transfer-Out'
        AND transfer_id NOT IN (SELECT transaction_id FROM transactions)
    """
    )

    # Drop transfers table - no longer needed
    op.drop_table("transfers")


def downgrade() -> None:
    # Recreate transfers table
    op.create_table(
        "transfers",
        sa.Column("transfer_id", sa.String(length=64), nullable=False),
        sa.Column("date", sa.DateTime(), nullable=False),
        sa.Column("amount", sa.Numeric(precision=15, scale=2), nullable=False),
        sa.Column("currency", sa.String(length=10), nullable=False),
        sa.Column(
            "type", sa.Enum("Transfer-In", "Transfer-Out", name="transfertype"), nullable=False
        ),
        sa.Column("from_account", sa.String(length=255), nullable=False),
        sa.Column("to_account", sa.String(length=255), nullable=False),
        sa.Column("category", sa.String(length=255), nullable=False),
        sa.Column("subcategory", sa.String(length=255), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("source_file", sa.String(length=500), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("transfer_id"),
    )

    # Restore transfers from transactions
    op.execute(
        """
        INSERT INTO transfers (transfer_id, date, amount, currency, type, from_account, to_account,
                             category, subcategory, note, source_file, last_seen_at, is_deleted)
        SELECT transaction_id, date, amount, currency, 'Transfer-Out', from_account, to_account,
               category, subcategory, note, source_file, last_seen_at, is_deleted
        FROM transactions WHERE type = 'Transfer'
    """
    )

    # Remove Transfer type transactions
    op.execute("DELETE FROM transactions WHERE type = 'Transfer'")

    # Remove columns
    op.drop_index("ix_transactions_to_account", table_name="transactions")
    op.drop_index("ix_transactions_from_account", table_name="transactions")
    op.drop_column("transactions", "to_account")
    op.drop_column("transactions", "from_account")
