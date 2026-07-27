"""GET /api/analytics/v2/anomalies: a real zero is not a missing value.

``expected_value``/``actual_value`` were serialized with a truthiness test
(``float(a.expected_value) if a.expected_value else None``), so an anomaly
whose expected or actual value is exactly 0 came back as ``null``. The anomaly
review UI reads null as "no comparison data" and hides the comparison bar, so
the most extreme flags -- "expected no spend here, got 4,500" -- lost their
visual entirely. Both columns are genuinely nullable in ``db/_models``
(``Mapped[Decimal | None]``), so null must keep meaning absent.
"""

from __future__ import annotations

from decimal import Decimal

from ledger_sync.db.models import Anomaly, AnomalyType


def _anomaly(
    user_id: int,
    *,
    expected: Decimal | None,
    actual: Decimal | None,
    deviation_pct: float | None = None,
    description: str = "unusual spend",
) -> Anomaly:
    return Anomaly(
        user_id=user_id,
        anomaly_type=AnomalyType.UNUSUAL_CATEGORY,
        severity="high",
        description=description,
        expected_value=expected,
        actual_value=actual,
        deviation_pct=deviation_pct,
        is_reviewed=False,
        is_dismissed=False,
    )


def _fetch_one(client) -> dict:
    response = client.get("/api/analytics/v2/anomalies")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["count"] == 1, body
    return body["data"][0]


def test_zero_expected_value_is_zero_not_null(two_user_client) -> None:
    """ "We expected no spend in this category" must survive serialization."""
    client, session, user_a, _user_b, _current = two_user_client
    session.add(_anomaly(user_a.id, expected=Decimal("0.00"), actual=Decimal("4500.00")))
    session.commit()

    row = _fetch_one(client)

    assert row["expected_value"] == 0.0
    assert row["expected_value"] is not None
    assert row["actual_value"] == 4500.0


def test_zero_actual_value_is_zero_not_null(two_user_client) -> None:
    """A dropped-to-nothing actual (missed recurring payment) is also real."""
    client, session, user_a, _user_b, _current = two_user_client
    session.add(_anomaly(user_a.id, expected=Decimal("1200.00"), actual=Decimal("0.00")))
    session.commit()

    row = _fetch_one(client)

    assert row["actual_value"] == 0.0
    assert row["actual_value"] is not None
    assert row["expected_value"] == 1200.0


def test_zero_deviation_pct_is_zero_not_null(two_user_client) -> None:
    """Sibling numeric field: exactly-on-baseline is 0%, not unknown."""
    client, session, user_a, _user_b, _current = two_user_client
    session.add(
        _anomaly(
            user_a.id,
            expected=Decimal("500.00"),
            actual=Decimal("500.00"),
            deviation_pct=0.0,
        )
    )
    session.commit()

    row = _fetch_one(client)

    assert row["deviation_pct"] == 0.0
    assert row["deviation_pct"] is not None


def test_genuinely_absent_values_stay_null(two_user_client) -> None:
    """Both columns are nullable, so None must not become 0.0."""
    client, session, user_a, _user_b, _current = two_user_client
    session.add(_anomaly(user_a.id, expected=None, actual=Decimal("900.00")))
    session.commit()

    row = _fetch_one(client)

    assert row["expected_value"] is None
    assert row["actual_value"] == 900.0
    assert row["deviation_pct"] is None
