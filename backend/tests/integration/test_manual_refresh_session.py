"""Manual refresh shares authentication's connection and owns failure rollback."""

import asyncio
import logging
from types import SimpleNamespace
from unittest.mock import MagicMock

import httpx
import pytest
from fastapi import FastAPI
from sqlalchemy import create_engine, event, func, select, update
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import QueuePool

from ledger_sync.api import analytics_v2
from ledger_sync.core.auth import create_tokens
from ledger_sync.db import session as session_module
from ledger_sync.db.base import Base
from ledger_sync.db.models import AuditLog, User


@pytest.fixture
def refresh_pool(monkeypatch):
    engine = create_engine(
        "sqlite:///:memory:",
        poolclass=QueuePool,
        pool_size=1,
        max_overflow=0,
        pool_timeout=0.05,
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(engine)
    sessions = []

    class RequestSession(Session):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            sessions.append(self)

    factory = sessionmaker(bind=engine, class_=RequestSession, autoflush=False)
    with factory() as db:
        user = User(email="synthetic@example.test", is_active=True)
        db.add(user)
        db.commit()
        user_id = user.id
        token = create_tokens(user_id, user.email, user.token_version).access_token
    sessions.clear()
    monkeypatch.setattr(session_module, "SessionLocal", factory)
    application = FastAPI()
    application.include_router(analytics_v2.router)

    def post(*, force_full=False):
        async def request():
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=application), base_url="http://test"
            ) as client:
                return await client.post(
                    "/api/analytics/v2/refresh",
                    params={"force_full": str(force_full).lower()},
                    headers={"Authorization": f"Bearer {token}"},
                )

        return asyncio.run(request())

    try:
        yield engine, factory, sessions, user_id, post
    finally:
        engine.dispose()


@pytest.mark.parametrize("force_full", [False, True])
def test_refresh_uses_one_connection_and_retains_force_full(refresh_pool, force_full):
    engine, factory, sessions, _, post = refresh_pool
    first = post(force_full=force_full)
    assert first.status_code == 200
    assert set(first.json()) == {"success", "analytics"}
    assert len(sessions) == 1
    assert not sessions[0].in_transaction()
    assert engine.pool.checkedout() == 0

    repeated = post(force_full=force_full)
    assert repeated.status_code == 200
    assert len(sessions) == 2
    assert engine.pool.checkedout() == 0
    if not force_full:
        assert repeated.json() == {"success": True, "analytics": {}}
    with factory() as db:
        assert db.scalar(
            select(func.count()).select_from(AuditLog).where(AuditLog.operation == "analytics")
        ) == (2 if force_full else 1)


@pytest.mark.parametrize("failure_phase", ["constructor", "refresh"])
def test_refresh_failure_rolls_back_and_hides_database_details(
    refresh_pool, monkeypatch, caplog, failure_phase
):
    engine, factory, sessions, user_id, post = refresh_pool
    marker = "synthetic-private-value"
    phases = []

    class FailingEngine:
        def __init__(self, db, user_id):
            self.db = db
            self.user_id = user_id
            if failure_phase == "constructor":
                self.fail()

        def fail(self):
            assert self.user_id == user_id
            self.db.execute(update(User).where(User.id == user_id).values(full_name=marker))
            raise OperationalError("synthetic UPDATE", {"value": marker}, RuntimeError(marker))

        def refresh_analytics(self, **_kwargs):
            self.fail()

    def record_query(*_args):
        phases.append("query")

    def record_rollback(*_args):
        phases.append("rollback")

    monkeypatch.setattr(analytics_v2, "AnalyticsEngine", FailingEngine)
    event.listen(engine, "before_cursor_execute", record_query)
    event.listen(Session, "after_soft_rollback", record_rollback)
    try:
        with caplog.at_level(logging.WARNING, logger="ledger_sync"):
            response = post()
    finally:
        event.remove(engine, "before_cursor_execute", record_query)
        event.remove(Session, "after_soft_rollback", record_rollback)
    assert response.status_code == 500
    assert response.json() == {"detail": "Analytics refresh failed. Please try again."}
    assert marker not in caplog.text
    assert "OperationalError" in caplog.text
    assert phases[-1] == "rollback"  # Logging must not lazy-load the expired ORM user.
    assert len(sessions) == 1
    assert not sessions[0].in_transaction()
    assert engine.pool.checkedout() == 0
    with factory() as db:
        assert db.get(User, user_id).full_name is None


def test_refresh_leaves_request_session_open(two_user_client):
    client, session, user, _, _ = two_user_client
    response = client.post("/api/analytics/v2/refresh")
    assert response.status_code == 200
    assert user in session
    assert not session.in_transaction()


@pytest.mark.parametrize("force_full", [False, True])
def test_postgres_timeout_overrides_are_transaction_local(monkeypatch, force_full):
    db = MagicMock()
    db.bind.dialect.name = "postgresql"
    engine_factory = MagicMock()
    analytics = engine_factory.return_value
    analytics.refresh_analytics.return_value = {}
    analytics.run_full_analytics.return_value = {}
    monkeypatch.setattr(analytics_v2, "AnalyticsEngine", engine_factory)
    analytics_v2.refresh_analytics(SimpleNamespace(id=7), db, force_full=force_full)
    assert [str(call.args[0]) for call in db.execute.call_args_list] == [
        "SET LOCAL statement_timeout = '120s'",
        "SET LOCAL idle_in_transaction_session_timeout = '300s'",
    ]
    engine_factory.assert_called_once_with(db, user_id=7)
    selected = analytics.run_full_analytics if force_full else analytics.refresh_analytics
    selected.assert_called_once_with(source_file="manual-refresh")
    db.close.assert_not_called()
