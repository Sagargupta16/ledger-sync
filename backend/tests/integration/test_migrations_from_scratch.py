"""Exercise actual migrations and identity constraints on isolated databases.

SQLite runs everywhere. PostgreSQL runs when LEDGER_SYNC_TEST_POSTGRES_URL
points to a local disposable database named ledger_sync_test*. Each PostgreSQL
case owns a new schema, so no application tables or local environment files are
read. CI starts an isolated native PostgreSQL cluster and requires both dialects.
"""

from __future__ import annotations

import os
from collections.abc import Generator
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from threading import Barrier
from uuid import uuid4

import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from alembic.util import CommandError
from fastapi import HTTPException
from sqlalchemy.orm import Session

from ledger_sync.api.ai_usage import reserve_usage
from ledger_sync.config.settings import settings
from ledger_sync.db import models  # noqa: F401
from ledger_sync.db.base import Base

MIGRATIONS = Path(__file__).resolve().parents[2] / "src/ledger_sync/db/migrations"
IDENTITY_REVISION = "identity_constraints_2026"
IDENTITY_PREDECESSOR = "ai_usage_reservations_2026"


def _config(connection: sa.Connection) -> Config:
    config = Config()
    config.set_main_option("script_location", MIGRATIONS.as_posix())
    config.attributes["connection"] = connection
    return config


@pytest.fixture(params=["sqlite", "postgresql"])
def migration_connection(
    request: pytest.FixtureRequest, tmp_path: Path
) -> Generator[sa.Connection]:
    schema = None
    if request.param == "postgresql":
        url = os.environ.get("LEDGER_SYNC_TEST_POSTGRES_URL")
        if not url:
            pytest.skip("Set LEDGER_SYNC_TEST_POSTGRES_URL to run local PostgreSQL migrations")
        parsed = sa.make_url(url)
        if parsed.host not in {"localhost", "127.0.0.1", "::1"} or not (
            parsed.database or ""
        ).startswith("ledger_sync_test"):
            pytest.fail("PostgreSQL migration tests require a local ledger_sync_test* database")
        engine = sa.create_engine(parsed)
        schema = f"ledger_sync_migration_{uuid4().hex}"
    else:
        engine = sa.create_engine(f"sqlite:///{(tmp_path / 'migrations.db').as_posix()}")

    with engine.connect() as connection:
        if schema:
            connection.execute(sa.schema.CreateSchema(schema))
            connection.exec_driver_sql(f'SET search_path TO "{schema}"')
            connection.commit()
        try:
            yield connection
        finally:
            connection.rollback()
            if schema:
                connection.exec_driver_sql("SET search_path TO public")
                connection.execute(sa.schema.DropSchema(schema, cascade=True))
                connection.commit()
    engine.dispose()


@pytest.fixture
def migrated_db(migration_connection: sa.Connection) -> sa.Connection:
    command.upgrade(_config(migration_connection), "head")
    migration_connection.commit()
    if migration_connection.dialect.name == "sqlite":
        migration_connection.exec_driver_sql("PRAGMA foreign_keys=ON")
        migration_connection.commit()
    return migration_connection


def _unique_keys(inspector: sa.Inspector, table: str) -> set[tuple[str, ...]]:
    constraints = {
        tuple(sorted(item["column_names"])) for item in inspector.get_unique_constraints(table)
    }
    indexes = {
        tuple(sorted(item["column_names"]))
        for item in inspector.get_indexes(table)
        if item["unique"]
    }
    return constraints | indexes


def test_upgrade_reaches_current_head_and_is_idempotent(migrated_db: sa.Connection) -> None:
    config = _config(migrated_db)
    expected_head = ScriptDirectory.from_config(config).get_current_head()
    before = migrated_db.execute(sa.text("SELECT version_num FROM alembic_version")).scalar_one()

    command.upgrade(config, "head")
    after = migrated_db.execute(sa.text("SELECT version_num FROM alembic_version")).scalar_one()

    assert before == after == expected_head


def test_migrated_tables_and_columns_match_orm(migrated_db: sa.Connection) -> None:
    inspector = sa.inspect(migrated_db)
    actual_tables = set(inspector.get_table_names()) - {"alembic_version"}
    assert actual_tables == set(Base.metadata.tables)
    for name, table in Base.metadata.tables.items():
        actual = {column["name"] for column in inspector.get_columns(name)}
        assert actual == {column.name for column in table.columns}, name
        assert inspector.get_pk_constraint(name)["constrained_columns"] == [
            column.name for column in table.primary_key.columns
        ], name


def test_migrated_unique_constraints_match_orm(migrated_db: sa.Connection) -> None:
    inspector = sa.inspect(migrated_db)
    for name, table in Base.metadata.tables.items():
        expected = {
            tuple(sorted(column.name for column in constraint.columns))
            for constraint in table.constraints
            if isinstance(constraint, sa.UniqueConstraint)
        } | {
            tuple(sorted(column.name for column in index.columns))
            for index in table.indexes
            if index.unique
        }
        assert _unique_keys(inspector, name) == expected, name


def test_migrated_foreign_keys_match_orm(migrated_db: sa.Connection) -> None:
    inspector = sa.inspect(migrated_db)
    for name, table in Base.metadata.tables.items():
        expected = {
            (
                tuple(constraint.column_keys),
                constraint.referred_table.name,
                tuple(element.column.name for element in constraint.elements),
                constraint.ondelete,
            )
            for constraint in table.foreign_key_constraints
        }
        actual = [
            (
                tuple(constraint["constrained_columns"]),
                constraint["referred_table"],
                tuple(constraint["referred_columns"]),
                constraint["options"].get("ondelete"),
            )
            for constraint in inspector.get_foreign_keys(name)
        ]
        assert len(actual) == len(set(actual)), f"duplicate foreign keys on {name}"
        assert set(actual) == expected, name


def test_migrated_check_constraints_match_orm(migrated_db: sa.Connection) -> None:
    inspector = sa.inspect(migrated_db)
    for name, table in Base.metadata.tables.items():
        expected = {
            constraint.name
            for constraint in table.constraints
            if isinstance(constraint, sa.CheckConstraint)
        }
        actual = {constraint["name"] for constraint in inspector.get_check_constraints(name)}
        assert actual == expected, name


def _insert_user(connection: sa.Connection, email: str, provider_id: str | None = None) -> int:
    statement = (
        Base.metadata.tables["users"]
        .insert()
        .values(
            email=email,
            auth_provider="google" if provider_id is not None else None,
            auth_provider_id=provider_id,
        )
        .returning(Base.metadata.tables["users"].c.id)
    )
    return connection.execute(statement).scalar_one()


def test_identity_constraint_rejects_duplicates_but_allows_legacy_users(
    migrated_db: sa.Connection,
) -> None:
    _insert_user(migrated_db, "one@example.test", "synthetic-subject")
    _insert_user(migrated_db, "legacy-one@example.test")
    _insert_user(migrated_db, "legacy-two@example.test")
    migrated_db.commit()

    with pytest.raises(sa.exc.IntegrityError), migrated_db.begin_nested():
        _insert_user(migrated_db, "two@example.test", "synthetic-subject")


def test_cascade_and_orphan_rejection_work_in_migrated_database(
    migrated_db: sa.Connection,
) -> None:
    user_id = _insert_user(migrated_db, "owner@example.test")
    views = Base.metadata.tables["saved_filter_views"]
    migrated_db.execute(views.insert().values(user_id=user_id, name="Synthetic view", filters="{}"))
    migrated_db.commit()

    migrated_db.execute(
        Base.metadata.tables["users"].delete().where(Base.metadata.tables["users"].c.id == user_id)
    )
    assert migrated_db.execute(sa.select(sa.func.count()).select_from(views)).scalar_one() == 0
    with pytest.raises(sa.exc.IntegrityError), migrated_db.begin_nested():
        migrated_db.execute(
            views.insert().values(user_id=user_id, name="Orphan view", filters="{}")
        )


def test_historical_downgrade_rejects_entire_plan_before_changes(
    migration_connection: sa.Connection,
) -> None:
    # The first rollback step here has a real downgrade. A later irreversible
    # revision must be caught before that first step drops any columns.
    migrated_db = migration_connection
    command.upgrade(_config(migrated_db), "c1511eec274c")
    migrated_db.commit()
    revision = migrated_db.execute(sa.text("SELECT version_num FROM alembic_version")).scalar_one()
    before = {
        name: tuple(column["name"] for column in sa.inspect(migrated_db).get_columns(name))
        for name in sa.inspect(migrated_db).get_table_names()
    }

    with pytest.raises(CommandError, match="no supported downgrade"):
        command.downgrade(_config(migrated_db), "base")

    after = {
        name: tuple(column["name"] for column in sa.inspect(migrated_db).get_columns(name))
        for name in sa.inspect(migrated_db).get_table_names()
    }
    assert after == before
    assert (
        migrated_db.execute(sa.text("SELECT version_num FROM alembic_version")).scalar_one()
        == revision
    )


def test_identity_repair_preserves_existing_users_and_children(
    migration_connection: sa.Connection,
) -> None:
    connection = migration_connection
    command.upgrade(_config(connection), IDENTITY_PREDECESSOR)
    connection.commit()
    user_id = _insert_user(connection, "existing@example.test", "existing-subject")
    views = Base.metadata.tables["saved_filter_views"]
    connection.execute(views.insert().values(user_id=user_id, name="Keep me", filters="{}"))
    connection.commit()

    command.upgrade(_config(connection), IDENTITY_REVISION)

    assert connection.execute(sa.select(views.c.name).where(views.c.user_id == user_id)).all() == [
        ("Keep me",)
    ]
    assert (
        connection.execute(
            sa.select(Base.metadata.tables["users"].c.email).where(
                Base.metadata.tables["users"].c.id == user_id
            )
        ).scalar_one()
        == "existing@example.test"
    )


def test_sqlite_identity_repair_refuses_duplicate_owners_without_changes(
    migration_connection: sa.Connection,
) -> None:
    connection = migration_connection
    if connection.dialect.name != "sqlite":
        pytest.skip("Historical PostgreSQL already enforces the identity constraint")
    command.upgrade(_config(connection), IDENTITY_PREDECESSOR)
    _insert_user(connection, "first@example.test", "conflicting-subject")
    _insert_user(connection, "second@example.test", "conflicting-subject")
    connection.commit()
    indexes_before = sa.inspect(connection).get_indexes("users")

    with pytest.raises(RuntimeError, match="No accounts were merged or deleted"):
        command.upgrade(_config(connection), IDENTITY_REVISION)

    assert connection.execute(sa.text("SELECT version_num FROM alembic_version")).scalar_one() == (
        IDENTITY_PREDECESSOR
    )
    assert connection.execute(sa.text("SELECT COUNT(*) FROM users")).scalar_one() == 2
    assert sa.inspect(connection).get_indexes("users") == indexes_before


@pytest.mark.parametrize(
    ("table_name", "column_name"),
    [("budgets", "monthly_limit"), ("financial_goals", "target_amount")],
)
def test_migrated_amount_checks_reject_nonpositive_values(
    migrated_db: sa.Connection, table_name: str, column_name: str
) -> None:
    user_id = _insert_user(migrated_db, "amount-owner@example.test")
    values = (
        {"category": "Synthetic budget"}
        if table_name == "budgets"
        else {"name": "Synthetic goal", "goal_type": "savings"}
    )
    values.update({"user_id": user_id, column_name: 0})
    migrated_db.commit()

    with pytest.raises(sa.exc.IntegrityError), migrated_db.begin_nested():
        migrated_db.execute(Base.metadata.tables[table_name].insert().values(**values))


def test_identity_repair_preserves_invalid_amounts_and_revision_for_review(
    migration_connection: sa.Connection,
) -> None:
    connection = migration_connection
    command.upgrade(_config(connection), IDENTITY_PREDECESSOR)
    user_id = _insert_user(connection, "legacy-budget@example.test")
    budgets = Base.metadata.tables["budgets"]
    connection.execute(
        budgets.insert().values(user_id=user_id, category="Legacy budget", monthly_limit=0)
    )
    connection.commit()
    indexes_before = sa.inspect(connection).get_indexes("users")

    with pytest.raises(RuntimeError, match="No financial values were changed"):
        command.upgrade(_config(connection), IDENTITY_REVISION)

    assert connection.execute(sa.text("SELECT version_num FROM alembic_version")).scalar_one() == (
        IDENTITY_PREDECESSOR
    )
    assert connection.execute(sa.select(budgets.c.monthly_limit)).scalar_one() == 0
    assert sa.inspect(connection).get_indexes("users") == indexes_before


def test_users_can_store_the_same_month_in_migrated_database(migrated_db: sa.Connection) -> None:
    first_user = _insert_user(migrated_db, "first-month@example.test")
    second_user = _insert_user(migrated_db, "second-month@example.test")
    summaries = Base.metadata.tables["monthly_summaries"]

    for user_id in (first_user, second_user):
        migrated_db.execute(
            summaries.insert().values(user_id=user_id, year=2026, month=9, period_key="2026-09")
        )

    assert migrated_db.execute(sa.select(sa.func.count()).select_from(summaries)).scalar_one() == 2


def test_transfer_and_timestamp_migrations_preserve_populated_ledger(
    migration_connection: sa.Connection,
) -> None:
    connection = migration_connection
    config = _config(connection)
    command.upgrade(config, "343e4412d829")
    transfers = sa.Table("transfers", sa.MetaData(), autoload_with=connection)
    moment = datetime(2026, 9, 1, tzinfo=UTC)
    shared = {
        "date": moment,
        "amount": Decimal("125.50"),
        "currency": "INR",
        "from_account": "Synthetic bank",
        "to_account": "Synthetic savings",
        "category": "Transfer",
        "source_file": "synthetic.csv",
        "last_seen_at": moment,
        "is_deleted": False,
    }
    connection.execute(
        transfers.insert(),
        [
            {**shared, "transfer_id": "outgoing", "type": "TRANSFER_OUT"},
            {**shared, "transfer_id": "incoming", "type": "TRANSFER_IN"},
        ],
    )
    connection.commit()

    command.upgrade(config, "af63e055055a")
    ledger = sa.Table("transactions", sa.MetaData(), autoload_with=connection)
    row = connection.execute(sa.select(ledger)).mappings().one()

    assert row["transaction_id"] == "outgoing"
    assert row["type"] == "TRANSFER"
    assert row["amount"] == Decimal("125.50")
    assert row["from_account"] == "Synthetic bank"
    assert row["to_account"] == "Synthetic savings"
    assert row["created_at"] is not None
    assert row["updated_at"] is not None


def test_historical_timestamp_repair_works_on_both_dialects(
    migration_connection: sa.Connection,
) -> None:
    connection = migration_connection
    config = _config(connection)
    command.upgrade(config, "b1c2d3e4f5a6")
    # Reproduce the historically stamped schema with the two timestamp
    # columns missing, exclusively inside this owned disposable database.
    connection.exec_driver_sql("ALTER TABLE transactions DROP COLUMN created_at")
    connection.exec_driver_sql("ALTER TABLE transactions DROP COLUMN updated_at")
    connection.commit()

    command.upgrade(config, "c7f8a9b0d1e2")

    columns = {
        column["name"]: column for column in sa.inspect(connection).get_columns("transactions")
    }
    assert columns["created_at"]["nullable"] is False
    assert columns["updated_at"]["nullable"] is False


@pytest.mark.parametrize("legacy_type", ["TRANSFER", "Transfer"])
def test_legacy_incoming_transfer_without_counterpart_is_preserved(
    migration_connection: sa.Connection, legacy_type: str
) -> None:
    connection = migration_connection
    ledger = sa.Table(
        "transactions",
        sa.MetaData(),
        sa.Column("transaction_id", sa.String(64), primary_key=True),
        sa.Column("date", sa.DateTime(), nullable=False),
        sa.Column("amount", sa.Numeric(15, 2), nullable=False),
        sa.Column("currency", sa.String(10), nullable=False),
        sa.Column("type", sa.String(8), nullable=False),
        sa.Column("account", sa.String(255), nullable=False),
        sa.Column("category", sa.String(255), nullable=False),
        sa.Column("subcategory", sa.String(255)),
        sa.Column("note", sa.Text()),
        sa.Column("source_file", sa.String(500), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), nullable=False),
    )
    ledger.create(connection)
    moment = datetime(2026, 9, 1, tzinfo=UTC).replace(tzinfo=None)
    connection.execute(
        ledger.insert().values(
            transaction_id="unpaired-incoming",
            date=moment,
            amount=Decimal("125.50"),
            currency="INR",
            type=legacy_type,
            account="Synthetic savings",
            category="Transfer: From Synthetic bank",
            note="Keep this source record",
            source_file="synthetic.csv",
            last_seen_at=moment,
            is_deleted=False,
        )
    )
    connection.commit()

    command.upgrade(_config(connection), "b08e16c7e62c")

    migrated = sa.Table("transactions", sa.MetaData(), autoload_with=connection)
    row = connection.execute(sa.select(migrated)).mappings().one()
    assert row["transaction_id"] == "unpaired-incoming"
    assert row["type"] == "TRANSFER"
    assert row["amount"] == Decimal("125.50")
    assert row["from_account"] == "Synthetic bank"
    assert row["to_account"] == "Synthetic savings"
    assert row["date"] == row["last_seen_at"] == moment
    assert row["note"] == "Keep this source record"
    assert row["source_file"] == "synthetic.csv"
    assert row["is_deleted"] is False
    assert "transfers" not in sa.inspect(connection).get_table_names()


def _insert_legacy_transfer(
    connection: sa.Connection, transfer_id: str, direction: str, **overrides: object
) -> None:
    transfers = sa.Table("transfers", sa.MetaData(), autoload_with=connection)
    moment = datetime(2026, 9, 1, tzinfo=UTC).replace(tzinfo=None)
    connection.execute(
        transfers.insert().values(
            **{
                "transfer_id": transfer_id,
                "date": moment,
                "amount": Decimal("125.50"),
                "currency": "INR",
                "type": direction,
                "from_account": "Synthetic bank",
                "to_account": "Synthetic savings",
                "category": "Transfer",
                "source_file": "synthetic.csv",
                "last_seen_at": moment,
                "is_deleted": False,
                **overrides,
            }
        )
    )


@pytest.mark.parametrize(("outgoing_count", "incoming_count"), [(1, 2), (2, 1)])
def test_transfer_consolidation_preserves_ambiguous_groups(
    migration_connection: sa.Connection, outgoing_count: int, incoming_count: int
) -> None:
    connection = migration_connection
    command.upgrade(_config(connection), "343e4412d829")
    expected_ids = set()
    for direction, count in (("TRANSFER_OUT", outgoing_count), ("TRANSFER_IN", incoming_count)):
        for number in range(count):
            transfer_id = f"{direction}-{number}"
            expected_ids.add(transfer_id)
            _insert_legacy_transfer(connection, transfer_id, direction)
    connection.commit()

    command.upgrade(_config(connection), "b08e16c7e62c")

    ledger = sa.Table("transactions", sa.MetaData(), autoload_with=connection)
    rows = connection.execute(sa.select(ledger)).mappings().all()
    assert {row["transaction_id"] for row in rows} == expected_ids
    assert all(row["amount"] == Decimal("125.50") for row in rows)
    assert all(row["from_account"] == "Synthetic bank" for row in rows)
    assert all(row["to_account"] == "Synthetic savings" for row in rows)


@pytest.mark.parametrize("different_field", ["note", "is_deleted"])
def test_transfer_consolidation_preserves_distinct_source_metadata(
    migration_connection: sa.Connection, different_field: str
) -> None:
    connection = migration_connection
    command.upgrade(_config(connection), "343e4412d829")
    _insert_legacy_transfer(connection, "outgoing", "TRANSFER_OUT")
    different_value = "Separate source note" if different_field == "note" else True
    _insert_legacy_transfer(
        connection, "incoming", "TRANSFER_IN", **{different_field: different_value}
    )
    connection.commit()

    command.upgrade(_config(connection), "b08e16c7e62c")

    ledger = sa.Table("transactions", sa.MetaData(), autoload_with=connection)
    rows = {
        row["transaction_id"]: row for row in connection.execute(sa.select(ledger)).mappings().all()
    }
    assert set(rows) == {"incoming", "outgoing"}
    assert rows["incoming"][different_field] == different_value
    assert rows["outgoing"][different_field] != different_value


def test_transfer_id_collision_is_rejected_before_schema_or_data_changes(
    migration_connection: sa.Connection,
) -> None:
    connection = migration_connection
    config = _config(connection)
    command.upgrade(config, "343e4412d829")
    _insert_legacy_transfer(connection, "conflicting-id", "TRANSFER_OUT")
    ledger = sa.Table("transactions", sa.MetaData(), autoload_with=connection)
    moment = datetime(2026, 9, 1, tzinfo=UTC).replace(tzinfo=None)
    connection.execute(
        ledger.insert().values(
            transaction_id="conflicting-id",
            date=moment,
            amount=Decimal("20.00"),
            currency="INR",
            type="EXPENSE",
            account="Synthetic bank",
            category="Unrelated expense",
            source_file="synthetic.csv",
            last_seen_at=moment,
            is_deleted=False,
        )
    )
    connection.commit()
    columns_before = sa.inspect(connection).get_columns("transactions")

    with pytest.raises(RuntimeError, match="No transfer rows were removed"):
        command.upgrade(config, "b08e16c7e62c")

    assert connection.execute(sa.text("SELECT version_num FROM alembic_version")).scalar_one() == (
        "343e4412d829"
    )
    assert [column["name"] for column in sa.inspect(connection).get_columns("transactions")] == [
        column["name"] for column in columns_before
    ]
    assert connection.execute(sa.select(ledger.c.amount)).scalar_one() == Decimal("20.00")
    assert connection.execute(sa.text("SELECT COUNT(*) FROM transfers")).scalar_one() == 1


def test_transfer_consolidation_downgrade_preserves_schema_revision_and_accounts(
    migration_connection: sa.Connection,
) -> None:
    connection = migration_connection
    config = _config(connection)
    command.upgrade(config, "343e4412d829")
    _insert_legacy_transfer(connection, "outgoing", "TRANSFER_OUT")
    connection.commit()
    command.upgrade(config, "b08e16c7e62c")
    connection.commit()
    ledger = sa.Table("transactions", sa.MetaData(), autoload_with=connection)
    rows_before = connection.execute(sa.select(ledger)).mappings().all()

    with pytest.raises(CommandError, match="Revision b08e16c7e62c has no supported downgrade"):
        command.downgrade(config, "343e4412d829")

    assert connection.execute(sa.text("SELECT version_num FROM alembic_version")).scalar_one() == (
        "b08e16c7e62c"
    )
    assert {column["name"] for column in sa.inspect(connection).get_columns("transactions")} == {
        column.name for column in ledger.columns
    }
    assert "transfers" not in sa.inspect(connection).get_table_names()
    assert connection.execute(sa.select(ledger)).mappings().all() == rows_before
    assert rows_before[0]["from_account"] == "Synthetic bank"
    assert rows_before[0]["to_account"] == "Synthetic savings"


@pytest.mark.parametrize("historical_type", ["enum", "varchar"])
def test_scheduled_table_creates_or_reuses_postgresql_transaction_enum(
    migration_connection: sa.Connection, historical_type: str
) -> None:
    connection = migration_connection
    if connection.dialect.name != "postgresql":
        pytest.skip("Native enum creation is PostgreSQL-specific")
    config = _config(connection)
    command.upgrade(config, "c3d4e5f6g7h8")
    if historical_type == "varchar":
        connection.exec_driver_sql(
            "ALTER TABLE transactions ALTER COLUMN type TYPE VARCHAR(8) USING type::text"
        )
        connection.exec_driver_sql("DROP TYPE transactiontype")
        assert "transactiontype" not in {
            enum["name"] for enum in sa.inspect(connection).get_enums()
        }
    connection.commit()

    command.upgrade(config, "af63e055055a")

    enums = [
        enum for enum in sa.inspect(connection).get_enums() if enum["name"] == "transactiontype"
    ]
    assert len(enums) == 1
    assert enums[0]["labels"] == ["EXPENSE", "INCOME", "TRANSFER"]
    scheduled = sa.Table("scheduled_transactions", sa.MetaData(), autoload_with=connection)
    assert scheduled.c.type.type.name == "transactiontype"
    assert connection.exec_driver_sql("SELECT 'TRANSFER'::transactiontype::text").scalar_one() == (
        "TRANSFER"
    )
    if historical_type == "varchar":
        ledger = sa.Table("transactions", sa.MetaData(), autoload_with=connection)
        assert not isinstance(ledger.c.type.type, sa.Enum)


@pytest.mark.parametrize("cap", ["messages", "daily_tokens", "monthly_tokens"])
def test_ai_quota_reservations_serialize_across_workers(
    migration_connection: sa.Connection, monkeypatch: pytest.MonkeyPatch, cap: str
) -> None:
    """Exercise database row locks on migrated tables with six live connections."""
    connection = migration_connection
    if connection.dialect.name != "postgresql":
        pytest.skip("SQLite quota concurrency is covered by the AI usage unit tests")
    command.upgrade(_config(connection), "head")
    monkeypatch.setattr(settings, "ai_daily_message_limit", 1 if cap == "messages" else 100)
    user_id = _insert_user(connection, "quota@example.test")
    connection.execute(
        Base.metadata.tables["user_preferences"]
        .insert()
        .values(
            user_id=user_id,
            ai_daily_token_limit=100 if cap == "daily_tokens" else None,
            ai_monthly_token_limit=100 if cap == "monthly_tokens" else None,
        )
    )
    schema = connection.exec_driver_sql("SELECT current_schema()").scalar_one()
    quoted_schema = connection.dialect.identifier_preparer.quote_schema(schema)
    connection.commit()
    start = Barrier(6)

    def reserve_from_worker(_index: int) -> tuple[int, int]:
        with connection.engine.connect() as worker_connection:
            worker_connection.exec_driver_sql(f"SET search_path TO {quoted_schema}")
            process_id = worker_connection.exec_driver_sql("SELECT pg_backend_pid()").scalar_one()
            worker_connection.commit()
            with Session(worker_connection) as session:
                start.wait(timeout=10)
                try:
                    reserve_usage(session, user_id, "synthetic-model", 100, funding_source="app")
                except HTTPException as exc:
                    return process_id, exc.status_code
                return process_id, 200

    with ThreadPoolExecutor(max_workers=6) as workers:
        results = list(workers.map(reserve_from_worker, range(6)))

    assert len({process_id for process_id, _status in results}) == 6
    assert sorted(status for _process_id, status in results) == [200, 429, 429, 429, 429, 429]
    usage = Base.metadata.tables["ai_usage_log"]
    assert connection.execute(
        sa.select(usage.c.status, usage.c.reserved_tokens).where(usage.c.user_id == user_id)
    ).all() == [("reserved", 100)]
