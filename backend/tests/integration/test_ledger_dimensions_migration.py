"""Frozen ledger-dimension backfill on isolated, populated databases."""

from decimal import Decimal
from importlib import import_module
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations

from tests.integration.test_migrations_from_scratch import (
    migration_connection as _migration_connection,
)
from tests.integration.test_schema_integrity import MOMENT, _child, _config, _insert, _seed_users

migration_connection = _migration_connection


def test_revisions_1000_through_1500_preserve_populated_legacy_history(migration_connection):
    connection = migration_connection
    command.upgrade(_config(connection), "identity_constraints_2026")
    _seed_users(connection)
    for owner in (1, 2):
        identity = f"legacy-{owner}"
        _insert(
            connection,
            "transactions",
            transaction_id=identity,
            user_id=owner,
            date=MOMENT,
            amount=Decimal("123.45"),
            currency="INR",
            type="EXPENSE",
            account="Bank",
            category="Food",
            subcategory="Lunch",
            source_file="synthetic.csv",
            note="Keep financial history",
            is_deleted=owner == 2,
        )
        for child in ("transaction_tags", "anomalies"):
            _child(connection, child, user_id=owner, transaction_id=identity)
        _insert(
            connection,
            "budgets",
            user_id=owner,
            category="Food",
            subcategory=None,
            monthly_limit=Decimal("321.09"),
        )
        _insert(
            connection,
            "import_logs",
            user_id=owner,
            file_hash=str(owner) * 64,
            file_name="synthetic.csv",
        )
        _insert(
            connection,
            "user_preferences",
            user_id=owner,
            preferred_tax_regime="old",
            essential_categories='["Preserve choices"]',
        )
        parent = _insert(
            connection,
            "recurring_transactions",
            user_id=owner,
            pattern_name="Rent",
            category="Housing",
            account="Bank",
            transaction_type="EXPENSE",
            frequency="MONTHLY",
            expected_amount=100,
        )
        _insert(
            connection,
            "scheduled_transactions",
            user_id=owner,
            recurring_transaction_id=parent,
            name="User plan",
            category="Housing",
            account="Bank",
            amount=125,
            type="EXPENSE",
            frequency="QUARTERLY",
            next_due_date=MOMENT,
            note="Keep this schedule",
        )
    connection.commit()
    preserved = {}
    for name in (
        "users",
        "transactions",
        "transaction_tags",
        "anomalies",
        "budgets",
        "import_logs",
        "user_preferences",
        "recurring_transactions",
        "scheduled_transactions",
    ):
        table = sa.Table(name, sa.MetaData(), autoload_with=connection)
        query = sa.select(table).order_by(*table.primary_key.columns)
        preserved[name] = (query, connection.execute(query).all())

    command.upgrade(_config(connection), "scheduled_references_2026")
    connection.commit()
    if connection.dialect.name == "sqlite":
        connection.exec_driver_sql("PRAGMA foreign_keys=ON")
        assert connection.exec_driver_sql("PRAGMA foreign_key_check").all() == []
    for name, (query, before) in preserved.items():
        assert connection.execute(query).all() == before, name
    rows = connection.execute(
        sa.text(
            "SELECT account_id, category_id, subcategory_id, source_fingerprint, "
            "fingerprint_version FROM transactions ORDER BY user_id"
        )
    ).all()
    assert all(all(value is not None for value in row[:3]) for row in rows)
    assert rows[0][:3] != rows[1][:3]
    assert all(row[3:] == (None, 1) for row in rows)


def test_backfill_keeps_all_financial_rows_labels_and_children(migration_connection):
    migration = import_module("ledger_sync.db.migrations.versions.20260917_1300_ledger_dimensions")
    connection = migration_connection
    connection.exec_driver_sql("CREATE TABLE users (id INTEGER PRIMARY KEY)")
    connection.exec_driver_sql("INSERT INTO users VALUES (1), (2)")
    connection.exec_driver_sql(
        "CREATE TABLE transactions (transaction_id VARCHAR(64) PRIMARY KEY, "
        "user_id INTEGER NOT NULL REFERENCES users(id), "
        "account VARCHAR(255), from_account VARCHAR(255), to_account VARCHAR(255), "
        "category VARCHAR(255), subcategory VARCHAR(255), amount NUMERIC(15,2), "
        "date TIMESTAMP DEFAULT '2026-09-17 13:00:00', currency VARCHAR(10) DEFAULT 'INR', "
        "note TEXT DEFAULT 'preserve this note', source_fingerprint VARCHAR(64), "
        "fingerprint_version INTEGER DEFAULT 1, "
        "created_at TIMESTAMP DEFAULT '2026-09-17 13:00:00', "
        "updated_at TIMESTAMP DEFAULT '2026-09-17 13:00:00', "
        "is_deleted BOOLEAN NOT NULL DEFAULT FALSE, "
        "CONSTRAINT uq_transactions_user_id UNIQUE (user_id, transaction_id))"
    )
    connection.exec_driver_sql(
        "CREATE TABLE transaction_tags (id INTEGER PRIMARY KEY, "
        "transaction_id VARCHAR(64) REFERENCES transactions(transaction_id) ON DELETE CASCADE, "
        "tag TEXT)"
    )
    connection.execute(
        sa.text(
            "INSERT INTO transactions "
            "(transaction_id, user_id, account, from_account, to_account, category, "
            "subcategory, amount, is_deleted) "
            "VALUES (:id, :user, :account, :from_account, :to_account, :category, "
            ":subcategory, :amount, :deleted)"
        ),
        [
            {
                "id": "a",
                "user": 1,
                "account": "Bank",
                "from_account": None,
                "to_account": None,
                "category": "Food",
                "subcategory": "Lunch",
                "amount": "12.34",
                "deleted": False,
            },
            {
                "id": "b",
                "user": 1,
                "account": "BANK",
                "from_account": "Bank",
                "to_account": "Wallet",
                "category": "FOOD",
                "subcategory": "LUNCH",
                "amount": "-9.00",
                "deleted": True,
            },
            {
                "id": "c",
                "user": 2,
                "account": "Bank",
                "from_account": None,
                "to_account": None,
                "category": "Food",
                "subcategory": "Lunch",
                "amount": "0.01",
                "deleted": False,
            },
            {
                "id": "d",
                "user": 1,
                "account": "Wallet",
                "from_account": None,
                "to_account": None,
                "category": "Work",
                "subcategory": "Lunch",
                "amount": "24.68",
                "deleted": False,
            },
            {
                "id": "e",
                "user": 1,
                "account": "İBANK",
                "from_account": None,
                "to_account": None,
                "category": "",
                "subcategory": "Orphan",
                "amount": "10.00",
                "deleted": False,
            },
            {
                "id": "f",
                "user": 1,
                "account": "i̇bank",
                "from_account": None,
                "to_account": None,
                "category": None,
                "subcategory": None,
                "amount": "1.00",
                "deleted": False,
            },
        ],
    )
    connection.exec_driver_sql("INSERT INTO transaction_tags VALUES (7, 'b', 'keep')")
    # Cross multiple backfill pages; the final page introduces new dimensions.
    connection.execute(
        sa.text(
            "INSERT INTO transactions (transaction_id, user_id, account, category, subcategory) "
            "VALUES (:id, 1, :account, :category, :subcategory)"
        ),
        [
            {
                "id": f"g{index:04}",
                "account": "Late account" if index == 1000 else "BANK",
                "category": "Late category" if index == 1000 else "FOOD",
                "subcategory": "Late subcategory" if index == 1000 else "LUNCH",
            }
            for index in range(1001)
        ],
    )
    snapshots = connection.execute(sa.text("SELECT * FROM transactions ORDER BY 1")).all()
    children = connection.execute(sa.text("SELECT * FROM transaction_tags")).all()
    connection.commit()
    with Operations.context(MigrationContext.configure(connection)):
        migration.upgrade()
    connection.commit()
    if connection.dialect.name == "sqlite":
        connection.exec_driver_sql("PRAGMA foreign_keys=ON")
        assert connection.exec_driver_sql("PRAGMA foreign_key_check").all() == []
    rows = (
        connection.execute(sa.text("SELECT * FROM transactions ORDER BY transaction_id"))
        .mappings()
        .all()
    )
    legacy_columns = snapshots[0]._fields
    assert [tuple(row[key] for key in legacy_columns) for row in rows] == snapshots
    assert connection.execute(sa.text("SELECT * FROM transaction_tags")).all() == children
    # A rerun (also covering create_all-first installations) must keep stable IDs.
    with Operations.context(MigrationContext.configure(connection)):
        migration.upgrade()
    repeated = (
        connection.execute(sa.text("SELECT * FROM transactions ORDER BY transaction_id"))
        .mappings()
        .all()
    )
    assert repeated == rows
    assert connection.execute(sa.text("SELECT * FROM transaction_tags")).all() == children

    assert rows[0]["account_id"] == rows[1]["account_id"] == rows[1]["from_account_id"]
    assert rows[0]["category_id"] == rows[1]["category_id"]
    assert rows[0]["subcategory_id"] == rows[1]["subcategory_id"]
    assert rows[2]["account_id"] != rows[0]["account_id"]
    assert rows[2]["category_id"] != rows[0]["category_id"]
    assert rows[3]["subcategory_id"] != rows[0]["subcategory_id"]
    assert rows[4]["account_id"] == rows[5]["account_id"]  # Python lower, including Unicode
    assert rows[4]["category_id"] is None and rows[4]["subcategory_id"] is None
    assert rows[-2]["account_id"] == rows[0]["account_id"]
    assert rows[-2]["subcategory_id"] == rows[0]["subcategory_id"]
    assert rows[-1]["account_id"] is not None and rows[-1]["account_id"] != rows[0]["account_id"]
    assert rows[-1]["category_id"] is not None and rows[-1]["category_id"] != rows[0]["category_id"]
    assert rows[-1]["subcategory_id"] is not None
    for values in (
        {"account_id": rows[2]["account_id"]},
        {"from_account_id": rows[2]["account_id"]},
        {"to_account_id": rows[2]["account_id"]},
        {"category_id": rows[2]["category_id"], "subcategory_id": None},
        {"subcategory_id": rows[3]["subcategory_id"]},
        {"category_id": None, "subcategory_id": rows[0]["subcategory_id"]},
    ):
        table = sa.Table("transactions", sa.MetaData(), autoload_with=connection)
        with pytest.raises(sa.exc.IntegrityError), connection.begin_nested():
            connection.execute(table.update().where(table.c.transaction_id == "a").values(**values))
    assert connection.execute(sa.text("SELECT * FROM transaction_tags")).all() == children


@pytest.mark.parametrize("foreign_keys_enabled", [False, True])
def test_sqlite_unsafe_migration_rolls_back_without_changing_legacy_rows(foreign_keys_enabled):
    migration = import_module("ledger_sync.db.migrations.versions.20260917_1300_ledger_dimensions")
    engine = sa.create_engine("sqlite:///:memory:")
    with engine.connect() as connection:
        connection.exec_driver_sql("CREATE TABLE users (id INTEGER PRIMARY KEY)")
        connection.exec_driver_sql(
            "CREATE TABLE transactions (transaction_id TEXT PRIMARY KEY, user_id INTEGER, "
            "account TEXT, from_account TEXT, to_account TEXT, category TEXT, subcategory TEXT)"
        )
        connection.exec_driver_sql(
            "INSERT INTO transactions VALUES ('keep', 999, 'Bank', NULL, NULL, 'Food', 'Lunch')"
        )
        connection.commit()
        before = connection.exec_driver_sql("SELECT * FROM transactions").all()
        if foreign_keys_enabled:
            connection.exec_driver_sql("PRAGMA foreign_keys=ON")
        message = (
            "dedicated SQLite connection" if foreign_keys_enabled else "Foreign key validation"
        )
        with (
            pytest.raises(RuntimeError, match=message),
            Operations.context(MigrationContext.configure(connection)),
        ):
            migration.upgrade()
        connection.rollback()
        inspector = sa.inspect(connection)
        assert not inspector.has_table("ledger_accounts")
        assert "account_id" not in {
            column["name"] for column in inspector.get_columns("transactions")
        }
        assert connection.exec_driver_sql("SELECT * FROM transactions").all() == before
    engine.dispose()


def test_cli_migration_engine_uses_safe_sqlite_default(tmp_path):
    """Exercise env.py's engine construction, as CLI runs do, with a test-only URL."""
    config = Config()
    migrations = Path(__file__).resolve().parents[2] / "src/ledger_sync/db/migrations"
    config.set_main_option("script_location", migrations.as_posix())
    url = f"sqlite:///{(tmp_path / 'dimension-cli.db').as_posix()}"
    config.attributes["database_url"] = url
    pragma_values = []

    def record_foreign_keys(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        try:
            cursor.execute("PRAGMA foreign_keys")
            pragma_values.append(cursor.fetchone()[0])
        finally:
            cursor.close()

    sa.event.listen(sa.Engine, "connect", record_foreign_keys)
    try:
        command.upgrade(config, "ledger_dimensions_2026")
    finally:
        sa.event.remove(sa.Engine, "connect", record_foreign_keys)
    assert pragma_values and all(value == 0 for value in pragma_values)
    engine = sa.create_engine(url)
    with engine.connect() as connection:
        connection.exec_driver_sql("PRAGMA foreign_keys=ON")
        assert connection.exec_driver_sql("PRAGMA foreign_key_check").all() == []
        assert connection.exec_driver_sql("SELECT version_num FROM alembic_version").scalar() == (
            "ledger_dimensions_2026"
        )
        assert sa.inspect(connection).has_table("ledger_subcategories")
    engine.dispose()
