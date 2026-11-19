"""The scheduled drain finishes owed refreshes, and its endpoint takes the cron secret."""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from ledger_sync.api import analytics_v2
from ledger_sync.config.push_settings import push_settings
from ledger_sync.core.analytics.drain import refresh_due_users
from ledger_sync.core.analytics.engine import AnalyticsEngine
from ledger_sync.core.analytics.refresh import (
    analytics_inputs_current,
    get_analytics_state,
    mark_ledger_changed,
)
from ledger_sync.core.analytics.refresh_budget import apply_refresh_budget
from ledger_sync.db import session as session_module
from ledger_sync.db.base import Base
from ledger_sync.db.models import User

SECRET = "synthetic-cron-secret"  # noqa: S105 - test value, not a credential


@pytest.fixture
def factory():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)


def _add_user(factory, email: str, *, owed: bool) -> int:
    with factory() as db:
        user = User(email=email, is_active=True)
        db.add(user)
        db.commit()
        uid = user.id
        if owed:
            mark_ledger_changed(db, uid)
        else:
            AnalyticsEngine(db, user_id=uid).refresh_analytics()
        db.commit()
    return uid


def _current(factory, uid: int) -> bool:
    with factory() as db:
        return analytics_inputs_current(get_analytics_state(db, uid))


def test_user_with_owed_inputs_is_refreshed(factory):
    uid = _add_user(factory, "owed@example.test", owed=True)
    assert not _current(factory, uid)

    report = refresh_due_users(factory)

    assert (report.due, report.refreshed, report.failed, report.deferred) == (1, 1, 0, 0)
    assert _current(factory, uid)


def test_current_user_is_not_touched(factory, monkeypatch):
    _add_user(factory, "current@example.test", owed=False)
    calls: list[int] = []
    monkeypatch.setattr(
        AnalyticsEngine, "refresh_analytics", lambda self, **kw: calls.append(self.user_id)
    )

    report = refresh_due_users(factory)

    assert (report.due, report.refreshed) == (0, 0)
    assert calls == []


def test_one_failure_does_not_stop_the_next_user(factory, monkeypatch):
    first = _add_user(factory, "first@example.test", owed=True)
    second = _add_user(factory, "second@example.test", owed=True)
    real = AnalyticsEngine.refresh_analytics

    def flaky(self, **kwargs):
        if self.user_id == first:
            raise RuntimeError("synthetic failure")
        return real(self, **kwargs)

    monkeypatch.setattr(AnalyticsEngine, "refresh_analytics", flaky)

    report = refresh_due_users(factory)

    assert (report.due, report.refreshed, report.failed) == (2, 1, 1)
    assert not _current(factory, first)
    assert _current(factory, second)


def test_deadline_defers_the_rest(factory):
    _add_user(factory, "a@example.test", owed=True)
    _add_user(factory, "b@example.test", owed=True)

    report = refresh_due_users(factory, deadline_seconds=0)

    assert (report.due, report.refreshed, report.deferred) == (2, 0, 2)


def test_limit_caps_the_users_selected(factory):
    for n in range(3):
        _add_user(factory, f"u{n}@example.test", owed=True)

    report = refresh_due_users(factory, limit=2)

    assert (report.due, report.refreshed) == (2, 2)


def test_apply_refresh_budget_is_a_no_op_on_sqlite(factory):
    executed: list[object] = []
    with factory() as db:
        db.execute = lambda *args, **kwargs: executed.append(args)  # type: ignore[method-assign]
        apply_refresh_budget(db)
    assert executed == []


@pytest.fixture
def client(factory, monkeypatch):
    monkeypatch.setattr(session_module, "SessionLocal", factory)
    app = FastAPI()
    app.include_router(analytics_v2.router)
    return TestClient(app)


def test_refresh_due_without_configured_secret_is_503(client, monkeypatch):
    monkeypatch.setattr(push_settings, "cron_secret", SecretStr(""))
    assert client.get("/api/analytics/v2/refresh-due").status_code == 503
    assert client.post("/api/analytics/v2/refresh-due").status_code == 503


@pytest.mark.parametrize("header", [None, "Bearer wrong", SECRET])
def test_refresh_due_with_wrong_secret_is_401(client, monkeypatch, header):
    monkeypatch.setattr(push_settings, "cron_secret", SecretStr(SECRET))
    headers = {"Authorization": header} if header else {}
    response = client.get("/api/analytics/v2/refresh-due", headers=headers)
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


@pytest.mark.parametrize("method", ["get", "post"])
def test_refresh_due_with_the_secret_runs_the_drain(client, factory, monkeypatch, method):
    monkeypatch.setattr(push_settings, "cron_secret", SecretStr(SECRET))
    uid = _add_user(factory, "owed@example.test", owed=True)

    response = getattr(client, method)(
        "/api/analytics/v2/refresh-due", headers={"Authorization": f"Bearer {SECRET}"}
    )

    assert response.status_code == 200
    assert response.json() == {"due": 1, "refreshed": 1, "failed": 0, "deferred": 0}
    assert _current(factory, uid)
