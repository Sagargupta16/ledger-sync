"""GET /api/upload/history -- the import log, shown back to the user.

``import_logs`` was written on every upload from the first release (it is the
file-hash idempotency record) but nothing ever read the series back, so "did
that import land, and what did it change?" was only answerable from the
database. The Data Health page reads the single latest row; this endpoint
returns the list.

These tests lock in ordering, the limit bounds, user scoping, the empty shape,
and the UTC serialization -- the column is naive-but-UTC, so a missing offset
would shift every displayed timestamp by the viewer's zone.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest
from sqlalchemy import select

from ledger_sync.api.rate_limit import limiter
from ledger_sync.config.settings import settings
from ledger_sync.db.models import ImportLog, Transaction

HISTORY_URL = "/api/upload/history"


def _import_log(user_id: int, days_ago: int, file_name: str, *, inserted: int = 62) -> ImportLog:
    return ImportLog(
        user_id=user_id,
        file_hash=f"{days_ago:064d}",
        file_name=file_name,
        # Stored naive on both SQLite and Postgres, holding a UTC value.
        imported_at=(datetime.now(UTC) - timedelta(days=days_ago)).replace(tzinfo=None),
        rows_processed=8024,
        rows_inserted=inserted,
        rows_updated=0,
        rows_deleted=0,
        rows_skipped=8024 - inserted,
    )


def test_empty_history_returns_an_empty_list_not_an_error(two_user_client) -> None:
    client, _, _, _, _ = two_user_client

    response = client.get(HISTORY_URL)

    assert response.status_code == 200
    assert response.json() == {"imports": [], "total_count": 0}


def test_imports_are_returned_most_recent_first(two_user_client) -> None:
    client, session, user_a, _, _ = two_user_client
    session.add_all(
        [
            _import_log(user_a.id, 30, "oldest.xlsx"),
            _import_log(user_a.id, 1, "newest.xlsx"),
            _import_log(user_a.id, 10, "middle.xlsx"),
        ],
    )
    session.commit()

    body = client.get(HISTORY_URL).json()

    assert [row["file_name"] for row in body["imports"]] == [
        "newest.xlsx",
        "middle.xlsx",
        "oldest.xlsx",
    ]


def test_total_count_reports_every_import_even_when_the_page_is_smaller(
    two_user_client,
) -> None:
    client, session, user_a, _, _ = two_user_client
    session.add_all([_import_log(user_a.id, day, f"f{day}.xlsx") for day in range(1, 6)])
    session.commit()

    body = client.get(HISTORY_URL, params={"limit": 2}).json()

    assert len(body["imports"]) == 2
    assert body["total_count"] == 5


def test_history_is_user_scoped(two_user_client) -> None:
    client, session, user_a, user_b, current = two_user_client
    session.add(_import_log(user_a.id, 1, "user-a.xlsx"))
    session.add(_import_log(user_b.id, 1, "user-b.xlsx"))
    session.commit()

    as_a = client.get(HISTORY_URL).json()
    assert [row["file_name"] for row in as_a["imports"]] == ["user-a.xlsx"]
    assert as_a["total_count"] == 1

    current["user"] = user_b
    as_b = client.get(HISTORY_URL).json()
    assert [row["file_name"] for row in as_b["imports"]] == ["user-b.xlsx"]
    assert as_b["total_count"] == 1


def test_imported_at_carries_an_explicit_utc_offset(two_user_client) -> None:
    """Without the offset the browser reads the naive value as local time."""
    client, session, user_a, _, _ = two_user_client
    session.add(_import_log(user_a.id, 1, "f.xlsx"))
    session.commit()

    imported_at = client.get(HISTORY_URL).json()["imports"][0]["imported_at"]

    assert imported_at.endswith("+00:00")
    assert datetime.fromisoformat(imported_at).tzinfo is not None


def test_row_counts_are_reported_verbatim(two_user_client) -> None:
    client, session, user_a, _, _ = two_user_client
    session.add(_import_log(user_a.id, 1, "f.xlsx", inserted=31))
    session.commit()

    row = client.get(HISTORY_URL).json()["imports"][0]

    assert row["rows_processed"] == 8024
    assert row["rows_inserted"] == 31
    assert row["rows_skipped"] == 7993


def test_limit_is_bounded(two_user_client) -> None:
    """A limit of 0 or above 100 is rejected rather than silently clamped."""
    client, _, _, _, _ = two_user_client

    assert client.get(HISTORY_URL, params={"limit": 0}).status_code == 422
    assert client.get(HISTORY_URL, params={"limit": 101}).status_code == 422


def _upload_payload() -> dict:
    return {
        "file_name": "synthetic.csv",
        "file_hash": "a" * 64,
        "rows": [
            {
                "date": "2026-01-15",
                "amount": 100,
                "currency": "INR",
                "type": "Expense",
                "account": "Cash",
                "category": "Food",
            }
        ],
    }


@pytest.mark.parametrize("refresh_fails", [False, True])
def test_upload_reports_refresh_outcome_after_saving_ledger(
    two_user_client, monkeypatch, refresh_fails
) -> None:
    client, session, user_a, _, _ = two_user_client
    monkeypatch.setattr(limiter, "enabled", False)
    with patch("ledger_sync.api.upload.AnalyticsEngine") as analytics:
        if refresh_fails:
            analytics.return_value.run_full_analytics.side_effect = RuntimeError(
                "synthetic failure"
            )
        response = client.post("/api/upload", json=_upload_payload())

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["analytics_status"] == ("failed" if refresh_fails else "ready")
    assert body["stats"]["inserted"] == 1
    analytics.return_value.run_full_analytics.assert_called_once()
    assert session.scalar(select(Transaction).where(Transaction.user_id == user_a.id)) is not None
    history = client.get(HISTORY_URL).json()
    assert history["total_count"] == 1
    assert history["imports"][0]["file_name"] == "synthetic.csv"


def test_upload_rejects_invalid_snapshot_and_preserves_history(
    two_user_client, monkeypatch
) -> None:
    client, session, _, _, _ = two_user_client
    monkeypatch.setattr(limiter, "enabled", False)
    with patch("ledger_sync.api.upload.AnalyticsEngine"):
        assert client.post("/api/upload", json=_upload_payload()).status_code == 200
        invalid = _upload_payload()
        invalid["file_hash"] = "b" * 64
        invalid["rows"].append({**invalid["rows"][0], "date": "2026-02-30"})
        response = client.post("/api/upload", json=invalid)
        duplicate = client.post("/api/upload", json=_upload_payload())

    assert response.status_code == 422
    assert duplicate.status_code == 409
    assert len(session.scalars(select(Transaction)).all()) == 1
    assert client.get(HISTORY_URL).json()["total_count"] == 1


@pytest.mark.parametrize("chunked", [False, True])
def test_upload_body_limit_is_enforced_before_json_parsing(
    two_user_client, monkeypatch, chunked
) -> None:
    client, session, _, _, _ = two_user_client
    monkeypatch.setattr(settings, "max_upload_size_bytes", 128)
    content = iter([b"x" * 65, b"x" * 64]) if chunked else b"x" * 129
    response = client.post("/api/upload", content=content)

    assert response.status_code == 413
    assert "size limit" in response.json()["detail"]
    assert len(session.scalars(select(ImportLog)).all()) == 0
