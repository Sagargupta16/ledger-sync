"""Frozen live-index DDL, preservation, and actual PostgreSQL query plans."""

from datetime import timedelta
from importlib import import_module

import pytest
import sqlalchemy as sa
from alembic import command
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.orm import Session

from ledger_sync.api.transaction_pagination import transaction_page
from ledger_sync.api.transactions import SearchFilters, _apply_search_filters, _apply_sorting
from ledger_sync.db.models import Transaction, TransactionType
from tests.integration.test_migrations_from_scratch import (
    migration_connection as _migration_connection,
)
from tests.integration.test_schema_integrity import MOMENT, _config, _insert, _seed_users

migration_connection = _migration_connection
REVISION = "live_index_predicates_2026"
PREDECESSOR = "scheduled_references_2026"
INDEXES = {
    "ix_transactions_user_date": ["user_id", "date"],
    "ix_transactions_user_type_date": ["user_id", "type", "date"],
    "ix_transactions_user_category": ["user_id", "category"],
    "ix_transactions_user_account": ["user_id", "account"],
    "ix_transactions_user_from_account": ["user_id", "from_account"],
    "ix_transactions_user_to_account": ["user_id", "to_account"],
}


def _migration():
    return import_module("ledger_sync.db.migrations.versions.20260917_1600_live_index_predicates")


def _indexes(connection):
    return {
        index["name"]: index
        for index in sa.inspect(connection).get_indexes("transactions")
        if index["name"] in INDEXES
    }


def _predicate(value):
    return str(value).strip("()").lower()


@pytest.mark.parametrize(
    ("dialect", "expected"),
    [(postgresql.dialect(), "is_deleted IS false"), (sqlite.dialect(), "is_deleted IS 0")],
)
def test_model_live_predicates_match_application_filter(dialect, expected):
    indexes = {index.name: index for index in Transaction.__table__.indexes}
    for name, columns in INDEXES.items():
        index = indexes[name]
        assert [column.name for column in index.columns] == columns
        assert str(index.dialect_options[dialect.name]["where"]) == expected
        query = sa.select(Transaction).where(Transaction.is_deleted.is_(False))
        assert expected in str(query.compile(dialect=dialect))


def test_upgrade_matches_model_and_preserves_rows_children_and_other_indexes(
    migration_connection,
):
    connection = migration_connection
    command.upgrade(_config(connection), PREDECESSOR)
    _seed_users(connection)
    for user_id, deleted in ((1, False), (1, True), (2, False)):
        identity = f"{user_id}-{deleted}"
        _insert(
            connection,
            "transactions",
            transaction_id=identity,
            user_id=user_id,
            date=MOMENT,
            amount="12.34",
            type="EXPENSE",
            account="Original BANK",
            category="Original Food",
            is_deleted=deleted,
            source_file="synthetic.csv",
        )
        _insert(
            connection, "transaction_tags", user_id=user_id, transaction_id=identity, tag="keep"
        )
    connection.commit()
    before_rows = connection.exec_driver_sql(
        "SELECT * FROM transactions ORDER BY transaction_id"
    ).all()
    before_children = connection.exec_driver_sql("SELECT * FROM transaction_tags ORDER BY id").all()
    before_indexes = sa.inspect(connection).get_indexes("transactions")
    before_sqlite = (
        connection.exec_driver_sql(
            "SELECT type, name, sql FROM sqlite_master ORDER BY type, name"
        ).all()
        if connection.dialect.name == "sqlite"
        else None
    )
    command.upgrade(_config(connection), REVISION)
    connection.commit()
    assert (
        connection.exec_driver_sql("SELECT * FROM transactions ORDER BY transaction_id").all()
        == before_rows
    )
    assert (
        connection.exec_driver_sql("SELECT * FROM transaction_tags ORDER BY id").all()
        == before_children
    )
    indexes = _indexes(connection)
    models = {index.name: index for index in Transaction.__table__.indexes}
    assert indexes.keys() == INDEXES.keys()
    for name, columns in INDEXES.items():
        assert indexes[name]["column_names"] == columns
        assert not indexes[name]["unique"]
        actual = indexes[name]["dialect_options"][f"{connection.dialect.name}_where"]
        expected = models[name].dialect_options[connection.dialect.name]["where"]
        assert _predicate(actual) == _predicate(expected)

    # Compare complete compiled definitions for unrelated indexes.
    def unrelated(indexes):
        return [str(index) for index in indexes if index["name"] not in INDEXES]

    assert unrelated(sa.inspect(connection).get_indexes("transactions")) == unrelated(
        before_indexes
    )
    if before_sqlite is not None:
        assert (
            connection.exec_driver_sql(
                "SELECT type, name, sql FROM sqlite_master ORDER BY type, name"
            ).all()
            == before_sqlite
        )
        assert connection.exec_driver_sql("PRAGMA foreign_key_check").all() == []
    # Explicitly rerunning the frozen operation is safe for already corrected definitions.
    with Operations.context(MigrationContext.configure(connection)):
        _migration().upgrade()
    connection.commit()


@pytest.mark.parametrize("drift", ["missing", "columns", "predicate"])
def test_pg_preflight_rejects_drift_before_replacing_any_index(migration_connection, drift):
    connection = migration_connection
    if connection.dialect.name != "postgresql":
        pytest.skip("PostgreSQL index replacement only")
    command.upgrade(_config(connection), PREDECESSOR)
    connection.exec_driver_sql("DROP INDEX ix_transactions_user_to_account")
    if drift != "missing":
        definition = (
            "(user_id, category) WHERE is_deleted = false"
            if drift == "columns"
            else "(user_id, to_account) WHERE is_deleted = true"
        )
        connection.exec_driver_sql(
            "CREATE INDEX ix_transactions_user_to_account ON transactions " + definition
        )
    connection.commit()
    before = connection.exec_driver_sql(
        "SELECT indexrelid FROM pg_index WHERE indrelid='transactions'::regclass ORDER BY 1"
    ).all()
    with pytest.raises(RuntimeError, match="preflight"):
        with Operations.context(MigrationContext.configure(connection)):
            _migration().upgrade()
    # The rejection itself happened before any DDL, even before caller rollback.
    assert (
        connection.exec_driver_sql(
            "SELECT indexrelid FROM pg_index WHERE indrelid='transactions'::regclass ORDER BY 1"
        ).all()
        == before
    )
    connection.rollback()


def test_pg_index_replacement_rolls_back_atomically_and_downgrades(migration_connection):
    connection = migration_connection
    if connection.dialect.name != "postgresql":
        pytest.skip("PostgreSQL transactional DDL only")
    command.upgrade(_config(connection), PREDECESSOR)
    connection.commit()
    before = connection.exec_driver_sql(
        "SELECT indexrelid FROM pg_index WHERE indrelid='transactions'::regclass ORDER BY 1"
    ).all()
    with Operations.context(MigrationContext.configure(connection)):
        _migration().upgrade()
    assert all(
        _predicate(index["dialect_options"]["postgresql_where"]) == "is_deleted is false"
        for index in _indexes(connection).values()
    )
    connection.rollback()
    assert (
        connection.exec_driver_sql(
            "SELECT indexrelid FROM pg_index WHERE indrelid='transactions'::regclass ORDER BY 1"
        ).all()
        == before
    )
    command.upgrade(_config(connection), REVISION)
    connection.commit()
    command.downgrade(_config(connection), PREDECESSOR)
    connection.commit()
    assert all(
        _predicate(index["dialect_options"]["postgresql_where"]) == "is_deleted = false"
        for index in _indexes(connection).values()
    )


def _plan_nodes(node):
    yield node
    for child in node.get("Plans", []):
        yield from _plan_nodes(child)


def test_pg_actual_page_and_exact_count_use_partial_date_index(migration_connection):
    connection = migration_connection
    if connection.dialect.name != "postgresql":
        pytest.skip("Real PostgreSQL planner regression")
    command.upgrade(_config(connection), REVISION)
    _seed_users(connection)
    connection.execute(
        sa.insert(Transaction),
        [
            {
                "transaction_id": f"{user_id:04x}{number:060x}",
                "user_id": user_id,
                "date": MOMENT + timedelta(days=number // 50),
                "amount": 12,
                "type": TransactionType.EXPENSE,
                "account": "Cash",
                "category": "Food",
                "source_file": "synthetic.csv",
                "is_deleted": False,
            }
            for user_id in (1, 2)
            for number in range(10_000)
        ],
    )
    connection.commit()
    connection.exec_driver_sql("ANALYZE transactions")
    captured = []

    def record(conn, cursor, statement, parameters, context, executemany):
        captured.append((statement, parameters))

    with Session(connection) as session:
        query = session.query(Transaction).filter(
            Transaction.user_id == 1, Transaction.is_deleted.is_(False)
        )
        query = _apply_search_filters(query, SearchFilters(start_date=MOMENT + timedelta(days=197)))
        query = _apply_sorting(query, "date", "desc")
        sa.event.listen(connection, "before_cursor_execute", record)
        try:
            rows, total, *_ = transaction_page(query, limit=25, offset=0, cursor=None, context=None)
        finally:
            sa.event.remove(connection, "before_cursor_execute", record)
        assert len(rows) == 25
        assert total == 150
        assert len(captured) == 2
        assert sum("count(" in sql.lower() for sql, _ in captured) == 1
        for sql, parameters in captured:
            assert "is_deleted IS false" in sql
            plan = connection.exec_driver_sql(
                "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + sql, parameters
            ).scalar_one()[0]["Plan"]
            assert "ix_transactions_user_date" in {
                node.get("Index Name") for node in _plan_nodes(plan)
            }
