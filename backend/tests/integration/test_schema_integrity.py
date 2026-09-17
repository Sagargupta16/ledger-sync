"""Schema integrity on disposable SQLite databases and fresh ORM metadata."""

from collections.abc import Generator
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config

from ledger_sync.core.analytics.merchant_extract import extract_merchant
from ledger_sync.db.base import Base

REVISION = "schema_integrity_2026"
PREDECESSOR = "identity_constraints_2026"
MIGRATIONS = Path(__file__).resolve().parents[2] / "src/ledger_sync/db/migrations"
MOMENT = datetime(2026, 9, 17, tzinfo=UTC).replace(tzinfo=None)


def _config(connection: sa.Connection) -> Config:
    config = Config()
    config.set_main_option("script_location", MIGRATIONS.as_posix())
    config.attributes["connection"] = connection
    return config


def _insert(connection: sa.Connection, table_name: str, **values: object) -> int:
    # Use defaults from metadata but only columns present at the tested revision.
    table = Base.metadata.tables[table_name]
    columns = {column["name"] for column in sa.inspect(connection).get_columns(table_name)}
    for column in table.columns:
        if column.name in values or column.name not in columns or column.default is None:
            continue
        default = column.default
        values[column.name] = default.arg(None) if default.is_callable else default.arg
    reflected = sa.Table(table_name, sa.MetaData(), autoload_with=connection)
    result = connection.execute(reflected.insert().values(**values))
    return result.inserted_primary_key[0]


def _seed_users(connection: sa.Connection) -> None:
    for user_id in (1, 2):
        _insert(connection, "users", id=user_id, email=f"schema-{user_id}@example.test")
    connection.commit()


@pytest.fixture
def legacy_db(tmp_path: Path) -> Generator[sa.Connection]:
    engine = sa.create_engine(f"sqlite:///{(tmp_path / 'integrity.db').as_posix()}")
    with engine.connect() as connection:
        command.upgrade(_config(connection), PREDECESSOR)
        connection.commit()
        connection.exec_driver_sql("PRAGMA foreign_keys=ON")
        _seed_users(connection)
        yield connection
    engine.dispose()


@pytest.fixture(params=["migration", "metadata"])
def integrity_db(request: pytest.FixtureRequest, tmp_path: Path) -> Generator[sa.Connection]:
    engine = sa.create_engine(f"sqlite:///{(tmp_path / 'integrity.db').as_posix()}")
    with engine.connect() as connection:
        if request.param == "migration":
            command.upgrade(_config(connection), REVISION)
        else:
            Base.metadata.create_all(connection)
        connection.commit()
        connection.exec_driver_sql("PRAGMA foreign_keys=ON")
        _seed_users(connection)
        yield connection
    engine.dispose()


@pytest.mark.parametrize("subcategory", [None, "", "Groceries"])
@pytest.mark.parametrize("active", [True, False])
def test_budget_key_includes_inactive_rows(
    integrity_db: sa.Connection, subcategory: str | None, active: bool
) -> None:
    values = {"category": "Food", "subcategory": subcategory, "monthly_limit": Decimal("200.50")}
    _insert(integrity_db, "budgets", user_id=1, is_active=active, **values)
    _insert(integrity_db, "budgets", user_id=2, **values)
    with pytest.raises(sa.exc.IntegrityError):
        _insert(integrity_db, "budgets", user_id=1, is_active=not active, **values)


def test_budget_null_empty_and_named_scopes_remain_distinct(integrity_db: sa.Connection) -> None:
    for subcategory in (None, "", "Groceries"):
        _insert(
            integrity_db,
            "budgets",
            user_id=1,
            category="Food",
            subcategory=subcategory,
            monthly_limit=100,
        )
    assert integrity_db.exec_driver_sql("SELECT COUNT(*) FROM budgets").scalar_one() == 3


@pytest.mark.parametrize("subcategory", [None, "", "Groceries"])
def test_category_trend_key_is_null_aware_and_user_scoped(
    integrity_db: sa.Connection, subcategory: str | None
) -> None:
    values = {"period_key": "2026-09", "category": "Food", "subcategory": subcategory}
    _insert(integrity_db, "category_trends", user_id=1, transaction_type="EXPENSE", **values)
    _insert(integrity_db, "category_trends", user_id=2, transaction_type="EXPENSE", **values)
    _insert(integrity_db, "category_trends", user_id=1, transaction_type="INCOME", **values)
    with pytest.raises(sa.exc.IntegrityError):
        _insert(integrity_db, "category_trends", user_id=1, transaction_type="EXPENSE", **values)


def test_category_trend_scopes_remain_distinct(integrity_db: sa.Connection) -> None:
    for subcategory in (None, "", "Groceries"):
        _insert(
            integrity_db,
            "category_trends",
            user_id=1,
            period_key="2026-09",
            category="Food",
            subcategory=subcategory,
            transaction_type="EXPENSE",
        )
    assert integrity_db.exec_driver_sql("SELECT COUNT(*) FROM category_trends").scalar_one() == 3


def test_fiscal_year_key_is_user_scoped(integrity_db: sa.Connection) -> None:
    values = {"fiscal_year": "FY2026-27", "start_date": MOMENT, "end_date": MOMENT}
    for user_id in (1, 2):
        _insert(integrity_db, "fy_summaries", user_id=user_id, **values)
    with pytest.raises(sa.exc.IntegrityError):
        _insert(integrity_db, "fy_summaries", user_id=1, **values)


def test_merchant_key_matches_extractor_identity(integrity_db: sa.Connection) -> None:
    # The extractor deliberately distinguishes an Apple descriptor from the brand,
    # and preserves case for descriptors. A lower(name)-only key is incorrect.
    labels = [
        extract_merchant("Apple", "Food"),
        extract_merchant("Apple Music", "Entertainment"),
        extract_merchant("apple", "Food"),
    ]
    assert labels == [("Apple", "descriptor"), ("Apple", "brand"), ("apple", "descriptor")]
    for user_id in (1, 2):
        for name, kind in labels:
            _insert(
                integrity_db,
                "merchant_intelligence",
                user_id=user_id,
                merchant_name=name,
                label_kind=kind,
                primary_category="Food",
            )
    with pytest.raises(sa.exc.IntegrityError):
        _insert(
            integrity_db,
            "merchant_intelligence",
            user_id=1,
            merchant_name="Apple",
            label_kind="descriptor",
            primary_category="Food",
        )


def _transaction(connection: sa.Connection, transaction_id: str = "owned") -> None:
    _insert(
        connection,
        "transactions",
        transaction_id=transaction_id,
        user_id=1,
        date=MOMENT,
        amount=Decimal("0.00"),
        currency="INR",
        type="EXPENSE",
        account="Bank",
        category="Food",
        source_file="synthetic.csv",
    )


def _child(connection: sa.Connection, table_name: str, **values: object) -> int:
    defaults = (
        {"tag": "review"}
        if table_name == "transaction_tags"
        else {"anomaly_type": "HIGH_EXPENSE", "severity": "low", "description": "Keep review"}
    )
    return _insert(connection, table_name, **defaults, **values)


def _snapshot(connection: sa.Connection) -> dict[str, list[tuple]]:
    tables = sa.inspect(connection).get_table_names()
    return {
        name: [
            tuple(row)
            for row in connection.execute(
                sa.select(sa.Table(name, sa.MetaData(), autoload_with=connection))
            ).all()
        ]
        for name in tables
    }


def _schema(connection: sa.Connection) -> list[tuple]:
    return [
        tuple(row)
        for row in connection.exec_driver_sql(
            "SELECT type, name, tbl_name, sql FROM sqlite_master "
            "WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name"
        )
    ]


@pytest.mark.parametrize("table_name", ["transaction_tags", "anomalies"])
def test_tenant_fk_rejects_cross_user_and_missing_transactions(
    legacy_db: sa.Connection, table_name: str
) -> None:
    _transaction(legacy_db)
    child_id = _child(legacy_db, table_name, user_id=1, transaction_id="owned")
    legacy_db.commit()
    command.upgrade(_config(legacy_db), REVISION)
    for user_id, transaction_id in ((2, "owned"), (1, "missing")):
        with pytest.raises(sa.exc.IntegrityError), legacy_db.begin_nested():
            _child(legacy_db, table_name, user_id=user_id, transaction_id=transaction_id)
    with pytest.raises(sa.exc.IntegrityError), legacy_db.begin_nested():
        table = sa.Table(table_name, sa.MetaData(), autoload_with=legacy_db)
        legacy_db.execute(table.update().where(table.c.id == child_id).values(user_id=2))
    legacy_db.exec_driver_sql("DELETE FROM transactions WHERE transaction_id='owned'")
    table = sa.Table(table_name, sa.MetaData(), autoload_with=legacy_db)
    assert legacy_db.execute(sa.select(sa.func.count()).select_from(table)).scalar_one() == 0


def test_migration_preserves_data_nullable_anomalies_and_indexes(legacy_db: sa.Connection) -> None:
    _transaction(legacy_db)
    _child(legacy_db, "transaction_tags", user_id=1, transaction_id="owned")
    _child(legacy_db, "anomalies", user_id=1, transaction_id="owned", is_reviewed=True)
    _child(legacy_db, "anomalies", user_id=2, transaction_id=None)
    for subcategory in (None, "", "Groceries"):
        _insert(
            legacy_db,
            "budgets",
            user_id=1,
            category="Food",
            subcategory=subcategory,
            monthly_limit=Decimal("123.45"),
            is_active=False,
        )
    _insert(legacy_db, "import_logs", user_id=1, file_hash="a" * 64, file_name="synthetic.csv")
    _insert(
        legacy_db,
        "fy_summaries",
        user_id=1,
        fiscal_year="FY2026-27",
        start_date=MOMENT,
        end_date=MOMENT,
        total_income=Decimal("123.45"),
    )
    for subcategory in (None, "", "Groceries"):
        _insert(
            legacy_db,
            "category_trends",
            user_id=1,
            period_key="2026-09",
            category="Food",
            subcategory=subcategory,
            transaction_type="EXPENSE",
            total_amount=Decimal("123.45"),
        )
    for kind in ("brand", "descriptor"):
        _insert(
            legacy_db,
            "merchant_intelligence",
            user_id=1,
            merchant_name="Apple",
            label_kind=kind,
            primary_category="Food",
            total_spent=Decimal("123.45"),
        )
    _insert(
        legacy_db,
        "audit_logs",
        user_id=1,
        operation="upload",
        entity_type="transaction",
        action="create",
        changes_summary="Preserve audit text",
    )
    recurring_id = _insert(
        legacy_db,
        "recurring_transactions",
        user_id=1,
        pattern_name="Rent",
        category="Housing",
        account="Bank",
        transaction_type="EXPENSE",
        frequency="MONTHLY",
        expected_amount=100,
    )
    _insert(
        legacy_db,
        "scheduled_transactions",
        user_id=1,
        name="User's rent plan",
        amount=100,
        type="EXPENSE",
        category="Housing",
        account="Bank",
        frequency="MONTHLY",
        next_due_date=MOMENT,
        recurring_transaction_id=recurring_id,
    )
    _insert(
        legacy_db,
        "net_worth_snapshots",
        user_id=1,
        snapshot_date=MOMENT,
        total_assets=Decimal("123.45"),
        total_liabilities=0,
        net_worth=Decimal("123.45"),
    )
    legacy_db.commit()
    before = _snapshot(legacy_db)

    command.upgrade(_config(legacy_db), REVISION)

    after = _snapshot(legacy_db)
    assert after.pop("alembic_version") == [(REVISION,)]
    before.pop("alembic_version")
    assert after == before
    assert legacy_db.exec_driver_sql("PRAGMA foreign_keys").scalar_one() == 1
    assert legacy_db.exec_driver_sql("PRAGMA foreign_key_check").all() == []
    for table, keep, removed in (
        ("anomalies", "ix_anomalies_user_id", "ix_anomaly_user"),
        ("audit_logs", "ix_audit_logs_created_at", "ix_audit_created"),
        ("category_trends", "ix_category_trends_user_id", "ix_category_trend_user"),
        ("recurring_transactions", "ix_recurring_transactions_user_id", "ix_recurring_user"),
    ):
        indexes = {index["name"] for index in sa.inspect(legacy_db).get_indexes(table)}
        assert keep in indexes
        assert removed not in indexes
    assert "ix_net_worth_user_date" not in {
        index["name"] for index in sa.inspect(legacy_db).get_indexes("net_worth_snapshots")
    }
    with pytest.raises(sa.exc.IntegrityError):
        _insert(
            legacy_db,
            "net_worth_snapshots",
            user_id=1,
            snapshot_date=MOMENT,
            total_assets=0,
            total_liabilities=0,
            net_worth=0,
        )


@pytest.mark.parametrize("table_name", ["transaction_tags", "anomalies"])
def test_fresh_and_migrated_tenant_fk_including_nullable_anomalies(
    integrity_db: sa.Connection, table_name: str
) -> None:
    _transaction(integrity_db)
    _child(integrity_db, table_name, user_id=1, transaction_id="owned")
    with pytest.raises(sa.exc.IntegrityError), integrity_db.begin_nested():
        _child(integrity_db, table_name, user_id=2, transaction_id="owned")
    if table_name == "anomalies":
        _child(integrity_db, table_name, user_id=2, transaction_id=None)
    integrity_db.exec_driver_sql("UPDATE transactions SET is_deleted=1")
    assert integrity_db.exec_driver_sql("PRAGMA foreign_key_check").all() == []
    integrity_db.exec_driver_sql("DELETE FROM transactions")
    remaining = sa.Table(table_name, sa.MetaData(), autoload_with=integrity_db)
    rows = integrity_db.execute(sa.select(remaining.c.transaction_id)).scalars().all()
    assert rows == ([None] if table_name == "anomalies" else [])


def test_import_log_key_is_user_scoped(legacy_db: sa.Connection) -> None:
    command.upgrade(_config(legacy_db), REVISION)
    for user_id in (1, 2):
        _insert(legacy_db, "import_logs", user_id=user_id, file_hash="a" * 64, file_name="file.csv")
    with pytest.raises(sa.exc.IntegrityError):
        _insert(legacy_db, "import_logs", user_id=1, file_hash="a" * 64, file_name="renamed.csv")


@pytest.mark.parametrize(
    ("table_name", "values"),
    [
        ("budgets", {"category": "Food", "subcategory": None, "monthly_limit": 100}),
        ("import_logs", {"file_hash": "a" * 64, "file_name": "synthetic.csv"}),
        ("fy_summaries", {"fiscal_year": "FY2026-27", "start_date": MOMENT, "end_date": MOMENT}),
        (
            "category_trends",
            {
                "period_key": "2026-09",
                "category": "Food",
                "subcategory": None,
                "transaction_type": "EXPENSE",
            },
        ),
        (
            "category_trends",
            {
                "period_key": "2026-09",
                "category": "Food",
                "subcategory": "Groceries",
                "transaction_type": "EXPENSE",
            },
        ),
        (
            "merchant_intelligence",
            {
                "merchant_name": "Apple",
                "label_kind": "brand",
                "primary_category": "Shopping",
            },
        ),
    ],
)
def test_duplicate_preflight_preserves_data_and_schema(
    legacy_db: sa.Connection, table_name: str, values: dict
) -> None:
    for _ in range(2):
        _insert(legacy_db, table_name, user_id=1, **values)
    legacy_db.commit()
    before, schema_before = _snapshot(legacy_db), _schema(legacy_db)
    legacy_db.commit()
    with pytest.raises(
        RuntimeError, match=rf"{table_name}.*[Dd]uplicate|[Dd]uplicate.*{table_name}"
    ):
        command.upgrade(_config(legacy_db), REVISION)
    assert _snapshot(legacy_db) == before
    assert _schema(legacy_db) == schema_before


@pytest.mark.parametrize("table_name", ["transaction_tags", "anomalies"])
@pytest.mark.parametrize("orphan", [False, True])
def test_ownership_preflight_preserves_data_and_schema(
    legacy_db: sa.Connection, table_name: str, orphan: bool
) -> None:
    _transaction(legacy_db)
    legacy_db.commit()
    legacy_db.exec_driver_sql("PRAGMA foreign_keys=OFF")
    _child(legacy_db, table_name, user_id=2, transaction_id="missing" if orphan else "owned")
    legacy_db.commit()
    legacy_db.exec_driver_sql("PRAGMA foreign_keys=ON")
    before, schema_before = _snapshot(legacy_db), _schema(legacy_db)
    legacy_db.commit()
    with pytest.raises(RuntimeError, match=table_name):
        command.upgrade(_config(legacy_db), REVISION)
    assert _snapshot(legacy_db) == before
    assert _schema(legacy_db) == schema_before


def test_unknown_user_preflight_preserves_nullable_anomaly(legacy_db: sa.Connection) -> None:
    legacy_db.exec_driver_sql("PRAGMA foreign_keys=OFF")
    _child(legacy_db, "anomalies", user_id=999, transaction_id=None)
    legacy_db.commit()
    legacy_db.exec_driver_sql("PRAGMA foreign_keys=ON")
    before, schema_before = _snapshot(legacy_db), _schema(legacy_db)
    legacy_db.commit()
    with pytest.raises(RuntimeError, match=r"anomalies user ownership.*999"):
        command.upgrade(_config(legacy_db), REVISION)
    assert _snapshot(legacy_db) == before
    assert _schema(legacy_db) == schema_before


@pytest.mark.parametrize(
    "statement",
    [
        "CREATE INDEX ix_anomaly_user ON anomalies(severity)",
        "CREATE INDEX ix_anomaly_user ON anomalies(user_id) WHERE is_reviewed=1",
    ],
)
def test_unexpected_duplicate_index_definition_fails_before_ddl(
    legacy_db: sa.Connection, statement: str
) -> None:
    legacy_db.exec_driver_sql("DROP INDEX ix_anomaly_user")
    legacy_db.exec_driver_sql(statement)
    legacy_db.commit()
    before, schema_before = _snapshot(legacy_db), _schema(legacy_db)
    legacy_db.commit()
    with pytest.raises(RuntimeError, match=r"Cannot safely remove anomalies\.ix_anomaly_user"):
        command.upgrade(_config(legacy_db), REVISION)
    assert _snapshot(legacy_db) == before
    assert _schema(legacy_db) == schema_before


def test_migration_ddl_rolls_back_if_late_operation_fails(legacy_db: sa.Connection) -> None:
    _transaction(legacy_db)
    _child(legacy_db, "transaction_tags", user_id=1, transaction_id="owned")
    legacy_db.commit()
    before, schema_before = _snapshot(legacy_db), _schema(legacy_db)
    legacy_db.commit()

    def interrupt_cleanup(_conn, _cursor, statement, _parameters, _context, _executemany):
        if statement.lstrip().startswith("DROP INDEX ix_anomaly_user"):
            raise RuntimeError("Synthetic DDL interruption")

    sa.event.listen(legacy_db, "before_cursor_execute", interrupt_cleanup)
    try:
        with pytest.raises(RuntimeError, match="Synthetic DDL interruption"):
            command.upgrade(_config(legacy_db), REVISION)
    finally:
        sa.event.remove(legacy_db, "before_cursor_execute", interrupt_cleanup)
        legacy_db.rollback()
    assert _snapshot(legacy_db) == before
    assert _schema(legacy_db) == schema_before
