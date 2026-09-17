"""Transaction contracts on fresh metadata and migrated SQLite/PostgreSQL schemas."""

from collections.abc import Generator
from decimal import Decimal

import pytest
import sqlalchemy as sa
from alembic import command

from ledger_sync.db.base import Base
from ledger_sync.ingest.normalizer import DataNormalizer
from ledger_sync.schemas.transactions import TransactionCreateRequest
from tests.integration.test_migrations_from_scratch import (
    migration_connection as _migration_connection,
)
from tests.integration.test_schema_integrity import (
    MOMENT,
    _child,
    _config,
    _insert,
    _schema,
    _seed_users,
    _snapshot,
)

migration_connection = _migration_connection
REVISION = "transaction_invariants_2026"
PREDECESSOR = "ledger_dimensions_2026"


def _ledger(connection: sa.Connection, identity: str = "owned", **overrides: object) -> None:
    values = {
        "transaction_id": identity,
        "user_id": 1,
        "date": MOMENT,
        "amount": Decimal("12.34"),
        "currency": "INR",
        "type": "EXPENSE",
        "account": "Bank",
        "category": "Food",
        "source_file": "synthetic.csv",
        **overrides,
    }
    _insert(connection, "transactions", **values)


@pytest.fixture(params=["metadata", "migration"])
def invariant_db(
    request: pytest.FixtureRequest, migration_connection: sa.Connection
) -> Generator[sa.Connection]:
    connection = migration_connection
    if request.param == "metadata":
        Base.metadata.create_all(connection)
    else:
        command.upgrade(_config(connection), REVISION)
    connection.commit()
    if connection.dialect.name == "sqlite":
        connection.exec_driver_sql("PRAGMA foreign_keys=ON")
    _seed_users(connection)
    yield connection


@pytest.fixture
def before_invariants(migration_connection: sa.Connection) -> sa.Connection:
    command.upgrade(_config(migration_connection), PREDECESSOR)
    _seed_users(migration_connection)
    return migration_connection


def test_amount_bounds_allow_zero_and_reject_invalid_values(invariant_db: sa.Connection) -> None:
    _ledger(invariant_db, "zero", amount=Decimal("0.00"))
    _ledger(invariant_db, "maximum", amount=Decimal("9999999999999.99"))
    for index, amount in enumerate(("-0.01", "10000000000000.00", "NaN", "Infinity", "-Infinity")):
        with pytest.raises(sa.exc.DBAPIError), invariant_db.begin_nested():
            _ledger(invariant_db, f"invalid-{index}", amount=Decimal(amount))
    assert invariant_db.exec_driver_sql("SELECT COUNT(*) FROM transactions").scalar_one() == 2


def test_currency_and_type_match_the_stored_contract(invariant_db: sa.Connection) -> None:
    for index, values in enumerate(
        (
            {"currency": "USD"},
            {"currency": "inr"},
            {"currency": ""},
            {"type": "invalid"},
        )
    ):
        with pytest.raises(sa.exc.DBAPIError), invariant_db.begin_nested():
            _ledger(invariant_db, f"invalid-{index}", **values)
    for tx_type in ("INCOME", "EXPENSE", "TRANSFER"):
        _ledger(invariant_db, tx_type, type=tx_type)


def test_fingerprints_allow_unassigned_rows_and_validate_assigned_rows(
    invariant_db: sa.Connection,
) -> None:
    for version in (1, 2):
        _ledger(invariant_db, f"unassigned-{version}", fingerprint_version=version)
    _ledger(invariant_db, "assigned", source_fingerprint="0123456789abcdef" * 4)
    invalid = (
        [{"fingerprint_version": version} for version in (-1, 0, 3)]
        + [
            {"source_fingerprint": value}
            for value in ("", "a" * 63, "a" * 65, "g" * 64, "A" * 64, "a" * 31 + "!" + "a" * 32)
        ]
        + [{"source_fingerprint": "b" * 64, "fingerprint_version": 1}]
    )
    for index, values in enumerate(invalid):
        with pytest.raises(sa.exc.DBAPIError), invariant_db.begin_nested():
            _ledger(invariant_db, f"invalid-{index}", **values)
    assert invariant_db.exec_driver_sql("SELECT COUNT(*) FROM transactions").scalar_one() == 3


def test_constraints_do_not_invent_transfer_endpoint_requirements(
    invariant_db: sa.Connection,
) -> None:
    for index, endpoints in enumerate(
        (
            {},
            {"from_account": "", "to_account": ""},
            {"from_account": "Bank", "to_account": None},
            {"from_account": "Bank", "to_account": "Bank"},
        )
    ):
        _ledger(invariant_db, f"transfer-{index}", type="TRANSFER", **endpoints)
    # Manual creation currently retains optional endpoint labels for any type.
    _ledger(invariant_db, "expense", from_account="Other", to_account="Wallet")


def test_actual_manual_and_normalized_transfer_shapes() -> None:
    manual = TransactionCreateRequest(
        date=MOMENT, amount=12.34, type="Transfer", account="Bank", category="Move"
    )
    assert manual.from_account is None and manual.to_account is None
    normalized = DataNormalizer().normalize_from_dict(
        {
            "date": "2026-09-17",
            "amount": "0.00",
            "currency": "inr",
            "type": "Transfer-Out",
            "account": "Bank",
            "category": "Wallet",
        }
    )
    assert normalized["from_account"] == normalized["account"] == "Bank"
    assert normalized["to_account"] == "Wallet"
    assert normalized["currency"] == "INR"
    assert normalized["amount"] == Decimal("0.00")


def test_populated_migration_preserves_all_rows_and_foreign_keys(
    before_invariants: sa.Connection,
) -> None:
    connection = before_invariants
    _ledger(connection, "owned", amount=0, fingerprint_version=1, is_deleted=True)
    _ledger(connection, "new", source_fingerprint="a" * 64, fingerprint_version=2)
    _ledger(connection, "legacy-transfer", type="TRANSFER", from_account="", to_account="")
    _child(connection, "transaction_tags", user_id=1, transaction_id="owned")
    _child(connection, "anomalies", user_id=1, transaction_id="owned", is_reviewed=True)
    _child(connection, "anomalies", user_id=2, transaction_id=None)
    connection.commit()
    before = _snapshot(connection)
    keys_before = sa.inspect(connection).get_foreign_keys("transactions")
    connection.commit()

    command.upgrade(_config(connection), REVISION)
    connection.commit()
    after = _snapshot(connection)
    before.pop("alembic_version")
    assert after.pop("alembic_version") == [(REVISION,)]
    assert before == after
    assert sorted(
        sa.inspect(connection).get_foreign_keys("transactions"),
        key=lambda item: item["name"] or "",
    ) == sorted(keys_before, key=lambda item: item["name"] or "")
    if connection.dialect.name == "sqlite":
        connection.commit()
        connection.exec_driver_sql("PRAGMA foreign_keys=ON")
        assert connection.exec_driver_sql("PRAGMA foreign_key_check").all() == []
    with pytest.raises(sa.exc.DBAPIError), connection.begin_nested():
        connection.exec_driver_sql("UPDATE transactions SET amount=-1 WHERE transaction_id='owned'")
    with pytest.raises(sa.exc.DBAPIError), connection.begin_nested():
        connection.exec_driver_sql("UPDATE transaction_tags SET user_id=2")
    connection.exec_driver_sql("DELETE FROM transactions WHERE transaction_id='owned'")
    assert connection.exec_driver_sql("SELECT COUNT(*) FROM transaction_tags").scalar_one() == 0


@pytest.mark.parametrize(
    ("values", "constraint"),
    [
        ({"amount": Decimal("-0.01")}, "ck_transactions_amount_bounds"),
        ({"currency": "USD"}, "ck_transactions_currency_inr"),
        ({"fingerprint_version": 3}, "ck_transactions_fingerprint_version"),
        ({"source_fingerprint": "g" * 64}, "ck_transactions_source_fingerprint"),
        (
            {"source_fingerprint": "a" * 64, "fingerprint_version": 1},
            "ck_transactions_source_fingerprint",
        ),
    ],
)
def test_invalid_history_fails_preflight_without_data_or_schema_changes(
    before_invariants: sa.Connection, values: dict, constraint: str
) -> None:
    connection = before_invariants
    _ledger(connection, "invalid-history", is_deleted=True, **values)
    connection.commit()
    before = _snapshot(connection)
    checks_before = sa.inspect(connection).get_check_constraints("transactions")
    connection.commit()
    with pytest.raises(RuntimeError, match=constraint):
        command.upgrade(_config(connection), REVISION)
    connection.rollback()
    assert _snapshot(connection) == before
    assert sa.inspect(connection).get_check_constraints("transactions") == checks_before


def test_sqlite_rebuild_refuses_enabled_foreign_keys(before_invariants: sa.Connection) -> None:
    connection = before_invariants
    if connection.dialect.name != "sqlite":
        pytest.skip("SQLite parent-table rebuild guard")
    _ledger(connection)
    _child(connection, "transaction_tags", user_id=1, transaction_id="owned")
    connection.commit()
    connection.exec_driver_sql("PRAGMA foreign_keys=ON")
    before, schema_before = _snapshot(connection), _schema(connection)
    connection.commit()
    with pytest.raises(RuntimeError, match="foreign_keys=OFF"):
        command.upgrade(_config(connection), REVISION)
    assert _snapshot(connection) == before
    assert _schema(connection) == schema_before
    assert connection.exec_driver_sql("PRAGMA foreign_keys").scalar_one() == 1


def test_nonfinite_history_fails_preflight(before_invariants: sa.Connection) -> None:
    connection = before_invariants
    _ledger(connection)
    # NUMERIC admits NaN on PostgreSQL; SQLite's affinity can retain this as
    # text when written by an external tool. Neither is valid financial history.
    connection.exec_driver_sql("UPDATE transactions SET amount='NaN'")
    connection.commit()
    before = connection.exec_driver_sql(
        "SELECT transaction_id, CAST(amount AS TEXT) FROM transactions"
    ).all()
    connection.commit()
    with pytest.raises(RuntimeError, match="ck_transactions_amount_bounds"):
        command.upgrade(_config(connection), REVISION)
    connection.rollback()
    assert (
        connection.exec_driver_sql(
            "SELECT transaction_id, CAST(amount AS TEXT) FROM transactions"
        ).all()
        == before
    )
    assert connection.exec_driver_sql("SELECT version_num FROM alembic_version").scalar_one() == (
        PREDECESSOR
    )


def test_interrupted_ddl_rolls_back_rows_checks_and_revision(
    before_invariants: sa.Connection,
) -> None:
    connection = before_invariants
    _ledger(connection)
    _child(connection, "transaction_tags", user_id=1, transaction_id="owned")
    connection.commit()
    before = _snapshot(connection)
    checks_before = sa.inspect(connection).get_check_constraints("transactions")
    connection.commit()

    def interrupt(_conn, _cursor, statement, _parameters, _context, _executemany):
        if (connection.dialect.name == "sqlite" and "RENAME TO transactions" in statement) or (
            connection.dialect.name == "postgresql"
            and "ADD CONSTRAINT ck_transactions_currency_inr" in statement
        ):
            raise RuntimeError("Synthetic invariant DDL interruption")

    sa.event.listen(connection, "before_cursor_execute", interrupt)
    try:
        with pytest.raises(RuntimeError, match="Synthetic invariant DDL interruption"):
            command.upgrade(_config(connection), REVISION)
    finally:
        sa.event.remove(connection, "before_cursor_execute", interrupt)
        connection.rollback()
    assert _snapshot(connection) == before
    assert sa.inspect(connection).get_check_constraints("transactions") == checks_before
