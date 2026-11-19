"""The ``reconciliation`` block of GET /api/analytics/v2/data-health.

It folds the user's balance checks and the bank alert inbox into one verdict:
``reconciled``, ``attention`` (a mismatch or a missing alert) or ``unchecked``.
"""

from __future__ import annotations

from datetime import UTC, datetime, time, timedelta
from decimal import Decimal
from hashlib import sha256

from ledger_sync.core.import_reconciliation import ReconciliationState, reconciliation_state
from ledger_sync.core.ledger_clock import ledger_today
from ledger_sync.db.models import BalanceCheck, BankAlert, Transaction, TransactionType

HEALTH_URL = "/api/analytics/v2/data-health"
ACCOUNT = "HDFC Bank"


def _income(user_id: int, tx_id: str, amount: str) -> Transaction:
    day = ledger_today() - timedelta(days=1)
    return Transaction(
        transaction_id=tx_id,
        user_id=user_id,
        date=datetime.combine(day, time(10, 0)),
        amount=Decimal(amount),
        currency="INR",
        type=TransactionType.INCOME,
        account=ACCOUNT,
        category="Salary",
        subcategory=None,
        note="pay",
        source_file="test.xlsx",
        last_seen_at=datetime.now(UTC),
        is_deleted=False,
    )


def _check(user_id: int, balance: str) -> BalanceCheck:
    return BalanceCheck(
        user_id=user_id,
        account=ACCOUNT,
        check_date=ledger_today() - timedelta(days=1),
        balance=Decimal(balance),
    )


def _alert(user_id: int, key: str) -> BankAlert:
    return BankAlert(
        user_id=user_id,
        text_hash=sha256(key.encode()).hexdigest(),
        direction="debit",
        amount=Decimal("777.00"),
        occurred_on=ledger_today(),
    )


def _reconciliation(client) -> dict:
    return client.get(HEALTH_URL).json()["reconciliation"]


def test_unchecked_with_no_checks_or_alerts(two_user_client) -> None:
    client, _, _, _, _ = two_user_client

    assert _reconciliation(client) == {
        "state": "unchecked",
        "accounts_matched": 0,
        "accounts_mismatched": 0,
        "accounts_changed": 0,
        "alerts_missing": 0,
        "score_pct": None,
    }


def test_reconciled_when_the_check_matches_the_ledger(two_user_client) -> None:
    client, session, user_a, _, _ = two_user_client
    session.add_all([_income(user_a.id, "t1", "1000"), _check(user_a.id, "1000")])
    session.commit()

    body = _reconciliation(client)

    assert body["state"] == "reconciled"
    assert body["accounts_matched"] == 1
    assert body["score_pct"] == 100


def test_attention_from_a_mismatch(two_user_client) -> None:
    client, session, user_a, _, _ = two_user_client
    session.add_all([_income(user_a.id, "t1", "1000"), _check(user_a.id, "400")])
    session.commit()

    body = _reconciliation(client)

    assert body["state"] == "attention"
    assert body["accounts_mismatched"] == 1
    assert body["score_pct"] == 0


def test_attention_from_a_missing_alert(two_user_client) -> None:
    client, session, user_a, _, _ = two_user_client
    session.add_all([_income(user_a.id, "t1", "1000"), _check(user_a.id, "1000")])
    session.add(_alert(user_a.id, "a1"))
    session.commit()

    body = _reconciliation(client)

    assert body["state"] == "attention"
    assert body["alerts_missing"] == 1
    assert body["accounts_matched"] == 1


def test_another_users_checks_and_alerts_do_not_count(two_user_client) -> None:
    client, session, user_a, user_b, current = two_user_client
    session.add_all([_income(user_b.id, "t1", "1000"), _check(user_b.id, "400")])
    session.add(_alert(user_b.id, "a1"))
    session.commit()

    assert _reconciliation(client)["state"] == "unchecked"

    current["user"] = user_b
    assert _reconciliation(client)["state"] == "attention"
    assert user_a.id != user_b.id


def test_state_is_derived_in_one_place() -> None:
    assert (
        reconciliation_state(matched=2, mismatched=0, alerts_missing=0)
        is ReconciliationState.RECONCILED
    )
    assert (
        reconciliation_state(matched=2, mismatched=1, alerts_missing=0)
        is ReconciliationState.ATTENTION
    )
    assert (
        reconciliation_state(matched=0, mismatched=0, alerts_missing=0)
        is ReconciliationState.UNCHECKED
    )


def test_a_failed_reconciliation_read_never_blanks_data_health(
    two_user_client, monkeypatch
) -> None:
    """Data Health feeds the startup prefetch and the stale banner, so it must still answer."""
    from ledger_sync.api.analytics_v2_impl import summaries_health

    def broken(*_args: object) -> None:
        raise RuntimeError("balance read failed")

    monkeypatch.setattr(summaries_health, "reconciliation_summary", broken)
    client, *_ = two_user_client

    response = client.get(HEALTH_URL)

    assert response.status_code == 200
    body = response.json()
    assert body["reconciliation"] is None
    assert "rollups_stale" in body
