"""Integration tests for the /api/saved-views endpoints.

Covers create/list roundtrip (opaque filters echoed verbatim), upsert-by-name
semantics, idempotent delete, user scoping, and the response contract.
"""

from __future__ import annotations

import pytest

VIEW_KEYS = {"id", "name", "filters", "created_at", "updated_at"}


@pytest.fixture
def views_client(two_user_client):
    """Alias for the shared two-user HTTP fixture (see tests/conftest.py)."""
    return two_user_client


def test_post_creates_and_get_lists(views_client) -> None:
    client, _, _, _, _ = views_client
    filters = {
        "category": "Food",
        "min_amount": 500,
        "tag": "work",
        "nested": {"sort_by": "amount", "flags": [1, 2, 3]},
    }

    created = client.post("/api/saved-views", json={"name": "Big food spends", "filters": filters})

    assert created.status_code == 200, created.json()
    assert created.json()["filters"] == filters  # echoed verbatim, numbers intact

    listed = client.get("/api/saved-views")
    assert listed.status_code == 200
    views = listed.json()
    assert len(views) == 1
    assert views[0]["name"] == "Big food spends"
    assert views[0]["filters"] == filters


def test_post_same_name_upserts(views_client) -> None:
    client, _, _, _, _ = views_client
    first = client.post(
        "/api/saved-views", json={"name": "Monthly", "filters": {"category": "Food"}}
    ).json()

    second = client.post(
        "/api/saved-views", json={"name": "Monthly", "filters": {"category": "Rent"}}
    ).json()

    assert second["id"] == first["id"]  # same row, not a new one
    assert second["filters"] == {"category": "Rent"}  # overwritten
    assert second["created_at"] == first["created_at"]
    assert second["updated_at"] >= first["updated_at"]
    assert len(client.get("/api/saved-views").json()) == 1


def test_delete_204_and_idempotent(views_client) -> None:
    client, _, _, _, _ = views_client
    view = client.post("/api/saved-views", json={"name": "Temp", "filters": {}}).json()

    deleted = client.delete(f"/api/saved-views/{view['id']}")

    assert deleted.status_code == 204
    assert deleted.content == b""
    assert client.get("/api/saved-views").json() == []
    # Deleting again (and any nonexistent id) is still 204.
    assert client.delete(f"/api/saved-views/{view['id']}").status_code == 204
    assert client.delete("/api/saved-views/99999").status_code == 204


def test_views_are_user_scoped(views_client) -> None:
    client, _, _, user_b, current = views_client
    a_view = client.post("/api/saved-views", json={"name": "A's view", "filters": {}}).json()

    current["user"] = user_b
    as_b_list = client.get("/api/saved-views")
    as_b_delete = client.delete(f"/api/saved-views/{a_view['id']}")

    assert as_b_list.json() == []
    assert as_b_delete.status_code == 204  # no-op, never a 404/403

    # A's view is intact after B's delete attempt.
    current["user"] = views_client[2]
    assert [v["id"] for v in client.get("/api/saved-views").json()] == [a_view["id"]]


def test_response_contract(views_client) -> None:
    client, _, _, _, _ = views_client

    created = client.post("/api/saved-views", json={"name": "Contract", "filters": {"x": 1}})

    assert set(created.json().keys()) == VIEW_KEYS
    listed = client.get("/api/saved-views").json()
    assert set(listed[0].keys()) == VIEW_KEYS
