"""Time-range filters anchor on ``now()``, not on the latest transaction.

Covers ``ledger_sync.api.analytics_helpers._get_time_range_dates`` (DB query).

The behaviour change matters for users with stale data: clicking
"This Month" should yield the current calendar month even if their data
is months old, instead of returning the latest data month under a
misleading label.
"""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from unittest.mock import patch

from sqlalchemy.orm import Session

from ledger_sync.api.analytics_helpers import _get_time_range_dates
from ledger_sync.core.time_filter import TimeRange
from ledger_sync.db.models import Transaction, TransactionType, User


def _make_tx(user_id: int, date: datetime, amount: float, tid: str) -> Transaction:
    return Transaction(
        user_id=user_id,
        transaction_id=tid,
        date=date,
        amount=Decimal(str(amount)),
        currency="INR",
        type=TransactionType.EXPENSE,
        account="HDFC",
        category="Test",
        subcategory=None,
        note=None,
        source_file="test.xlsx",
        last_seen_at=datetime.now(UTC),
        is_deleted=False,
    )


# ─── api/analytics_helpers.py ───────────────────────────────────────────


def test_db_this_month_anchors_on_now(test_db_session: Session, test_user: User) -> None:
    """Even when latest tx was months ago, THIS_MONTH range starts at the
    first of the current calendar month."""
    test_db_session.add(_make_tx(test_user.id, datetime(2025, 11, 5, tzinfo=UTC), 100, "old"))
    test_db_session.commit()

    # Anchored via ledger_clock, so the bound is naive IST wall-clock time and
    # is directly comparable to the naive ``date`` column.
    with patch("ledger_sync.api.analytics_helpers.ledger_now") as mock_now:
        mock_now.return_value = datetime(2026, 5, 17, 10, 30, 0)
        start, end = _get_time_range_dates(test_db_session, test_user, TimeRange.THIS_MONTH)

    assert start == datetime(2026, 5, 1)
    assert end is None  # open-ended (covers from start through "now")


def test_db_last_3_months_calendar_aligned(test_db_session: Session, test_user: User) -> None:
    test_db_session.add(_make_tx(test_user.id, datetime(2025, 11, 5, tzinfo=UTC), 100, "old"))
    test_db_session.commit()

    with patch("ledger_sync.api.analytics_helpers.ledger_now") as mock_now:
        mock_now.return_value = datetime(2026, 5, 17)
        start, end = _get_time_range_dates(test_db_session, test_user, TimeRange.LAST_3_MONTHS)

    # 3 calendar months ending in May = Mar 1, Apr 1, May 1 -> start = Mar 1.
    assert start == datetime(2026, 3, 1)
    assert end is None


def test_db_last_year_uses_now_year(test_db_session: Session, test_user: User) -> None:
    """LAST_YEAR is (now.year - 1), regardless of latest transaction year."""
    test_db_session.add(_make_tx(test_user.id, datetime(2023, 6, 1, tzinfo=UTC), 100, "old"))
    test_db_session.commit()

    with patch("ledger_sync.api.analytics_helpers.ledger_now") as mock_now:
        mock_now.return_value = datetime(2026, 5, 17)
        start, end = _get_time_range_dates(test_db_session, test_user, TimeRange.LAST_YEAR)

    assert start == datetime(2025, 1, 1)
    assert end == datetime(2025, 12, 31, 23, 59, 59)


def test_db_this_month_uses_the_ist_month_not_the_utc_month(
    test_db_session: Session, test_user: User
) -> None:
    """The regression: at 02:00 IST on 1 April, UTC still says 31 March.

    With the old ``datetime.now(UTC)`` anchor, THIS_MONTH opened on 1 March, so
    a user checking the first morning of the new financial year saw five extra
    weeks of spending folded into "this month".
    """
    test_db_session.add(_make_tx(test_user.id, datetime(2026, 3, 15, tzinfo=UTC), 100, "march"))
    test_db_session.commit()

    # ledger_now() returns IST wall-clock, which is 2026-04-01 02:00 at the
    # instant UTC reads 2026-03-31 20:30.
    with patch("ledger_sync.api.analytics_helpers.ledger_now") as mock_now:
        mock_now.return_value = datetime(2026, 4, 1, 2, 0)
        start, _ = _get_time_range_dates(test_db_session, test_user, TimeRange.THIS_MONTH)

    assert start == datetime(2026, 4, 1)


def test_db_bounds_are_naive_so_they_match_the_date_column(
    test_db_session: Session, test_user: User
) -> None:
    """An aware bound cannot be compared to ``Transaction.date`` in Python.

    The column is naive, so ``t.date >= aware_bound`` raises TypeError. The SQL
    path hides it (the driver drops the offset), which is why this needs its own
    assertion rather than relying on a query-level test.
    """
    test_db_session.add(_make_tx(test_user.id, datetime(2026, 5, 5, tzinfo=UTC), 100, "may"))
    test_db_session.commit()

    with patch("ledger_sync.api.analytics_helpers.ledger_now") as mock_now:
        mock_now.return_value = datetime(2026, 5, 17)
        start, end = _get_time_range_dates(test_db_session, test_user, TimeRange.LAST_YEAR)

    assert start is not None
    assert end is not None
    assert start.tzinfo is None
    assert end.tzinfo is None


def test_db_no_transactions_returns_none(test_db_session: Session, test_user: User) -> None:
    """User with no data still gets (None, None) so callers handle empty
    state gracefully."""
    start, end = _get_time_range_dates(test_db_session, test_user, TimeRange.THIS_MONTH)
    assert start is None
    assert end is None


def test_db_all_time_returns_none(test_db_session: Session, test_user: User) -> None:
    test_db_session.add(_make_tx(test_user.id, datetime(2025, 1, 1, tzinfo=UTC), 100, "any"))
    test_db_session.commit()
    start, end = _get_time_range_dates(test_db_session, test_user, TimeRange.ALL_TIME)
    assert start is None
    assert end is None
