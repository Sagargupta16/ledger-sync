"""RSU actual received units survive the preferences API without inference."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

import pytest


@pytest.mark.parametrize("actual", [None, "0", "17.200123", "25"])
def test_received_units_round_trip_without_changing_gross(
    two_user_client: Any, actual: str | None
) -> None:
    client, _, _, _, _ = two_user_client
    vesting: dict[str, Any] = {
        "date": "2025-08-15",
        "quantity": 25,
        "price_at_vest": 150,
    }
    if actual is not None:
        vesting["net_quantity"] = actual

    response = client.put(
        "/api/preferences/rsu-grants",
        json={
            "rsu_grants": [
                {
                    "id": "synthetic-rsu",
                    "stock_name": "TEST",
                    "stock_price": 200,
                    "vestings": [vesting],
                }
            ]
        },
    )

    assert response.status_code == 200
    saved = response.json()["rsu_grants"][0]["vestings"][0]
    assert saved["quantity"] == 25
    assert Decimal(str(saved["price_at_vest"])) == Decimal("150")
    if actual is None:
        assert saved["net_quantity"] is None
    else:
        assert Decimal(str(saved["net_quantity"])) == Decimal(actual)


@pytest.mark.parametrize("mode", [None, "recurring", "one_time"])
def test_bonus_mode_round_trip_preserves_zero_growth(
    two_user_client: Any, mode: str | None
) -> None:
    client, _, _, _, _ = two_user_client
    growth: dict[str, Any] = {"bonus_growth_pct": 0}
    if mode is not None:
        growth["bonus_mode"] = mode

    response = client.put(
        "/api/preferences/growth-assumptions", json={"growth_assumptions": growth}
    )

    assert response.status_code == 200
    saved = response.json()["growth_assumptions"]
    assert saved["bonus_growth_pct"] == 0
    assert saved["bonus_mode"] == mode


def test_general_preferences_edit_targets_duplicate_vesting_id(two_user_client: Any) -> None:
    client, _, _, _, _ = two_user_client
    event = {"date": "2025-08-15", "quantity": 25, "net_quantity": "17.200123456789"}
    response = client.put(
        "/api/preferences",
        json={
            "rsu_grants": [
                {
                    "id": "synthetic-rsu",
                    "stock_name": "TEST",
                    "stock_price": "200.123456789",
                    "vestings": [event, event],
                }
            ],
        },
    )
    assert response.status_code == 200
    saved = response.json()["rsu_grants"]
    ids = [vesting["id"] for vesting in saved[0]["vestings"]]
    assert len(set(ids)) == 2
    saved[0]["vestings"] = [saved[0]["vestings"][1]]
    saved[0]["vestings"][0]["net_quantity"] = "0"
    response = client.put("/api/preferences", json={"rsu_grants": saved})
    assert response.status_code == 200
    actual = response.json()["rsu_grants"][0]["vestings"]
    assert len(actual) == 1
    assert actual[0]["id"] == ids[1]
    assert Decimal(actual[0]["net_quantity"]) == 0


@pytest.mark.parametrize(
    "payload",
    [
        {"salary_structure": {"2025-26": {"unknown_compensation_field": 1}}},
        {"salary_structure": {"2025-28": {}}},
        {
            "rsu_grants": [
                {
                    "id": "g1",
                    "stock_name": "TEST",
                    "stock_price": 1,
                    "vestings": [
                        {"date": "2025-08-15", "quantity": 1, "net_quantity": "1.00000000001"}
                    ],
                }
            ]
        },
    ],
)
def test_invalid_general_compensation_returns_422(two_user_client: Any, payload: dict) -> None:
    client, _, _, _, _ = two_user_client
    before = client.get("/api/preferences").json()
    response = client.put("/api/preferences", json=payload)
    assert response.status_code == 422
    after = client.get("/api/preferences").json()
    assert after["salary_structure"] == before["salary_structure"]
    assert after["rsu_grants"] == before["rsu_grants"]


@pytest.mark.parametrize(
    "payload",
    [
        {"payday": 99},
        {"payday": 0},
        {"savings_goal_percent": 5000},
        {"needs_target_percent": 90, "wants_target_percent": 101},
        {"earning_start_date": "not-a-date"},
        {"earning_start_date": "2026-02-30"},
        {"preferred_tax_regime": "xyz"},
        {"monthly_investment_target": -1},
        {"monthly_investment_target": 1e308},
        {"number_format": "roman"},
        {"currency_symbol_position": "middle"},
        {"fiscal_year_start_month": 13},
        {"recurring_auto_confirm_occurrences": 1},
        {"anomaly_expense_threshold": 0.5},
        {"notify_days_ahead": 2**40},
        {"growth_assumptions": {"projection_years": 9}},
    ],
)
def test_invalid_general_preferences_return_422_without_writing(
    two_user_client: Any, payload: dict
) -> None:
    """The bulk Settings save enforces the same contract as the section endpoints."""
    client, _, _, _, _ = two_user_client
    before = client.get("/api/preferences").json()

    response = client.put("/api/preferences", json=payload)

    assert response.status_code == 422, response.text
    assert client.get("/api/preferences").json() == before


@pytest.mark.parametrize(
    "body",
    [
        b'{"savings_goal_percent": NaN}',
        b'{"default_budget_alert_threshold": Infinity}',
        b'{"growth_assumptions": {"base_salary_growth_pct": NaN}}',
    ],
)
def test_non_finite_general_preferences_return_422(two_user_client: Any, body: bytes) -> None:
    """A stored NaN would make every later preferences response unserializable."""
    client, _, _, _, _ = two_user_client
    before = client.get("/api/preferences").json()

    response = client.put(
        "/api/preferences", content=body, headers={"Content-Type": "application/json"}
    )

    assert response.status_code == 422, response.text
    after = client.get("/api/preferences")
    assert after.status_code == 200
    assert after.json() == before


def test_general_preferences_accept_section_valid_values(two_user_client: Any) -> None:
    client, _, _, _, _ = two_user_client
    values = {
        "payday": 31,
        "savings_goal_percent": 100,
        "needs_target_percent": 0,
        "wants_target_percent": 50,
        "savings_target_percent": 50,
        "preferred_tax_regime": "old",
        "earning_start_date": "2024-02-29",
        "monthly_investment_target": 25000.5,
        "number_format": "international",
        "currency_symbol": "CA$",
        "currency_symbol_position": "after",
        "notify_days_ahead": 14,
    }

    response = client.put(
        "/api/preferences", json={**values, "growth_assumptions": {"bonus_growth_pct": 0}}
    )

    assert response.status_code == 200, response.text
    saved = response.json()
    assert {key: saved[key] for key in values} == values
    # Validated like the section endpoint: defaults filled, the explicit null kept.
    assert saved["growth_assumptions"]["projection_years"] == 3
    assert saved["growth_assumptions"]["bonus_mode"] is None
