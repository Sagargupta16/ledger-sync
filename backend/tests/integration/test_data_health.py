"""GET /api/analytics/v2/data-health -- import freshness + ledger quality.

The workspace had no way to answer "is my data stale, and how much of it is
unusable?" -- a ledger where the last import was weeks ago, or where hundreds
of rows sit in the ``Miscellaneous`` catch-all with a placeholder note, reads
as authoritative on every page. These tests lock in the three groups the
endpoint reports (freshness, coverage, quality), the empty-ledger shape, and
user scoping.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from unittest.mock import patch

from ledger_sync.db.models import ImportLog, MonthlySummary, Transaction, TransactionType

HEALTH_URL = "/api/analytics/v2/data-health"


def _txn(
    user_id: int,
    tx_id: str,
    date: datetime,
    *,
    category: str = "Food",
    note: str | None = "swiggy",
    deleted: bool = False,
) -> Transaction:
    return Transaction(
        transaction_id=tx_id,
        user_id=user_id,
        date=date,
        amount=Decimal("250"),
        currency="INR",
        type=TransactionType.EXPENSE,
        account="HDFC Bank",
        category=category,
        subcategory=None,
        note=note,
        source_file="test.xlsx",
        last_seen_at=datetime.now(UTC),
        is_deleted=deleted,
    )


def _import_log(user_id: int, days_ago: int, file_name: str) -> ImportLog:
    return ImportLog(
        user_id=user_id,
        file_hash=f"{user_id:064d}",
        file_name=file_name,
        imported_at=datetime.now(UTC) - timedelta(days=days_ago),
        rows_processed=8024,
        rows_inserted=62,
        rows_updated=0,
        rows_deleted=0,
        rows_skipped=7962,
    )


def _rollup(user_id: int, period_key: str, calculated_at: datetime) -> MonthlySummary:
    return MonthlySummary(
        user_id=user_id,
        year=int(period_key[:4]),
        month=int(period_key[5:]),
        period_key=period_key,
        total_expenses=Decimal("1000"),
        last_calculated=calculated_at,
    )


def test_empty_ledger_reports_nulls_not_an_error(two_user_client) -> None:
    client, _, _, _, _ = two_user_client

    body = client.get(HEALTH_URL).json()

    assert body["last_import_at"] is None
    assert body["days_stale"] is None
    assert body["last_import_file_name"] is None
    assert body["rows_processed"] is None
    assert body["transaction_count"] == 0
    assert body["earliest_date"] is None
    assert body["latest_date"] is None
    assert body["future_dated_count"] == 0
    assert body["placeholder_note_count"] == 0
    assert body["uncategorized_count"] == 0
    assert body["rollups_calculated_at"] is None
    # Nothing imported, so the rollups are not behind anything.
    assert body["rollups_stale"] is False


def test_rollups_older_than_the_last_import_report_stale(two_user_client) -> None:
    """The silent-divergence signal, from the real incident on this ledger.

    Every analytics page reads rollups rather than raw transactions, so an
    import whose refresh did not land leaves the workspace serving the PREVIOUS
    import's numbers. On the owner's ledger that ran for 22 days: the
    2026-07-26 import committed 508 inserts and 373 deletes while every rollup
    stayed stamped 2026-07-04, and July expenses displayed 74,523.22 against a
    true 107,651.65 -- understated by 44% with nothing on screen to say so.
    """
    client, session, user_a, _, _ = two_user_client
    session.add(_import_log(user_a.id, days_ago=1, file_name="CASHBOOK.xlsx"))
    session.add(
        _rollup(user_a.id, "2026-07", datetime.now(UTC).replace(tzinfo=None) - timedelta(days=22))
    )
    session.commit()

    body = client.get(HEALTH_URL).json()

    assert body["rollups_stale"] is True
    assert body["rollups_calculated_at"] is not None


def test_rollups_newer_than_the_last_import_are_not_stale(two_user_client) -> None:
    """The healthy case: the refresh ran after the import committed."""
    client, session, user_a, _, _ = two_user_client
    session.add(_import_log(user_a.id, days_ago=3, file_name="CASHBOOK.xlsx"))
    session.add(_rollup(user_a.id, "2026-07", datetime.now(UTC).replace(tzinfo=None)))
    session.commit()

    assert client.get(HEALTH_URL).json()["rollups_stale"] is False


def test_an_import_with_no_rollups_at_all_reports_stale(two_user_client) -> None:
    """First-run failure: the workspace reads empty rather than wrong.

    Absent rollups are still "behind the import" -- an empty analytics page is
    a different symptom from a stale one, but it has the same cause and the
    same fix, so it must not read as healthy.
    """
    client, session, user_a, _, _ = two_user_client
    session.add(_import_log(user_a.id, days_ago=1, file_name="CASHBOOK.xlsx"))
    session.commit()

    body = client.get(HEALTH_URL).json()

    assert body["rollups_calculated_at"] is None
    assert body["rollups_stale"] is True


def test_rollup_freshness_is_user_scoped(two_user_client) -> None:
    """User B's fresh rollups never mask user A's stale ones, or vice versa."""
    client, session, user_a, user_b, current = two_user_client
    session.add_all(
        [
            _import_log(user_a.id, days_ago=1, file_name="a.xlsx"),
            _rollup(user_a.id, "2026-07", datetime.now(UTC).replace(tzinfo=None)),
        ]
    )
    session.commit()

    # User B imported but has no rollups of their own; A's must not count.
    current["user"] = user_b
    session.add(_import_log(user_b.id, days_ago=1, file_name="b.xlsx"))
    session.commit()

    assert client.get(HEALTH_URL).json()["rollups_stale"] is True


def test_reports_the_most_recent_import_and_its_staleness(two_user_client) -> None:
    """Newest import wins, and staleness is measured in whole days."""
    client, session, user_a, _, _ = two_user_client
    session.add_all(
        [
            _import_log(user_a.id, days_ago=40, file_name="old.xlsx"),
            _import_log(user_a.id, days_ago=22, file_name="CASHBOOK.xlsx"),
        ]
    )
    session.commit()

    body = client.get(HEALTH_URL).json()

    assert body["last_import_file_name"] == "CASHBOOK.xlsx"
    assert body["days_stale"] == 22
    assert body["last_import_at"] is not None
    assert body["rows_processed"] == 8024
    assert body["rows_inserted"] == 62
    assert body["rows_skipped"] == 7962


def test_coverage_span_ignores_soft_deleted_rows(two_user_client) -> None:
    client, session, user_a, _, _ = two_user_client
    session.add_all(
        [
            _txn(user_a.id, "a-1", datetime(2019, 1, 1, tzinfo=UTC)),
            _txn(user_a.id, "a-2", datetime(2024, 6, 15, tzinfo=UTC)),
            _txn(user_a.id, "a-3", datetime(2025, 3, 9, tzinfo=UTC), deleted=True),
        ]
    )
    session.commit()

    body = client.get(HEALTH_URL).json()

    assert body["transaction_count"] == 2
    assert body["earliest_date"] == "2019-01-01"
    assert body["latest_date"] == "2024-06-15"


def test_counts_future_dated_placeholder_and_uncategorized_rows(two_user_client) -> None:
    """The three quality signals, each counted independently.

    ``future_dated_count`` catches the real "AWS - EPF Contribution" case: a
    row dated at month end that inflates the current month's totals.
    ``Miscellaneous`` counts as uncategorised because the catch-all carries no
    analytical meaning, same as a blank category.
    """
    client, session, user_a, _, _ = two_user_client
    tomorrow = datetime.now(UTC) + timedelta(days=2)
    session.add_all(
        [
            _txn(user_a.id, "a-future", tomorrow),
            _txn(user_a.id, "a-unknown", datetime(2024, 2, 2, tzinfo=UTC), note="Unknown"),
            _txn(
                user_a.id,
                "a-misc",
                datetime(2024, 2, 3, tzinfo=UTC),
                category="Miscellaneous",
            ),
            _txn(user_a.id, "a-blank", datetime(2024, 2, 4, tzinfo=UTC), category=" "),
            _txn(user_a.id, "a-clean", datetime(2024, 2, 5, tzinfo=UTC)),
        ]
    )
    session.commit()

    body = client.get(HEALTH_URL).json()

    assert body["transaction_count"] == 5
    assert body["future_dated_count"] == 1
    assert body["placeholder_note_count"] == 1
    assert body["uncategorized_count"] == 2


def test_a_note_merely_mentioning_unknown_is_not_a_placeholder(two_user_client) -> None:
    """Whole-note match, not LIKE -- "Unknown payee refund" is a real note."""
    client, session, user_a, _, _ = two_user_client
    session.add_all(
        [
            _txn(user_a.id, "a-1", datetime(2024, 2, 2, tzinfo=UTC), note="Unknown payee refund"),
            _txn(user_a.id, "a-2", datetime(2024, 2, 3, tzinfo=UTC), note="Unknown"),
        ]
    )
    session.commit()

    assert client.get(HEALTH_URL).json()["placeholder_note_count"] == 1


def test_every_canonical_placeholder_note_counts_in_any_case(two_user_client) -> None:
    """The whole ``PLACEHOLDER_NOTES`` set, case- and whitespace-insensitive.

    A single case-sensitive "Unknown" literal reported "unknown", "N/A", "-",
    "?" and "misc" as clean data -- understating the exact problem this endpoint
    exists to surface. The set is the one merchant extraction already owns.
    """
    client, session, user_a, _, _ = two_user_client
    variants = ["unknown", "UNKNOWN", " Unknown ", "N/A", "na", "None", "-", "--", "?", "MISC"]
    session.add_all(
        [
            _txn(user_a.id, f"a-{i}", datetime(2024, 2, 2, tzinfo=UTC), note=note)
            for i, note in enumerate(variants)
        ]
    )
    session.commit()

    assert client.get(HEALTH_URL).json()["placeholder_note_count"] == len(variants)


def test_today_is_resolved_in_ist_not_utc(two_user_client) -> None:
    """The endpoint judges "future" against the IST day, end to end.

    The ledger holds Indian wall-clock dates. Reading the UTC date instead is
    wrong for 5.5 hours of every day: at 19:00 UTC on the 9th it is already the
    10th in India, so a row the user enters right then reads as future-dated.

    The clock is frozen at 01:30 IST on the 10th -- 20:00 UTC on the 9th, inside
    that window -- rather than asserting on ``now()``: on a machine where the
    two dates happen to agree, a wall-clock assertion passes under the bug.
    The date rule itself is pinned in ``tests/unit/test_ledger_clock.py``; this
    test exists to prove the endpoint reads it from there.
    """
    client, session, user_a, _, _ = two_user_client
    session.add_all(
        [
            _txn(user_a.id, "a-ist-today", datetime(2026, 7, 10, tzinfo=UTC)),
            _txn(user_a.id, "a-ist-tomorrow", datetime(2026, 7, 11, tzinfo=UTC)),
        ]
    )
    session.commit()

    with patch("ledger_sync.core.ledger_clock.ledger_now") as mock_now:
        mock_now.return_value = datetime(2026, 7, 10, 1, 30)  # noqa: DTZ001 -- naive IST by contract
        body = client.get(HEALTH_URL).json()

    # Only the 11th is ahead of the IST day. A UTC anchor would still be on the
    # 9th here and would flag the 10th too, reporting 2.
    assert body["future_dated_count"] == 1


def test_a_row_dated_today_is_not_future_dated(two_user_client) -> None:
    """End-to-end companion: today's rows never trip the warning."""
    client, session, user_a, _, _ = two_user_client
    today = datetime.now(UTC).date()
    session.add_all(
        [
            _txn(user_a.id, "a-midnight", datetime(today.year, today.month, today.day, tzinfo=UTC)),
            _txn(
                user_a.id,
                "a-late",
                datetime(today.year, today.month, today.day, 23, 59, tzinfo=UTC),
            ),
        ]
    )
    session.commit()

    assert client.get(HEALTH_URL).json()["future_dated_count"] == 0


def test_health_is_user_scoped(two_user_client) -> None:
    """User B never sees user A's imports, span, or quality counts."""
    client, session, user_a, user_b, current = two_user_client
    session.add(_import_log(user_a.id, days_ago=3, file_name="a-only.xlsx"))
    session.add_all(
        [
            _txn(user_a.id, "a-1", datetime(2019, 1, 1, tzinfo=UTC), note="Unknown"),
            _txn(user_a.id, "a-2", datetime(2020, 1, 1, tzinfo=UTC), category="Miscellaneous"),
            _txn(user_b.id, "b-1", datetime(2023, 5, 5, tzinfo=UTC)),
        ]
    )
    session.commit()

    current["user"] = user_b
    body = client.get(HEALTH_URL).json()

    assert body["last_import_at"] is None
    assert body["last_import_file_name"] is None
    assert body["transaction_count"] == 1
    assert body["earliest_date"] == "2023-05-05"
    assert body["latest_date"] == "2023-05-05"
    assert body["placeholder_note_count"] == 0
    assert body["uncategorized_count"] == 0
