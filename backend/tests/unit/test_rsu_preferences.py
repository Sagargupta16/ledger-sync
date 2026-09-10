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
