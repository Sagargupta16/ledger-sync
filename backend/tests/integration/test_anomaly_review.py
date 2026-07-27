"""Anomaly review endpoint: request contract and user scoping.

The endpoint had zero coverage, and the frontend was calling it with the wrong
request shape -- `POST` with a null body and the fields as query params, against
a handler declaring `body: ReviewAnomalyRequest`. Every Review/Dismiss click on
`/anomalies` came back 422 `{"loc": ["body"], "msg": "Field required"}`, so the
feature had never worked. These tests pin the JSON-body contract so the two
sides cannot drift apart again silently.
"""

from __future__ import annotations

from decimal import Decimal

from ledger_sync.db.models import Anomaly, AnomalyType


def _anomaly(user_id: int, *, description: str = "unusual spend") -> Anomaly:
    return Anomaly(
        user_id=user_id,
        anomaly_type=AnomalyType.HIGH_EXPENSE,
        severity="high",
        description=description,
        actual_value=Decimal("100"),
        is_reviewed=False,
        is_dismissed=False,
    )


def test_review_accepts_a_json_body(two_user_client):
    """The shape the frontend sends, which is the shape the handler declares."""
    client, session, user_a, _user_b, _current = two_user_client
    anomaly = _anomaly(user_a.id)
    session.add(anomaly)
    session.commit()

    response = client.post(
        f"/api/analytics/v2/anomalies/{anomaly.id}/review",
        json={"dismiss": True, "notes": "expected, annual insurance premium"},
    )

    assert response.status_code == 200
    assert response.json() == {"success": True, "anomaly_id": anomaly.id}

    session.refresh(anomaly)
    assert anomaly.is_reviewed is True
    assert anomaly.is_dismissed is True
    assert anomaly.review_notes == "expected, annual insurance premium"
    assert anomaly.reviewed_at is not None


def test_review_defaults_to_keeping_the_anomaly(two_user_client):
    """`dismiss` defaults False: reviewing is not the same as dismissing."""
    client, session, user_a, _user_b, _current = two_user_client
    anomaly = _anomaly(user_a.id)
    session.add(anomaly)
    session.commit()

    response = client.post(f"/api/analytics/v2/anomalies/{anomaly.id}/review", json={})

    assert response.status_code == 200
    session.refresh(anomaly)
    assert anomaly.is_reviewed is True
    assert anomaly.is_dismissed is False
    assert anomaly.review_notes is None


def test_query_params_are_rejected(two_user_client):
    """Pins the bug's signature.

    Documented as a test rather than a comment so a future refactor that moves
    the fields back onto the query string fails here instead of silently
    breaking the buttons again.
    """
    client, session, user_a, _user_b, _current = two_user_client
    anomaly = _anomaly(user_a.id)
    session.add(anomaly)
    session.commit()

    response = client.post(
        f"/api/analytics/v2/anomalies/{anomaly.id}/review",
        params={"dismiss": "true", "notes": "n"},
    )

    assert response.status_code == 422
    session.refresh(anomaly)
    assert anomaly.is_reviewed is False


def test_review_is_user_scoped(two_user_client):
    """User A cannot review user B's anomaly, and gets a 404 rather than a 403."""
    client, session, _user_a, user_b, _current = two_user_client
    other = _anomaly(user_b.id, description="user b's anomaly")
    session.add(other)
    session.commit()

    response = client.post(
        f"/api/analytics/v2/anomalies/{other.id}/review",
        json={"dismiss": True},
    )

    assert response.status_code == 404
    session.refresh(other)
    assert other.is_reviewed is False


def test_review_of_a_missing_anomaly_is_404(two_user_client):
    client, _session, _user_a, _user_b, _current = two_user_client

    response = client.post("/api/analytics/v2/anomalies/999999/review", json={"dismiss": False})

    assert response.status_code == 404
