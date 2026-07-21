"""Closed-account status: API, recurring deactivation, anomaly detection.

A closed account keeps its transaction history in analytics but stops being
treated as alive -- no recurring/bill expectations, and post-closure activity
is surfaced as a review anomaly rather than silently absorbed.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

from ledger_sync.core.analytics_engine import AnalyticsEngine
from ledger_sync.db.models import (
    AccountClassification,
    Anomaly,
    AnomalyType,
    RecurrenceFrequency,
    RecurringTransaction,
    Transaction,
    TransactionType,
)


def _txn(user_id: int, tx_id: str, account: str, date: datetime, amount: float) -> Transaction:
    return Transaction(
        transaction_id=tx_id,
        user_id=user_id,
        date=date,
        amount=Decimal(str(amount)),
        currency="INR",
        type=TransactionType.EXPENSE,
        account=account,
        category="Food",
        subcategory=None,
        note="lunch",
        source_file="test.xlsx",
        last_seen_at=datetime.now(UTC),
        is_deleted=False,
    )


def _recurring(user_id: int, account: str, *, confirmed: bool) -> RecurringTransaction:
    now = datetime.now(UTC)
    return RecurringTransaction(
        user_id=user_id,
        pattern_name="Netflix",
        category="Entertainment",
        subcategory=None,
        account=account,
        transaction_type=TransactionType.EXPENSE,
        frequency=RecurrenceFrequency.MONTHLY,
        expected_amount=Decimal("649"),
        amount_variance=Decimal("0"),
        expected_day=5,
        confidence_score=90,
        occurrences_detected=6,
        last_occurrence=now,
        is_active=True,
        is_user_confirmed=confirmed,
        first_detected=now,
        last_updated=now,
    )


def test_status_endpoint_closes_and_reopens(two_user_client) -> None:
    client, session, user_a, _, _ = two_user_client

    r = client.put(
        "/api/account-classifications/status",
        json={"account_name": "CC: Old Axis", "is_closed": True},
    )
    assert r.status_code == 200
    assert r.json()["is_closed"] is True

    row = (
        session.query(AccountClassification)
        .filter_by(user_id=user_a.id, account_name="CC: Old Axis")
        .one()
    )
    assert row.is_closed is True
    assert row.closed_date is not None
    assert client.get("/api/account-classifications/closed").json() == ["CC: Old Axis"]

    r = client.put(
        "/api/account-classifications/status",
        json={"account_name": "CC: Old Axis", "is_closed": False},
    )
    assert r.json()["is_closed"] is False
    session.expire_all()
    assert row.closed_date is None
    assert client.get("/api/account-classifications/closed").json() == []


def test_closing_deactivates_recurring_reopening_restores_confirmed(two_user_client) -> None:
    client, session, user_a, _, _ = two_user_client
    confirmed = _recurring(user_a.id, "CC: Old Axis", confirmed=True)
    auto = _recurring(user_a.id, "CC: Old Axis", confirmed=False)
    auto.pattern_name = "Spotify"
    session.add_all([confirmed, auto])
    session.commit()

    client.put(
        "/api/account-classifications/status",
        json={"account_name": "CC: Old Axis", "is_closed": True},
    )
    session.expire_all()
    assert confirmed.is_active is False
    assert auto.is_active is False

    client.put(
        "/api/account-classifications/status",
        json={"account_name": "CC: Old Axis", "is_closed": False},
    )
    session.expire_all()
    assert confirmed.is_active is True  # user-confirmed comes back
    assert auto.is_active is False  # auto-detected waits for the next detection pass


def test_recurring_detection_skips_closed_accounts(two_user_client) -> None:
    _, session, user_a, _, _ = two_user_client
    base = datetime(2026, 1, 5, tzinfo=UTC)
    for i in range(6):
        session.add(
            _txn(
                user_a.id, f"closed_rec_{i:02d}", "CC: Old Axis", base + timedelta(days=30 * i), 649
            )
        )
    session.add(
        AccountClassification(
            user_id=user_a.id,
            account_name="CC: Old Axis",
            is_closed=True,
            closed_date=datetime.now(UTC),
        )
    )
    session.commit()

    engine = AnalyticsEngine(session, user_id=user_a.id)
    engine._detect_recurring_transactions()  # noqa: SLF001
    session.commit()

    patterns = (
        session.query(RecurringTransaction).filter_by(user_id=user_a.id, is_active=True).all()
    )
    assert patterns == []


def test_anomaly_flags_activity_after_close_date_only(two_user_client) -> None:
    _, session, user_a, _, _ = two_user_client
    closed_at = datetime(2026, 6, 1, tzinfo=UTC)
    # history before closure (must NOT flag) + one refund after (must flag)
    session.add(
        _txn(user_a.id, "before_close_01", "CC: Old Axis", closed_at - timedelta(days=40), 500)
    )
    session.add(
        _txn(user_a.id, "after_close_01", "CC: Old Axis", closed_at + timedelta(days=20), 1200)
    )
    session.add(
        AccountClassification(
            user_id=user_a.id,
            account_name="CC: Old Axis",
            is_closed=True,
            closed_date=closed_at,
        )
    )
    session.commit()

    engine = AnalyticsEngine(session, user_id=user_a.id)
    engine._detect_anomalies()  # noqa: SLF001
    session.commit()

    flagged = (
        session.query(Anomaly)
        .filter_by(user_id=user_a.id, anomaly_type=AnomalyType.CLOSED_ACCOUNT_ACTIVITY)
        .all()
    )
    assert [a.transaction_id for a in flagged] == ["after_close_01"]
    assert "CC: Old Axis" in flagged[0].description
