"""Profile update endpoint: request contract.

`PUT /api/auth/me` had no coverage, and the frontend was calling it with a null
body plus `?full_name=`, against a handler declaring `updates: UserUpdate`.
Saving a display name in the profile modal returned 422 every time. These tests
pin the JSON-body contract, and pin the sibling `/account/reset` as the genuine
query-param endpoint so a future sweep does not "fix" it to match.
"""

from __future__ import annotations


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
    client, _session, _user_a, _user_b, _current = two_user_client

    response = client.put("/api/auth/me", json={})

    assert response.status_code == 200


def test_account_reset_really_is_query_param_shaped(two_user_client):
    """The sibling endpoint that legitimately takes a query param.

    Documented as a test because the two calls sat side by side in the same
    frontend module using the same null-body idiom, and only one of them was
    wrong -- the difference is only visible in the handler signatures.
    """
    client, _session, _user_a, _user_b, _current = two_user_client

    response = client.post("/api/auth/account/reset", params={"mode": "transactions"})

    assert response.status_code == 200
