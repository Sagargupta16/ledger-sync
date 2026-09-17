"""Real PostgreSQL publication/invalidator races in per-test migrated schemas."""

from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from datetime import UTC, datetime
from decimal import Decimal
from threading import Event

import pytest
from alembic import command
from sqlalchemy import event, func, select
from sqlalchemy.orm import Session

from ledger_sync.core import query_helpers
from ledger_sync.core.analytics.engine import AnalyticsEngine
from ledger_sync.core.analytics.refresh import (
    AnalyticsVersion,
    StaleAnalyticsRefreshError,
    analytics_is_current,
    get_analytics_state,
    lock_analytics_user,
    mark_ledger_changed,
    mark_preferences_changed,
    publish_refresh,
)
from ledger_sync.db.models import (
    AuditLog,
    DailySummary,
    Transaction,
    TransactionType,
    User,
    UserPreferences,
)
from tests.integration.test_migrations_from_scratch import (
    _config,
)
from tests.integration.test_migrations_from_scratch import (
    migration_connection as _migration_connection,
)

migration_connection = _migration_connection


@pytest.fixture
def publication_db(migration_connection, monkeypatch):
    connection = migration_connection
    if connection.dialect.name != "postgresql":
        pytest.skip("Real row-lock races require PostgreSQL; SQLite has a separate race test")
    command.upgrade(_config(connection), "head")
    schema = connection.exec_driver_sql("SELECT current_schema()").scalar_one()
    quoted_schema = connection.dialect.identifier_preparer.quote_schema(schema)
    connection.commit()
    monkeypatch.setattr(query_helpers, "_is_sqlite", False)
    with Session(connection) as session:
        user = User(email="publication@example.test", hashed_password="")
        session.add(user)
        session.flush()
        user_id = user.id
        session.add(UserPreferences(user_id=user_id))
        session.add(
            Transaction(
                user_id=user_id,
                transaction_id="publication-fixture",
                date=datetime(2024, 1, 2, tzinfo=UTC).replace(tzinfo=None),
                amount=Decimal("10.01"),
                currency="INR",
                type=TransactionType.EXPENSE,
                account="Cash",
                category="Food",
                source_file="synthetic.csv",
                is_deleted=False,
            )
        )
        mark_ledger_changed(session, user_id)
        session.commit()
    return connection, quoted_schema, user_id


@contextmanager
def _worker_session(connection, quoted_schema, role) -> Iterator[Session]:
    with connection.engine.connect() as worker:
        worker.info["publication_role"] = role
        worker.exec_driver_sql(f"SET search_path TO {quoted_schema}")
        worker.exec_driver_sql("SET lock_timeout = '5s'")
        worker.commit()
        try:
            with Session(worker, autoflush=False) as session:
                yield session
        finally:
            worker.info.pop("publication_role", None)


@pytest.mark.parametrize("second_action", ["refresh", "ledger", "preferences"])
def test_refresh_serializes_with_refresh_and_invalidation(publication_db, second_action):
    connection, schema, user_id = publication_db
    first_locked = Event()
    second_waiting = Event()
    release_first = Event()
    worker_pids = set()

    def observe_lock(conn, _cursor, statement, _parameters, _context, _many):
        if conn.info.get("publication_role") == "second" and "FOR UPDATE" in statement.upper():
            second_waiting.set()

    def first_refresh():
        with _worker_session(connection, schema, "first") as session:
            worker_pids.add(
                session.connection().exec_driver_sql("SELECT pg_backend_pid()").scalar_one()
            )
            engine = AnalyticsEngine(session, user_id)
            calculate = engine._calculate_daily_summaries

            def pause(transactions, dates):
                first_locked.set()
                assert release_first.wait(5)
                return calculate(transactions, dates)

            engine._calculate_daily_summaries = pause
            return engine.refresh_analytics()

    def second_worker():
        with _worker_session(connection, schema, "second") as session:
            worker_pids.add(
                session.connection().exec_driver_sql("SELECT pg_backend_pid()").scalar_one()
            )
            if second_action == "refresh":
                return AnalyticsEngine(session, user_id).refresh_analytics()
            lock_analytics_user(session, user_id)
            if second_action == "ledger":
                txn = session.scalar(select(Transaction).where(Transaction.user_id == user_id))
                txn.amount = Decimal("20.02")
                mark_ledger_changed(session, user_id, [txn.date])
            else:
                prefs = session.scalar(
                    select(UserPreferences).where(UserPreferences.user_id == user_id)
                )
                prefs.excluded_accounts = '["Cash"]'
                mark_preferences_changed(session, user_id)
            session.commit()
            return {"status": "invalidated"}

    event.listen(connection.engine, "before_cursor_execute", observe_lock)
    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            first = pool.submit(first_refresh)
            try:
                assert first_locked.wait(5)
                second = pool.submit(second_worker)
                assert second_waiting.wait(5)
                assert not second.done()
            finally:
                release_first.set()
            assert first.result(timeout=10)["refresh_mode"] == "full"
            second_result = second.result(timeout=10)
    finally:
        event.remove(connection.engine, "before_cursor_execute", observe_lock)
    assert len(worker_pids) == 2
    with Session(connection) as session:
        state = get_analytics_state(session, user_id)
        assert state.published_ledger_version == 1
        assert state.published_preferences_version == 0
        assert session.scalar(select(func.count()).select_from(AuditLog)) == 1
        assert session.scalar(select(DailySummary.total_expenses)) == Decimal("10.01")
        if second_action == "refresh":
            assert second_result["refresh_mode"] == "skipped"
            assert analytics_is_current(state)
        else:
            assert not analytics_is_current(state)
            assert state.ledger_version == (2 if second_action == "ledger" else 1)
            assert state.preferences_version == (1 if second_action == "preferences" else 0)
            result = AnalyticsEngine(session, user_id).refresh_analytics()
            assert result["refresh_mode"] == (
                "selective_summaries" if second_action == "ledger" else "full"
            )
            expected = Decimal("20.02") if second_action == "ledger" else None
            assert session.scalar(select(DailySummary.total_expenses)) == expected
            assert analytics_is_current(get_analytics_state(session, user_id))


def test_superseded_publication_cannot_overwrite_or_clear_dirty_state(publication_db):
    connection, schema, user_id = publication_db
    with _worker_session(connection, schema, "baseline") as session:
        AnalyticsEngine(session, user_id).refresh_analytics()
        original = AnalyticsVersion.from_state(get_analytics_state(session, user_id))
    with _worker_session(connection, schema, "writer") as session:
        lock_analytics_user(session, user_id)
        txn = session.scalar(select(Transaction).where(Transaction.user_id == user_id))
        txn.amount = Decimal("20.02")
        mark_ledger_changed(session, user_id, [txn.date])
        session.commit()
    with _worker_session(connection, schema, "stale") as session:
        lock_analytics_user(session, user_id)
        day = session.scalar(select(DailySummary).where(DailySummary.user_id == user_id))
        day.total_expenses = Decimal("999.99")
        with pytest.raises(StaleAnalyticsRefreshError):
            publish_refresh(session, user_id, original)
        session.rollback()
    with Session(connection) as session:
        state = get_analytics_state(session, user_id)
        assert state.ledger_version == 2
        assert state.published_ledger_version == 1
        assert state.dirty_dates == '["2024-01-02"]'
        assert session.scalar(select(DailySummary.total_expenses)) == Decimal("10.01")
