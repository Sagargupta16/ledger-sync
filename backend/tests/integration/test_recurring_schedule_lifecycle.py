"""Recurring API lifecycle preserves schedules with SQLite/PG FK enforcement."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import event, select
from sqlalchemy.orm import Session

from ledger_sync.api.analytics_v2_impl.recurring import router
from ledger_sync.api.deps import get_current_user
from ledger_sync.core import query_helpers
from ledger_sync.core.analytics.engine import AnalyticsEngine
from ledger_sync.db.models import RecurringTransaction, User
from ledger_sync.db.session import get_session
from tests.integration.test_migrations_from_scratch import (
    migration_connection as _migration_connection,
)
from tests.integration.test_scheduled_references import (
    _recurring,
    _schedule,
    _schedules,
)
from tests.integration.test_scheduled_references import (
    scheduled_db as _scheduled_db,
)

migration_connection = _migration_connection
scheduled_db = _scheduled_db


@pytest.fixture
def lifecycle_api(scheduled_db, monkeypatch):
    connection = scheduled_db
    # This process tests both databases; the application's date helpers normally
    # select one dialect from its configured database URL at import time.
    monkeypatch.setattr(query_helpers, "_is_sqlite", connection.dialect.name == "sqlite")
    for identity, owner, confirmed in ((10, 1, True), (11, 1, True), (20, 2, False)):
        _recurring(connection, identity, owner, confirmed)
    for identity, source, owner, active in (
        (100, 10, 1, True),
        (101, 10, 1, False),
        (102, 11, 1, True),
        (103, None, 1, True),
        (200, 20, 2, True),
    ):
        _schedule(connection, identity, source, owner, active)
    connection.commit()
    session = Session(connection, autoflush=False)
    app = FastAPI()
    app.include_router(router, prefix="/api/analytics/v2")
    user = session.get(User, 1)

    def authenticated_user():
        return user

    def request_session():
        try:
            yield session
        except Exception:
            session.rollback()
            raise

    app.dependency_overrides[get_current_user] = authenticated_user
    app.dependency_overrides[get_session] = request_session
    with TestClient(app) as client:
        yield client, session, connection
    session.close()


def _snapshot(connection):
    return {row["id"]: dict(row) for row in _schedules(connection)}


def _assert_only_links_changed(before, after, detached):
    expected = {
        identity: {**values, "recurring_transaction_id": None} if identity in detached else values
        for identity, values in before.items()
    }
    assert after == expected


def test_individual_and_repeated_deletion_preserve_every_schedule_field(lifecycle_api):
    client, session, connection = lifecycle_api
    before = _snapshot(connection)
    result = client.delete("/api/analytics/v2/recurring-transactions/10")
    assert result.status_code == 200, result.text
    assert result.json() == {"status": "ok", "id": 10}
    _assert_only_links_changed(before, _snapshot(connection), {100, 101})
    assert session.get(RecurringTransaction, 10) is None
    assert client.delete("/api/analytics/v2/recurring-transactions/10").status_code == 404
    _assert_only_links_changed(before, _snapshot(connection), {100, 101})
    # Multiple manual deletions use the same per-item API and must each detach.
    assert client.delete("/api/analytics/v2/recurring-transactions/11").status_code == 200
    _assert_only_links_changed(before, _snapshot(connection), {100, 101, 102})


def test_cross_user_and_missing_delete_do_not_detach_any_schedule(lifecycle_api):
    client, _, connection = lifecycle_api
    before = _snapshot(connection)
    for identity in (20, 999):
        assert (
            client.delete(f"/api/analytics/v2/recurring-transactions/{identity}").status_code == 404
        )
    assert _snapshot(connection) == before


def test_unconfirm_then_bulk_refresh_detaches_only_disappearing_sources(lifecycle_api):
    client, session, connection = lifecycle_api
    before = _snapshot(connection)
    for identity in (10, 11):
        result = client.patch(
            f"/api/analytics/v2/recurring-transactions/{identity}",
            json={"is_confirmed": False, "is_active": False},
        )
        assert result.status_code == 200, result.text
    # Rejecting/unconfirming does not itself delete the source or change a
    # schedule's independent active flag. The next detector pass replaces sources.
    assert _snapshot(connection) == before
    AnalyticsEngine(session, user_id=1).run_full_analytics()
    _assert_only_links_changed(before, _snapshot(connection), {100, 101, 102})
    assert (
        session.scalars(
            select(RecurringTransaction.id).where(RecurringTransaction.user_id == 1)
        ).all()
        == []
    )
    assert session.get(RecurringTransaction, 20) is not None


def test_failed_parent_delete_rolls_back_schedule_detachment(lifecycle_api):
    client, session, connection = lifecycle_api
    before = _snapshot(connection)

    def fail_delete(_conn, _cursor, statement, _parameters, _context, _many):
        if statement.lstrip().upper().startswith("DELETE FROM RECURRING_TRANSACTIONS"):
            raise RuntimeError("synthetic delete failure")

    event.listen(connection.engine, "before_cursor_execute", fail_delete)
    try:
        with pytest.raises(RuntimeError, match="synthetic delete failure"):
            client.delete("/api/analytics/v2/recurring-transactions/10")
    finally:
        event.remove(connection.engine, "before_cursor_execute", fail_delete)
    assert _snapshot(connection) == before
    assert session.get(RecurringTransaction, 10) is not None
