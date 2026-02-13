"""Separate transfers into dedicated table

Revision ID: 343e4412d829
Revises:
Create Date: 2026-01-11 09:46:49.365737

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "343e4412d829"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _create_transactions_table_if_missing(inspector: sa.engine.Inspector) -> None:
    """Create the transactions table and its indexes if it does not already exist."""
    if "transactions" in inspector.get_table_names():
        return

    op.create_table(
        "transactions",
        sa.Column("transaction_id", sa.String(length=64), nullable=False),
        sa.Column("date", sa.DateTime(), nullable=False),
        sa.Column("amount", sa.Numeric(precision=15, scale=2), nullable=False),
        sa.Column("currency", sa.String(length=10), nullable=False),
        sa.Column("type", sa.Enum("EXPENSE", "INCOME", name="transactiontype"), nullable=False),
        sa.Column("account", sa.String(length=255), nullable=False),
        sa.Column("category", sa.String(length=255), nullable=False),
        sa.Column("subcategory", sa.String(length=255), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("source_file", sa.String(length=500), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("transaction_id"),
    )
    op.create_index("ix_transactions_date", "transactions", ["date"], unique=False)
    op.create_index("ix_transactions_type", "transactions", ["type"], unique=False)
    op.create_index("ix_transactions_account", "transactions", ["account"], unique=False)
    op.create_index("ix_transactions_category", "transactions", ["category"], unique=False)
    op.create_index(
        "ix_transactions_last_seen_at",
        "transactions",
        ["last_seen_at"],
        unique=False,
    )
    op.create_index("ix_transactions_is_deleted", "transactions", ["is_deleted"], unique=False)
    op.create_index("ix_transactions_date_type", "transactions", ["date", "type"], unique=False)
    op.create_index(
        "ix_transactions_category_subcategory",
        "transactions",
        ["category", "subcategory"],
        unique=False,
    )


def _create_import_logs_table_if_missing(inspector: sa.engine.Inspector) -> None:
    """Create the import_logs table and its indexes if it does not already exist."""
    if "import_logs" in inspector.get_table_names():
        return

    op.create_table(
        "import_logs",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("file_hash", sa.String(length=64), nullable=False),
        sa.Column("file_name", sa.String(length=500), nullable=False),
        sa.Column("imported_at", sa.DateTime(), nullable=False),
        sa.Column("rows_processed", sa.Integer(), nullable=False),
        sa.Column("rows_inserted", sa.Integer(), nullable=False),
        sa.Column("rows_updated", sa.Integer(), nullable=False),
        sa.Column("rows_deleted", sa.Integer(), nullable=False),
        sa.Column("rows_skipped", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_import_logs_file_hash", "import_logs", ["file_hash"], unique=True)


def _create_transfers_table() -> None:
    """Create the transfers table and all its indexes."""
    op.create_table(
        "transfers",
        sa.Column("transfer_id", sa.String(length=64), nullable=False),
        sa.Column("date", sa.DateTime(), nullable=False),
        sa.Column("amount", sa.Numeric(precision=15, scale=2), nullable=False),
        sa.Column("currency", sa.String(length=10), nullable=False),
        sa.Column(
            "type",
            sa.Enum("TRANSFER_IN", "TRANSFER_OUT", name="transfertype"),
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
    op.create_index("ix_transfers_date", "transfers", ["date"], unique=False)
    op.create_index("ix_transfers_type", "transfers", ["type"], unique=False)
    op.create_index("ix_transfers_from_account", "transfers", ["from_account"], unique=False)
    op.create_index("ix_transfers_to_account", "transfers", ["to_account"], unique=False)
    op.create_index("ix_transfers_category", "transfers", ["category"], unique=False)
    op.create_index("ix_transfers_last_seen_at", "transfers", ["last_seen_at"], unique=False)
    op.create_index("ix_transfers_is_deleted", "transfers", ["is_deleted"], unique=False)
    op.create_index("ix_transfers_date_type", "transfers", ["date", "type"], unique=False)
    op.create_index(
        "ix_transfers_from_to",
        "transfers",
        ["from_account", "to_account"],
        unique=False,
    )


def _migrate_transfer_records(conn: sa.engine.Connection, inspector: sa.engine.Inspector) -> None:
    """Migrate existing Transfer records from transactions to the transfers table."""
    if "transactions" not in inspector.get_table_names():
        return

    try:
        result = conn.execute(
            sa.text(
                """
                SELECT transaction_id, date, amount, currency, account, category, subcategory,
                       note, source_file, last_seen_at, is_deleted
                FROM transactions
                WHERE type = 'Transfer'
            """,
            ),
        )
        transfer_records = result.fetchall()
    except (sa.exc.OperationalError, sa.exc.ProgrammingError):
        # No transfer records or type constraint already updated - this is expected
        # during certain migration states
        return

    for record in transfer_records:
        _insert_transfer_from_transaction(conn, record)

    if transfer_records:
        conn.execute(sa.text("DELETE FROM transactions WHERE type = 'Transfer'"))


def _insert_transfer_from_transaction(conn: sa.engine.Connection, record: sa.engine.Row) -> None:
    """Convert a single transaction record into a transfer record and insert it."""
    category = record[5] if record[5] else ""
    if "Transfer: From" in category or "Transfer-In" in category:
        transfer_type = "TRANSFER_IN"
        from_account = category.replace("Transfer: From", "").strip()
        to_account = record[4]  # account field
    else:  # Transfer: To or Transfer-Out
        transfer_type = "TRANSFER_OUT"
        from_account = record[4]  # account field
        to_account = category.replace("Transfer: To", "").strip()

    conn.execute(
        sa.text(
            """
            INSERT INTO transfers (transfer_id, date, amount, currency, type,
                                 from_account, to_account, category, subcategory,
                                 note, source_file, last_seen_at, is_deleted)
            VALUES (:transfer_id, :date, :amount, :currency, :type,
                    :from_account, :to_account, :category, :subcategory,
                    :note, :source_file, :last_seen_at, :is_deleted)
        """,
        ),
        {
            "transfer_id": record[0],
            "date": record[1],
            "amount": record[2],
            "currency": record[3],
            "type": transfer_type,
            "from_account": from_account,
            "to_account": to_account,
            "category": record[5],
            "subcategory": record[6],
            "note": record[7],
            "source_file": record[8],
            "last_seen_at": record[9],
            "is_deleted": record[10],
        },
    )


def upgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###

    conn = op.get_bind()
    inspector = sa.inspect(conn)

    # Step 1: Create transactions table if it doesn't exist
    _create_transactions_table_if_missing(inspector)

    # Step 2: Create import_logs table if it doesn't exist
    _create_import_logs_table_if_missing(inspector)

    # Step 3: Create new transfers table
    _create_transfers_table()

    # Step 4: Migrate existing Transfer records from transactions to transfers table (if any)
    _migrate_transfer_records(conn, inspector)

    # ### end Alembic commands ###


def downgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###

    # Step 1: Revert transactions type column to VARCHAR
    op.alter_column(
        "transactions",
        "type",
        existing_type=sa.Enum("EXPENSE", "INCOME", name="transactiontype"),
        type_=sa.VARCHAR(length=8),
        existing_nullable=False,
    )

    # Step 2: Migrate transfers back to transactions table
    conn = op.get_bind()

    result = conn.execute(
        sa.text(
            """
        SELECT transfer_id, date, amount, currency, type,
               from_account, to_account, category, subcategory,
               note, source_file, last_seen_at, is_deleted
        FROM transfers
    """,
        ),
    )

    transfer_records = result.fetchall()

    for record in transfer_records:
        # Use to_account as the main account, build category from from/to
        if record[4] == "TRANSFER_IN":
            account = record[6]  # to_account
            category = f"Transfer: From {record[5]}"
        else:  # TRANSFER_OUT
            account = record[5]  # from_account
            category = f"Transfer: To {record[6]}"

        conn.execute(
            sa.text(
                """
            INSERT INTO transactions (transaction_id, date, amount, currency, type,
                                    account, category, subcategory,
                                    note, source_file, last_seen_at, is_deleted)
            VALUES (:transaction_id, :date, :amount, :currency, 'Transfer',
                    :account, :category, :subcategory,
                    :note, :source_file, :last_seen_at, :is_deleted)
        """,
            ),
            {
                "transaction_id": record[0],
                "date": record[1],
                "amount": record[2],
                "currency": record[3],
                "account": account,
                "category": category,
                "subcategory": record[8],
                "note": record[9],
                "source_file": record[10],
                "last_seen_at": record[11],
                "is_deleted": record[12],
            },
        )

    # Step 3: Drop transfers table
    op.drop_index("ix_transfers_from_to", table_name="transfers")
    op.drop_index("ix_transfers_date_type", table_name="transfers")
    op.drop_index("ix_transfers_is_deleted", table_name="transfers")
    op.drop_index("ix_transfers_last_seen_at", table_name="transfers")
    op.drop_index("ix_transfers_category", table_name="transfers")
    op.drop_index("ix_transfers_to_account", table_name="transfers")
    op.drop_index("ix_transfers_from_account", table_name="transfers")
    op.drop_index("ix_transfers_type", table_name="transfers")
    op.drop_index("ix_transfers_date", table_name="transfers")
    op.drop_table("transfers")
    # ### end Alembic commands ###
