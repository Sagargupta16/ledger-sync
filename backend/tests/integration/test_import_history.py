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

from ledger_sync.db.models import ImportLog

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
