"""Synthetic API regressions for legacy detections and user-owned commitments."""

from datetime import UTC, datetime
from decimal import Decimal

import pytest

from ledger_sync.db.models import RecurrenceFrequency, RecurringTransaction, TransactionType


def _record(user_id: int, name: str, **overrides) -> RecurringTransaction:
    fields = {
        "user_id": user_id,
        "pattern_name": name,
        "category": "Housing",
        "account": "Synthetic account",
        "transaction_type": TransactionType.EXPENSE,
        "frequency": RecurrenceFrequency.MONTHLY,
        "expected_amount": Decimal("100"),
        "amount_variance": Decimal("0"),
        "expected_day": 1,
        "last_occurrence": datetime(2026, 8, 1, tzinfo=UTC),
        "confidence_score": 90,
        "occurrences_detected": 4,
        "pattern_kind": "commitment",
        "is_user_confirmed": False,
        "is_active": True,
    }
    fields.update(overrides)
    return RecurringTransaction(**fields)


def test_reads_reclassify_legacy_guesses_without_writing_or_crossing_users(two_user_client):
    client, session, user_a, user_b, _ = two_user_client
    broad = _record(user_a.id, "Housing")
    records = [
        broad,
        _record(user_a.id, "Rent"),
        _record(user_a.id, "Daily commute"),
        _record(user_a.id, "Rent refund", transaction_type=TransactionType.INCOME),
        _record(user_a.id, "My custom obligation", is_user_confirmed=True, confidence_score=10),
        _record(user_a.id, "Rent", is_user_confirmed=True, pattern_kind="habit"),
        _record(user_b.id, "Other user's rent"),
    ]
    session.add_all(records)
    session.commit()

    response = client.get("/api/analytics/v2/recurring-transactions?pattern_kind=commitment")
    assert response.status_code == 200
    payload = response.json()
    assert {r["name"] for r in payload["data"]} == {"Rent", "My custom obligation"}
    assert payload["summary"]["commitment_count"] == 2
    assert payload["summary"]["total_monthly_recurring"] == 200
    session.refresh(broad)
    assert broad.pattern_kind == "commitment"  # GET never rewrites persisted state.

    habits = client.get("/api/analytics/v2/recurring-transactions?pattern_kind=habit").json()
    assert {r["name"] for r in habits["data"]} == {
        "Housing",
        "Daily commute",
        "Rent refund",
        "Rent",
    }


def test_manual_monthly_bill_has_a_next_due_date_without_transaction_history(two_user_client):
    client, session, user_a, _, _ = two_user_client
    session.add(
        _record(
            user_a.id,
            "Manual rent",
            is_user_confirmed=True,
            account="Manual",
            last_occurrence=None,
            occurrences_detected=0,
        )
    )
    session.commit()
    response = client.get("/api/analytics/v2/recurring-transactions").json()
    assert response["data"][0]["next_expected"] is not None


def test_reads_do_not_promote_rent_habits_or_weak_cadences_into_bills(two_user_client):
    client, session, user_a, _, _ = two_user_client
    session.add_all(
        [
            _record(user_a.id, "Irregular rent", pattern_kind="habit", confidence_score=95),
            _record(user_a.id, "Weak rent detection", confidence_score=35),
            _record(user_a.id, "Rent without enough history", occurrences_detected=1),
            _record(
                user_a.id, "Confirmed custom rent", confidence_score=10, is_user_confirmed=True
            ),
        ]
    )
    session.commit()
    payload = client.get(
        "/api/analytics/v2/recurring-transactions?pattern_kind=commitment&min_confidence=0"
    ).json()
    assert [row["name"] for row in payload["data"]] == ["Confirmed custom rent"]

    habits = client.get(
        "/api/analytics/v2/recurring-transactions?pattern_kind=habit&min_confidence=0"
    ).json()
    assert {row["name"] for row in habits["data"]} == {
        "Irregular rent",
        "Weak rent detection",
        "Rent without enough history",
    }
    assert all(row["next_expected"] is None for row in habits["data"])


@pytest.mark.parametrize("day", [0, -1, 32])
def test_manual_bill_rejects_an_invalid_due_day(two_user_client, day):
    client, _, _, _, _ = two_user_client
    response = client.post(
        "/api/analytics/v2/recurring-transactions",
        json={
            "name": "Rent",
            "type": "Expense",
            "frequency": "monthly",
            "amount": 100,
            "expected_day": day,
        },
    )
    assert response.status_code == 422
