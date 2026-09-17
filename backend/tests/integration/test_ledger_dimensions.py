"""Dimension identity, tenant boundaries, and bounded database round trips."""

from datetime import UTC, datetime
from decimal import Decimal
from importlib import import_module

import pytest
import sqlalchemy as sa
from sqlalchemy.orm import Session

from ledger_sync.db.base import Base
from ledger_sync.db.models import Transaction, TransactionType, User
from tests.integration.test_migrations_from_scratch import (
    migration_connection as _migration_connection,
)

migration_connection = _migration_connection


def _service():
    return import_module("ledger_sync.services.ledger_dimensions")


@pytest.fixture
def dimension_db(migration_connection):
    # Explicit import until the main task adds the public model exports.
    import_module("ledger_sync.db._models.ledger_dimensions")
    connection = migration_connection
    if connection.dialect.name == "sqlite":
        connection.exec_driver_sql("PRAGMA foreign_keys=ON")
    Base.metadata.create_all(connection)
    connection.commit()
    with Session(connection) as session:
        session.add_all([User(id=i, email=f"dimension-{i}@example.test") for i in (1, 2)])
        session.commit()
        yield session


def test_batch_preserves_snapshots_and_resolves_case_without_fuzzy_merging(dimension_db):
    rows = [
        {"account": "Bank", "category": "Food", "subcategory": "Lunch"},
        {"account": "BANK", "category": "FOOD", "subcategory": "LUNCH"},
        {"account": " Bank ", "category": "Food", "subcategory": None},
        {"account": "Straße", "category": "Work", "subcategory": "Lunch"},
        {"account": "STRASSE", "category": "", "subcategory": None},
        {"account": "", "category": None, "subcategory": "Orphan label"},
        {
            "account": "Bank",
            "from_account": "BANK",
            "to_account": "Wallet",
            "category": "Transfer: Bank -> Wallet",
        },
    ]
    snapshots = [dict(row) for row in rows]
    result = _service().attach_ledger_dimensions(dimension_db, 1, rows)
    assert result is rows
    for before, after in zip(snapshots, rows, strict=True):
        assert {key: after[key] for key in before} == before
    assert rows[0]["account_id"] == rows[1]["account_id"] == rows[6]["from_account_id"]
    assert rows[0]["category_id"] == rows[1]["category_id"]
    assert rows[0]["subcategory_id"] == rows[1]["subcategory_id"]
    assert rows[3]["subcategory_id"] != rows[0]["subcategory_id"]
    assert rows[2]["account_id"] != rows[0]["account_id"]
    assert rows[3]["account_id"] != rows[4]["account_id"]
    assert rows[5]["account_id"] is None
    assert rows[5]["category_id"] is None
    assert rows[5]["subcategory_id"] is None
    account_id = rows[0]["account_id"]
    _service().attach_ledger_dimensions(dimension_db, 1, rows)
    assert rows[0]["account_id"] == account_id
    other = [{"account": "Bank", "category": "Food", "subcategory": "Lunch"}]
    _service().attach_ledger_dimensions(dimension_db, 2, other)
    for field in ("account_id", "category_id", "subcategory_id"):
        assert other[0][field] != rows[0][field]


def test_repeated_and_distinct_rows_are_resolved_in_table_chunks(dimension_db):
    statements = []
    connection = dimension_db.connection()

    def capture(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    sa.event.listen(connection, "before_cursor_execute", capture)
    try:
        repeated = [
            {"account": "Bank", "category": "Food", "subcategory": "Lunch"} for _ in range(1200)
        ]
        _service().attach_ledger_dimensions(dimension_db, 1, repeated)
        assert len(statements) <= 12
        statements.clear()
        distinct = [
            {"account": f"Bank {i}", "category": f"Food {i}", "subcategory": f"Meal {i}"}
            for i in range(1200)
        ]
        _service().attach_ledger_dimensions(dimension_db, 1, distinct)
        assert len(statements) <= 100
        assert len({row["account_id"] for row in distinct}) == 1200
        statements.clear()
        _service().attach_ledger_dimensions(dimension_db, 1, [])
        assert statements == []
    finally:
        sa.event.remove(connection, "before_cursor_execute", capture)


def test_pending_and_edited_transactions_resolve_without_autoflush_or_commit(dimension_db):
    txn = Transaction(
        transaction_id="a" * 64,
        user_id=1,
        date=datetime(2026, 9, 17, tzinfo=UTC),
        amount=Decimal("123.45"),
        type=TransactionType.EXPENSE,
        account="Bank",
        category="Food",
        subcategory="Lunch",
        source_file="manual",
    )
    dimension_db.add(txn)
    _service().sync_transaction_dimensions(dimension_db, txn)
    assert sa.inspect(txn).pending  # helper never flushes the pending financial row
    first_category = txn.category_id
    assert txn.account_id and txn.subcategory_id
    dimension_db.flush()
    txn.category = "Work"
    txn.subcategory = None
    txn.from_account = "Bank"
    txn.to_account = "Wallet"
    _service().sync_transactions_dimensions(dimension_db, 1, [txn])
    assert txn.category_id != first_category
    assert txn.subcategory_id is None
    assert txn.from_account_id == txn.account_id
    assert txn.to_account_id != txn.account_id
    assert txn.amount == Decimal("123.45")
    dimension_db.rollback()
    assert dimension_db.scalar(sa.select(sa.func.count()).select_from(Transaction)) == 0
    accounts = Base.metadata.tables["ledger_accounts"]
    assert dimension_db.scalar(sa.select(sa.func.count()).select_from(accounts)) == 0


def test_foreign_tenant_transaction_is_rejected_before_writes(dimension_db):
    txn = Transaction(user_id=2, account="Bank", category="Food")
    with pytest.raises(ValueError, match="user"):
        _service().sync_transactions_dimensions(dimension_db, 1, [txn])
    accounts = Base.metadata.tables["ledger_accounts"]
    assert dimension_db.scalar(sa.select(sa.func.count()).select_from(accounts)) == 0


def test_dimension_parent_and_alias_ownership_constraints(dimension_db):
    rows = [{"account": "Bank", "category": "Food", "subcategory": "Lunch"}]
    _service().attach_ledger_dimensions(dimension_db, 1, rows)
    models = import_module("ledger_sync.db._models.ledger_dimensions")
    with pytest.raises(sa.exc.IntegrityError), dimension_db.begin_nested():
        dimension_db.execute(
            sa.insert(models.LedgerAccountAlias).values(
                user_id=2, account_id=rows[0]["account_id"], source_key="bank", label="BANK"
            )
        )
    with pytest.raises(sa.exc.IntegrityError), dimension_db.begin_nested():
        dimension_db.execute(
            sa.insert(models.LedgerSubcategory).values(
                user_id=2, category_id=rows[0]["category_id"], key="lunch", name="Lunch"
            )
        )


@pytest.mark.parametrize(
    ("bad_row", "error"),
    [
        ({"user_id": 2, "account": "Bank", "category": "Food"}, ValueError),
        ({"account": 123, "category": "Food"}, TypeError),
    ],
)
def test_invalid_row_rejects_whole_batch_before_dimension_writes(dimension_db, bad_row, error):
    rows = [{"account": "Bank", "category": "Food"}, bad_row]
    with pytest.raises(error):
        _service().attach_ledger_dimensions(dimension_db, 1, rows)
    accounts = Base.metadata.tables["ledger_accounts"]
    assert dimension_db.scalar(sa.select(sa.func.count()).select_from(accounts)) == 0
    assert "account_id" not in rows[0]
