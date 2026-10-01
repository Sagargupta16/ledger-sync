"""Profile update endpoint: request contract.

`PUT /api/auth/me` had no coverage, and the frontend was calling it with a null
body plus `?full_name=`, against a handler declaring `updates: UserUpdate`.
Saving a display name in the profile modal returned 422 every time. These tests
pin the JSON-body contract, and pin the sibling `/account/reset` as the genuine
query-param endpoint so a future sweep does not "fix" it to match.
"""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

import pytest

from ledger_sync.db.models import (
    CategorizationRule,
    InvestmentHolding,
    SavedFilterView,
    Transaction,
    TransactionType,
    UserPreferences,
)


def _seed_account_data(session, user_id: int) -> None:
    """One row in each table the two reset modes treat differently."""
    session.add_all(
        [
            Transaction(
                transaction_id=f"reset-fixture-{user_id}".ljust(64, "0"),
                user_id=user_id,
                date=datetime(2026, 1, 5, tzinfo=UTC).replace(tzinfo=None),
                amount=Decimal("10.00"),
                currency="INR",
                type=TransactionType.EXPENSE,
                account="Cash",
                category="Food",
                source_file="synthetic.csv",
            ),
            InvestmentHolding(
                user_id=user_id,
                account="Broker",
                investment_type="stocks",
                invested_amount=Decimal("100.00"),
                current_value=Decimal("110.00"),
            ),
            CategorizationRule(user_id=user_id, pattern="swiggy", category="Food"),
            SavedFilterView(user_id=user_id, name="Food", filters="{}"),
        ]
    )
    prefs = session.query(UserPreferences).filter_by(user_id=user_id).one()
    prefs.payday = 25
    session.commit()


def _counts(session, user_id: int) -> dict[str, int]:
    return {
        model.__tablename__: session.query(model).filter_by(user_id=user_id).count()
        for model in (Transaction, InvestmentHolding, CategorizationRule, SavedFilterView)
    }


def test_update_profile_accepts_a_json_body(two_user_client):
    client, session, user_a, _user_b, _current = two_user_client

    response = client.put("/api/auth/me", json={"full_name": "Ledger Owner"})

    assert response.status_code == 200
    assert response.json()["full_name"] == "Ledger Owner"
    session.refresh(user_a)
    assert user_a.full_name == "Ledger Owner"


def test_update_profile_rejects_query_params(two_user_client):
    """Pins the bug's signature so the shape cannot silently regress."""
    client, session, user_a, _user_b, _current = two_user_client
    original = user_a.full_name

    response = client.put("/api/auth/me", params={"full_name": "From Query String"})

    assert response.status_code == 422
    session.refresh(user_a)
    assert user_a.full_name == original


def test_update_profile_tolerates_an_empty_body(two_user_client):
    """`full_name` is optional, so `{}` is a valid no-op rather than a 422."""
    client, session, user_a, _user_b, _current = two_user_client
    original = user_a.full_name

    response = client.put("/api/auth/me", json={})

    assert response.status_code == 200
    assert response.json()["full_name"] == original
    session.refresh(user_a)
    assert user_a.full_name == original


def test_account_reset_really_is_query_param_shaped(two_user_client):
    """The sibling endpoint that legitimately takes a query param.

    Documented as a test because the two calls sat side by side in the same
    frontend module using the same null-body idiom, and only one of them was
    wrong -- the difference is only visible in the handler signatures.
    """
    client, session, user_a, _user_b, _current = two_user_client
    _seed_account_data(session, user_a.id)

    response = client.post("/api/auth/account/reset", params={"mode": "transactions"})

    assert response.status_code == 200
    # The query param took effect: a ledger-only reset, not the default full one.
    assert _counts(session, user_a.id)["transactions"] == 0
    assert session.query(UserPreferences).filter_by(user_id=user_a.id).one().payday == 25


@pytest.mark.parametrize(
    ("mode", "expected"),
    [
        (
            "transactions",
            {
                "transactions": 0,
                "investment_holdings": 0,
                "categorization_rules": 1,
                "saved_filter_views": 1,
            },
        ),
        (
            "full",
            {
                "transactions": 0,
                "investment_holdings": 0,
                "categorization_rules": 0,
                "saved_filter_views": 0,
            },
        ),
    ],
)
def test_account_reset_clears_what_its_mode_names(two_user_client, mode, expected):
    """Holdings are ledger-derived; rules and saved views go only with a full reset."""
    client, session, user_a, user_b, _current = two_user_client
    _seed_account_data(session, user_a.id)
    _seed_account_data(session, user_b.id)

    response = client.post("/api/auth/account/reset", params={"mode": mode})

    assert response.status_code == 200
    message = response.json()["message"]
    assert ("rules, and saved views preserved" in message) == (mode == "transactions")
    session.expire_all()
    assert _counts(session, user_a.id) == expected
    payday = session.query(UserPreferences).filter_by(user_id=user_a.id).one().payday
    assert payday == (25 if mode == "transactions" else 1)
    # The other account is untouched either way.
    assert set(_counts(session, user_b.id).values()) == {1}
