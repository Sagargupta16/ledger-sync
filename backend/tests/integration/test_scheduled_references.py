"""Scheduled-source ownership and detector unlinking on isolated databases."""

from importlib import import_module

import pytest
import sqlalchemy as sa
from alembic import command
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy.orm import Session

from ledger_sync.core.analytics.recurring import RecurringMixin
from ledger_sync.db.base import Base
from ledger_sync.db.models import (
    LedgerAccount,
    LedgerAccountAlias,
    LedgerCategory,
    LedgerSubcategory,
    RecurringTransaction,
    ScheduledTransaction,
    Transaction,
    TransactionType,
    User,
    UserPreferences,
)
from ledger_sync.services.auth_service import AuthService
from ledger_sync.services.ledger_dimensions import attach_ledger_dimensions
from tests.integration.test_migrations_from_scratch import (
    migration_connection as _migration_connection,
)
from tests.integration.test_schema_integrity import MOMENT, _config, _insert, _seed_users

migration_connection = _migration_connection
REVISION = "scheduled_references_2026"
PREDECESSOR = "transaction_invariants_2026"


def _migration():
    return import_module("ledger_sync.db.migrations.versions.20260917_1500_scheduled_references")


def _recurring(connection, identity, user_id=1, confirmed=False):
    _insert(
        connection,
        "recurring_transactions",
        id=identity,
        user_id=user_id,
        pattern_name="Rent",
        category="Housing",
        account="Bank",
        transaction_type="EXPENSE",
        frequency="MONTHLY",
        expected_amount=100,
        is_user_confirmed=confirmed,
    )


def _schedule(connection, identity, source_id, user_id=1, active=True):
    _insert(
        connection,
        "scheduled_transactions",
        id=identity,
        user_id=user_id,
        name="My chosen rent payment",
        amount=125,
        type="EXPENSE",
        category="My category",
        subcategory="My subcategory",
        account="My bank",
        frequency="QUARTERLY",
        expected_day=12,
        next_due_date=MOMENT,
        end_date=MOMENT,
        recurring_transaction_id=source_id,
        is_active=active,
        note="Keep my choices",
        created_at=MOMENT,
        updated_at=MOMENT,
    )


def _schedules(connection):
    return (
        connection.execute(
            sa.select(ScheduledTransaction.__table__).order_by(ScheduledTransaction.id)
        )
        .mappings()
        .all()
    )


@pytest.fixture(params=["metadata", "migration"])
def scheduled_db(request, migration_connection):
    connection = migration_connection
    if request.param == "metadata":
        Base.metadata.create_all(connection)
    else:
        # Runtime lifecycle tests use the current application models/services.
        # Frozen historical migration tests use before_scheduled_references.
        command.upgrade(_config(connection), "head")
    connection.commit()
    if connection.dialect.name == "sqlite":
        connection.exec_driver_sql("PRAGMA foreign_keys=ON")
    _seed_users(connection)
    return connection


@pytest.fixture
def before_scheduled_references(migration_connection):
    command.upgrade(_config(migration_connection), PREDECESSOR)
    _seed_users(migration_connection)
    return migration_connection


def test_detector_unlinks_only_same_user_unconfirmed_sources_and_rolls_back(scheduled_db):
    connection = scheduled_db
    _recurring(connection, 10)
    _recurring(connection, 11, confirmed=True)
    _recurring(connection, 20, user_id=2)
    _schedule(connection, 100, 10)
    _schedule(connection, 101, 11)
    _schedule(connection, 102, 20, user_id=2)
    _schedule(connection, 103, None)
    _schedule(connection, 104, 10, active=False)
    connection.commit()
    before = _schedules(connection)
    connection.commit()

    with Session(connection) as session:
        loaded = session.get(ScheduledTransaction, 100)
        detector = RecurringMixin(session, user_id=1)
        assert detector._detect_recurring_transactions([]) == 0
        session.flush()
        assert loaded.recurring_transaction_id is None
        after = _schedules(connection)
        for original, current in zip(before, after, strict=True):
            expected = dict(original)
            if original["id"] in (100, 104):
                expected["recurring_transaction_id"] = None
            assert current == expected
        assert session.scalars(
            sa.select(RecurringTransaction.id).order_by(RecurringTransaction.id)
        ).all() == [11, 20]
        session.rollback()

    assert _schedules(connection) == before
    assert connection.execute(
        sa.select(RecurringTransaction.id).order_by(RecurringTransaction.id)
    ).scalars().all() == [10, 11, 20]


def test_detector_without_owner_cannot_unlink_or_delete_any_sources(scheduled_db):
    connection = scheduled_db
    _recurring(connection, 10)
    _schedule(connection, 100, 10)
    connection.commit()
    with Session(connection) as session:
        with pytest.raises(RuntimeError, match="user_id"):
            RecurringMixin(session)._detect_recurring_transactions([])
        assert session.get(RecurringTransaction, 10) is not None
        assert session.get(ScheduledTransaction, 100).recurring_transaction_id == 10


def test_fk_rejects_bad_sources_and_parent_delete_but_user_cascade_still_works(scheduled_db):
    connection = scheduled_db
    _recurring(connection, 10)
    _recurring(connection, 20, user_id=2)
    _schedule(connection, 100, 10)
    _schedule(connection, 200, 20, user_id=2)
    _schedule(connection, 101, None)
    for source_id in (999, 20):
        with pytest.raises(sa.exc.IntegrityError), connection.begin_nested():
            _schedule(connection, 102, source_id)
        with pytest.raises(sa.exc.IntegrityError), connection.begin_nested():
            connection.execute(
                sa.update(ScheduledTransaction.__table__)
                .where(ScheduledTransaction.id == 100)
                .values(recurring_transaction_id=source_id)
            )
    with pytest.raises(sa.exc.IntegrityError), connection.begin_nested():
        connection.execute(
            sa.delete(RecurringTransaction.__table__).where(RecurringTransaction.id == 10)
        )
    assert len(_schedules(connection)) == 3
    connection.execute(sa.delete(User.__table__).where(User.id == 1))
    assert [row["id"] for row in _schedules(connection)] == [200]
    assert connection.execute(sa.select(RecurringTransaction.id)).scalars().all() == [20]
    if connection.dialect.name == "sqlite":
        assert connection.exec_driver_sql("PRAGMA foreign_key_check").all() == []


@pytest.mark.parametrize("operation", ["delete", "reset", "transactions"])
def test_account_delete_and_reset_handle_linked_schedules(scheduled_db, operation):
    connection = scheduled_db
    _recurring(connection, 10)
    _recurring(connection, 20, user_id=2)
    _schedule(connection, 100, 10)
    _schedule(connection, 200, 20, user_id=2)
    connection.commit()
    with Session(connection) as session:
        dimensions = (LedgerAccount, LedgerAccountAlias, LedgerCategory, LedgerSubcategory)
        for owner in (1, 2):
            rows = [{"account": "Bank", "category": "Food", "subcategory": "Lunch"}]
            attach_ledger_dimensions(session, owner, rows)
            session.add(
                Transaction(
                    transaction_id=str(owner) * 64,
                    user_id=owner,
                    date=MOMENT,
                    amount=125,
                    type=TransactionType.EXPENSE,
                    source_file="synthetic.csv",
                    **rows[0],
                )
            )
            session.add(
                UserPreferences(
                    user_id=owner,
                    essential_categories='["My custom category"]',
                    preferred_tax_regime="old",
                )
            )
        session.commit()
        other_dimensions = {
            model.__tablename__: session.execute(
                sa.select(model.__table__).where(model.user_id == 2)
            )
            .mappings()
            .all()
            for model in dimensions
        }
        other_preferences = (
            session.execute(
                sa.select(UserPreferences.__table__).where(UserPreferences.user_id == 2)
            )
            .mappings()
            .one()
        )
        user = session.get(User, 1)
        previous_token_version = user.token_version
        service = AuthService(session)
        if operation == "delete":
            service.delete_account(user)
        else:
            service.reset_account(user, transactions_only=operation == "transactions")
        assert [row["id"] for row in _schedules(connection)] == [200]
        assert session.scalars(sa.select(RecurringTransaction.id)).all() == [20]
        assert session.scalars(sa.select(Transaction.user_id)).all() == [2]
        for model in dimensions:
            expected_count = int(
                operation == "transactions" and model in (LedgerAccount, LedgerAccountAlias)
            )
            assert (
                session.scalar(
                    sa.select(sa.func.count()).select_from(model).where(model.user_id == 1)
                )
                == expected_count
            )
            assert (
                session.execute(sa.select(model.__table__).where(model.user_id == 2))
                .mappings()
                .all()
                == other_dimensions[model.__tablename__]
            )
        assert (
            session.execute(
                sa.select(UserPreferences.__table__).where(UserPreferences.user_id == 2)
            )
            .mappings()
            .one()
            == other_preferences
        )
        preferences = session.scalar(sa.select(UserPreferences).where(UserPreferences.user_id == 1))
        if operation == "delete":
            assert session.get(User, 1) is None
            assert preferences is None
        else:
            assert session.get(User, 1).token_version == previous_token_version + 1
            assert preferences is not None
            if operation == "transactions":
                assert preferences.preferred_tax_regime == "old"
                assert preferences.essential_categories == '["My custom category"]'
            else:
                assert preferences.preferred_tax_regime == "new"
                assert preferences.essential_categories != '["My custom category"]'


@pytest.mark.parametrize("bad_source", [20, 999])
def test_migration_preflight_rejects_cross_user_and_orphan_refs_without_repair(
    before_scheduled_references, bad_source
):
    connection = before_scheduled_references
    _recurring(connection, 10)
    _recurring(connection, 20, user_id=2)
    _schedule(connection, 100, bad_source)
    connection.commit()
    before = _schedules(connection)
    with (
        pytest.raises(RuntimeError, match=r"scheduled.*100"),
        Operations.context(MigrationContext.configure(connection)),
    ):
        _migration().upgrade()
    connection.rollback()
    assert _schedules(connection) == before
    indexes = sa.inspect(connection).get_indexes("recurring_transactions")
    assert "uq_recurring_transactions_user_id" not in {index["name"] for index in indexes}
    assert not any(
        key["name"] == "fk_scheduled_user_recurring"
        for key in sa.inspect(connection).get_foreign_keys("scheduled_transactions")
    )


def test_migration_preserves_existing_schedules_and_reruns_safely(before_scheduled_references):
    connection = before_scheduled_references
    _recurring(connection, 10)
    _recurring(connection, 20, user_id=2)
    _schedule(connection, 100, 10)
    _schedule(connection, 200, 20, user_id=2)
    _schedule(connection, 101, None)
    connection.commit()
    before = _schedules(connection)
    with Operations.context(MigrationContext.configure(connection)):
        _migration().upgrade()
    connection.commit()
    if connection.dialect.name == "sqlite":
        connection.exec_driver_sql("PRAGMA foreign_keys=ON")
    with Operations.context(MigrationContext.configure(connection)):
        _migration().upgrade()
    assert _schedules(connection) == before
    assert connection.execute(
        sa.select(RecurringTransaction.id).order_by(RecurringTransaction.id)
    ).scalars().all() == [10, 20]
    if connection.dialect.name == "sqlite":
        assert connection.exec_driver_sql("PRAGMA foreign_key_check").all() == []


def test_sqlite_rebuild_guard_preserves_valid_existing_schedules(before_scheduled_references):
    connection = before_scheduled_references
    if connection.dialect.name != "sqlite":
        pytest.skip("SQLite connection-setting guard")
    _recurring(connection, 10)
    _schedule(connection, 100, 10)
    connection.commit()
    connection.exec_driver_sql("PRAGMA foreign_keys=ON")
    before = _schedules(connection)
    with (
        pytest.raises(RuntimeError, match="dedicated SQLite connection"),
        Operations.context(MigrationContext.configure(connection)),
    ):
        _migration().upgrade()
    connection.rollback()
    assert _schedules(connection) == before
    assert connection.exec_driver_sql("PRAGMA foreign_keys").scalar_one() == 1
    assert "uq_recurring_transactions_user_id" not in {
        index["name"] for index in sa.inspect(connection).get_indexes("recurring_transactions")
    }
