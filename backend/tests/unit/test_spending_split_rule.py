"""Needs + wants + savings must total 100% (tolerance 0.01) on every write path."""

from __future__ import annotations

from typing import Any

import pytest

_SPLIT = ("needs_target_percent", "wants_target_percent", "savings_target_percent")
_MESSAGE = "Needs, wants and savings must total 100% (currently {}%)."


def _split(response: Any) -> tuple[float, ...]:
    return tuple(response.json()[field] for field in _SPLIT)


def test_section_endpoint_rejects_a_split_that_misses_100(two_user_client: Any) -> None:
    client, _, _, _, _ = two_user_client
    before = client.get("/api/preferences")

    response = client.put(
        "/api/preferences/spending-rule",
        json=dict(zip(_SPLIT, (50, 30, 15), strict=True)),
    )

    assert response.status_code == 422
    assert response.json()["detail"][0]["msg"] == "Value error, " + _MESSAGE.format(95)
    assert _split(client.get("/api/preferences")) == _split(before)


@pytest.mark.parametrize(
    ("payload", "total"),
    [
        (dict(zip(_SPLIT, (60, 30, 20), strict=True)), "110"),
        # Partial updates are judged against the stored 50 / 30 / 20.
        ({"needs_target_percent": 60}, "110"),
        ({"wants_target_percent": 20, "savings_target_percent": 20}, "90"),
        (dict(zip(_SPLIT, (33.33, 33.33, 33.32), strict=True)), "99.98"),
    ],
)
def test_bulk_update_rejects_the_merged_split_before_writing(
    two_user_client: Any, payload: dict, total: str
) -> None:
    client, _, _, _, _ = two_user_client
    before = client.get("/api/preferences").json()

    response = client.put("/api/preferences", json={**payload, "payday": 15})

    assert response.status_code == 422
    assert response.json()["detail"] == _MESSAGE.format(total)
    assert client.get("/api/preferences").json() == before


@pytest.mark.parametrize(
    ("payload", "expected"),
    [
        ({"needs_target_percent": 40, "wants_target_percent": 40}, (40, 40, 20)),
        (dict(zip(_SPLIT, (33.33, 33.33, 33.33), strict=True)), (33.33, 33.33, 33.33)),
        (dict(zip(_SPLIT, (0, 0, 100), strict=True)), (0, 0, 100)),
        ({"payday": 15}, (50, 30, 20)),
    ],
)
def test_bulk_update_accepts_splits_within_tolerance(
    two_user_client: Any, payload: dict, expected: tuple[float, ...]
) -> None:
    client, _, _, _, _ = two_user_client

    response = client.put("/api/preferences", json=payload)

    assert response.status_code == 200, response.text
    assert _split(response) == expected
