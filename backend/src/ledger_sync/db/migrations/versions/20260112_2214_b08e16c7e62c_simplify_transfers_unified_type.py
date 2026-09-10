"""simplify_transfers_unified_type

Revision ID: b08e16c7e62c
Revises: 343e4412d829
Create Date: 2026-01-12 22:14:14.378079

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from ledger_sync.db.migrations.safety import irreversible

# revision identifiers, used by Alembic.
revision: str = "b08e16c7e62c"
down_revision: str | None = "343e4412d829"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    conflicting_id = bind.execute(
        sa.text(
            "SELECT 1 FROM transfers JOIN transactions "
            "ON transfers.transfer_id = transactions.transaction_id LIMIT 1"
        )
    ).first()
    if conflicting_id is not None:
        raise RuntimeError(
            "Transfer IDs already exist in transactions. Resolve the conflicting records "
            "from a verified backup before retrying. No transfer rows were removed."
        )
    if bind.dialect.name == "postgresql":
        enums = {enum["name"]: enum["labels"] for enum in sa.inspect(bind).get_enums()}
        if "transactiontype" in enums and "TRANSFER" not in enums["transactiontype"]:
            # Existing databases at the first revision need the label committed
            # before it can be used by the INSERT below.
            with op.get_context().autocommit_block():
                op.execute("ALTER TYPE transactiontype ADD VALUE IF NOT EXISTS 'TRANSFER'")

    # Add from_account and to_account columns to transactions table
    op.add_column("transactions", sa.Column("from_account", sa.String(length=255), nullable=True))
    op.add_column("transactions", sa.Column("to_account", sa.String(length=255), nullable=True))
    op.create_index("ix_transactions_from_account", "transactions", ["from_account"], unique=False)
    op.create_index("ix_transactions_to_account", "transactions", ["to_account"], unique=False)

    # Collapse only one incoming/outgoing pair with matching ledger and source
    # metadata. Preserve unpaired legs and every row in an ambiguous group.
    op.execute(
        """
        WITH candidates AS (
            SELECT transfers.*,
                SUM(CASE WHEN CAST(type AS VARCHAR) IN ('TRANSFER_OUT', 'Transfer-Out')
                    THEN 1 ELSE 0 END) OVER transfer_pair AS outgoing_count,
                SUM(CASE WHEN CAST(type AS VARCHAR) IN ('TRANSFER_IN', 'Transfer-In')
                    THEN 1 ELSE 0 END) OVER transfer_pair AS incoming_count
            FROM transfers
            WINDOW transfer_pair AS (
                PARTITION BY date, amount, currency, from_account, to_account,
                             subcategory, note, source_file, last_seen_at, is_deleted
            )
        )
        INSERT INTO transactions (
            transaction_id, date, amount, currency, type, account, category, subcategory,
            note, from_account, to_account, source_file, last_seen_at, is_deleted
        )
        SELECT
            transfer_id,
            date,
            amount,
            currency,
            'TRANSFER' as type,
            from_account as account,
            category,
            subcategory,
            note,
            from_account,
            to_account,
            source_file,
            last_seen_at,
            is_deleted
        FROM candidates
        WHERE NOT (
            CAST(type AS VARCHAR) IN ('TRANSFER_IN', 'Transfer-In')
            AND outgoing_count = 1 AND incoming_count = 1
        )
    """,
    )

    # Drop transfers table - no longer needed
    op.drop_table("transfers")


@irreversible
def downgrade() -> None:
    # Recreate transfers table
    op.create_table(
        "transfers",
        sa.Column("transfer_id", sa.String(length=64), nullable=False),
        sa.Column("date", sa.DateTime(), nullable=False),
        sa.Column("amount", sa.Numeric(precision=15, scale=2), nullable=False),
        sa.Column("currency", sa.String(length=10), nullable=False),
        sa.Column(
            "type",
            sa.Enum("Transfer-In", "Transfer-Out", name="transfertype"),
            nullable=False,
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
    """,
    )

    # Remove Transfer type transactions
    op.execute("DELETE FROM transactions WHERE type = 'Transfer'")

    # Remove columns
    op.drop_index("ix_transactions_to_account", table_name="transactions")
    op.drop_index("ix_transactions_from_account", table_name="transactions")
    op.drop_column("transactions", "to_account")
    op.drop_column("transactions", "from_account")
