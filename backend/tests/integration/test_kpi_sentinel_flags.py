"""Integration tests for the undefined-case flags on /api/analytics/{kpis,trends}.

Two KPI numbers have an undefined case that returns a plausible value instead of
an error, and both sentinels happen to look like GOOD news:

* ``consistency_score`` is a flat 100.0 -- the best possible reading -- whenever a
  coefficient of variation is undefined (fewer than two months, or a zero mean).
* ``spending_velocity`` is 0.0 when nothing sits outside the recent window, which
  reads as "spending is 100% down" for a user whose whole ledger is recent.

The insight generators already abstain in both cases. These endpoints published
the raw numbers with nothing to distinguish sentinel from measurement, so each now
ships a companion boolean. These tests pin that flag to the precondition rather
than to the value, so a caller can trust it.
"""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from ledger_sync.api.deps import get_current_user
from ledger_sync.api.main import app
from ledger_sync.db.base import Base
from ledger_sync.db.models import Transaction, TransactionType, User, UserPreferences
from ledger_sync.db.session import get_session


@pytest.fixture
def kpi_client():
    # StaticPool + check_same_thread=False so the fixture thread and the
    # TestClient request thread share one in-memory database.
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestSession = sessionmaker(bind=engine)  # noqa: N806
    session = TestSession()

    user = User(email="kpi@example.com", is_active=True, is_verified=True, hashed_password="")
    session.add(user)
    session.flush()
    session.add(UserPreferences(user_id=user.id, essential_categories="[]"))
    session.commit()

    def override_get_session():
        yield session

    def override_get_current_user():
        return user

    app.dependency_overrides[get_session] = override_get_session
    app.dependency_overrides[get_current_user] = override_get_current_user

    client = TestClient(app)
    yield client, session, user

    app.dependency_overrides.clear()
    session.close()


def _add_expense(
    session: Session,
    user_id: int,
    *,
    date: datetime,
    amount: float,
) -> None:
    tid = f"{date.isoformat()}-{amount}"
    session.add(
        Transaction(
            transaction_id=tid.ljust(64, "0")[:64],
            user_id=user_id,
            date=date,
            amount=Decimal(str(amount)),
            currency="INR",
            type=TransactionType.EXPENSE,
            account="HDFC Savings",
            category="Food & Dining",
            subcategory=None,
            note="seed",
            source_file="test",
        )
    )


# --------------------------------------------------------------------------
# consistency_measurable
# --------------------------------------------------------------------------


def test_empty_ledger_reports_consistency_as_unmeasurable(kpi_client):
    client, _session, _user = kpi_client
    for path in ("/api/analytics/kpis", "/api/analytics/trends"):
        body = client.get(path).json()
        assert body["consistency_measurable"] is False, path


def test_a_single_month_reports_consistency_as_unmeasurable(kpi_client):
    """One observation cannot have a coefficient of variation."""
    client, session, user = kpi_client
    _add_expense(session, user.id, date=datetime(2026, 3, 5, tzinfo=UTC), amount=10_000)
    _add_expense(session, user.id, date=datetime(2026, 3, 19, tzinfo=UTC), amount=4_000)
    session.commit()

    for path in ("/api/analytics/kpis", "/api/analytics/trends"):
        body = client.get(path).json()
        # The score itself is still the flat sentinel -- that is the whole point.
        assert body["consistency_score"] == pytest.approx(100.0), path
        assert body["consistency_measurable"] is False, path


def test_two_months_of_expenses_report_consistency_as_measurable(kpi_client):
    client, session, user = kpi_client
    _add_expense(session, user.id, date=datetime(2026, 2, 10, tzinfo=UTC), amount=10_000)
    _add_expense(session, user.id, date=datetime(2026, 3, 10, tzinfo=UTC), amount=30_000)
    session.commit()

    for path in ("/api/analytics/kpis", "/api/analytics/trends"):
        body = client.get(path).json()
        assert body["consistency_measurable"] is True, path
        # Real variance, so a real score below the sentinel.
        assert body["consistency_score"] < 100.0, path


def test_two_months_of_zero_expenses_report_consistency_as_unmeasurable(kpi_client):
    """A zero mean also returns the sentinel, so the flag must catch it too."""
    client, session, user = kpi_client
    _add_expense(session, user.id, date=datetime(2026, 2, 10, tzinfo=UTC), amount=0)
    _add_expense(session, user.id, date=datetime(2026, 3, 10, tzinfo=UTC), amount=0)
    session.commit()

    body = client.get("/api/analytics/kpis").json()
    assert body["consistency_score"] == pytest.approx(100.0)
    assert body["consistency_measurable"] is False


# --------------------------------------------------------------------------
# velocity_comparable
# --------------------------------------------------------------------------


def test_empty_ledger_reports_velocity_as_not_comparable(kpi_client):
    client, _session, _user = kpi_client
    body = client.get("/api/analytics/kpis").json()
    assert body["velocity_comparable"] is False


def test_a_ledger_entirely_inside_the_recent_window_is_not_comparable(kpi_client):
    """No history outside the window means the 0.0 ratio is not a 100% drop."""
    client, session, user = kpi_client
    # The window is anchored on the newest expense, so two adjacent days are both
    # inside it and nothing lands in the historical branch.
    _add_expense(session, user.id, date=datetime(2026, 3, 10, tzinfo=UTC), amount=5_000)
    _add_expense(session, user.id, date=datetime(2026, 3, 11, tzinfo=UTC), amount=5_000)
    session.commit()

    body = client.get("/api/analytics/kpis").json()
    assert body["spending_velocity"] == pytest.approx(0.0)
    assert body["velocity_comparable"] is False


def test_history_outside_the_window_makes_velocity_comparable(kpi_client):
    client, session, user = kpi_client
    _add_expense(session, user.id, date=datetime(2025, 6, 10, tzinfo=UTC), amount=20_000)
    _add_expense(session, user.id, date=datetime(2025, 8, 15, tzinfo=UTC), amount=20_000)
    _add_expense(session, user.id, date=datetime(2026, 3, 10, tzinfo=UTC), amount=5_000)
    session.commit()

    body = client.get("/api/analytics/kpis").json()
    assert body["velocity_comparable"] is True
    assert body["spending_velocity"] > 0
