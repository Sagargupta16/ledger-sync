"""Tests for time-based transaction filtering."""

from datetime import UTC, datetime, timedelta
from decimal import Decimal

from ledger_sync.core.time_filter import TimeFilter, TimeRange, _subtract_months
from ledger_sync.db.models import Transaction, TransactionType


def tx(date: datetime) -> Transaction:
    """Build an in-memory transaction with the given date (never persisted)."""
    return Transaction(
        transaction_id="x" * 64,
        amount=Decimal("100"),
        type=TransactionType.EXPENSE,
        date=date,
        category="Food",
        account="Cash",
        currency="INR",
        subcategory="",
        note="",
        source_file="test.xlsx",
    )


# ---------------------------------------------------------------------------
# _subtract_months -- pure, deterministic clamping
# ---------------------------------------------------------------------------


def test_subtract_months_simple():
    result = _subtract_months(datetime(2024, 6, 15, tzinfo=UTC), 3)
    assert result == datetime(2024, 3, 15, tzinfo=UTC)


def test_subtract_months_zero_is_identity():
    src = datetime(2024, 6, 15, 8, 30, tzinfo=UTC)
    assert _subtract_months(src, 0) == src


def test_subtract_months_year_wrap_jan_to_dec():
    # Jan 31 minus 1 month -> Dec 31 of previous year (no day clamp needed).
    result = _subtract_months(datetime(2024, 1, 31, tzinfo=UTC), 1)
    assert result == datetime(2023, 12, 31, tzinfo=UTC)


def test_subtract_months_day_clamp_leap_year():
    # Mar 31 minus 1 month in 2024 (leap) -> Feb 29.
    result = _subtract_months(datetime(2024, 3, 31, tzinfo=UTC), 1)
    assert result == datetime(2024, 2, 29, tzinfo=UTC)


def test_subtract_months_day_clamp_non_leap_year():
    # Mar 31 minus 1 month in 2023 (non-leap) -> Feb 28.
    result = _subtract_months(datetime(2023, 3, 31, tzinfo=UTC), 1)
    assert result == datetime(2023, 2, 28, tzinfo=UTC)


def test_subtract_months_full_year():
    result = _subtract_months(datetime(2024, 6, 15, tzinfo=UTC), 12)
    assert result == datetime(2023, 6, 15, tzinfo=UTC)


def test_subtract_months_preserves_time_components():
    src = datetime(2024, 5, 10, 14, 25, 45, 123456, tzinfo=UTC)
    result = _subtract_months(src, 2)
    assert result == datetime(2024, 3, 10, 14, 25, 45, 123456, tzinfo=UTC)


def test_subtract_months_many_months_wrap():
    # 119 months back (the LAST_DECADE offset) from Jan 1 2026.
    result = _subtract_months(datetime(2026, 1, 1, tzinfo=UTC), 119)
    assert result == datetime(2016, 2, 1, tzinfo=UTC)


# ---------------------------------------------------------------------------
# filter_by_range -- only ALL_TIME and empty-list cases are deterministic
# ---------------------------------------------------------------------------


def test_filter_by_range_all_time_returns_everything():
    txns = [tx(datetime(2020, 1, 1, tzinfo=UTC)), tx(datetime(2024, 6, 15, tzinfo=UTC))]
    assert TimeFilter.filter_by_range(txns, TimeRange.ALL_TIME) == txns


def test_filter_by_range_all_time_empty_list():
    assert TimeFilter.filter_by_range([], TimeRange.ALL_TIME) == []


def test_filter_by_range_empty_list_non_all_time_returns_empty():
    for tr in (
        TimeRange.THIS_MONTH,
        TimeRange.LAST_MONTH,
        TimeRange.LAST_3_MONTHS,
        TimeRange.LAST_6_MONTHS,
        TimeRange.LAST_12_MONTHS,
        TimeRange.THIS_YEAR,
        TimeRange.LAST_YEAR,
        TimeRange.LAST_DECADE,
    ):
        assert TimeFilter.filter_by_range([], tr) == []


def test_filter_by_range_this_month_includes_now():
    # Anchored on now() -- a transaction dated now is in "this month".
    now = datetime.now(UTC)
    txns = [tx(now)]
    assert TimeFilter.filter_by_range(txns, TimeRange.THIS_MONTH) == txns


def test_filter_by_range_this_month_excludes_old():
    # A clearly-old transaction is not in the current month.
    old = datetime.now(UTC) - timedelta(days=400)
    assert TimeFilter.filter_by_range([tx(old)], TimeRange.THIS_MONTH) == []


def test_filter_by_range_last_3_months_includes_now_excludes_far_past():
    now = datetime.now(UTC)
    far_past = now - timedelta(days=400)
    recent = tx(now)
    txns = [recent, tx(far_past)]
    result = TimeFilter.filter_by_range(txns, TimeRange.LAST_3_MONTHS)
    assert result == [recent]


# ---------------------------------------------------------------------------
# filter_by_custom_range -- fully deterministic, inclusive boundaries
# ---------------------------------------------------------------------------


def test_filter_by_custom_range_inclusive_boundaries():
    start = datetime(2024, 1, 1, tzinfo=UTC)
    end = datetime(2024, 1, 31, tzinfo=UTC)
    on_start = tx(start)
    on_end = tx(end)
    inside = tx(datetime(2024, 1, 15, tzinfo=UTC))
    before = tx(datetime(2023, 12, 31, tzinfo=UTC))
    after = tx(datetime(2024, 2, 1, tzinfo=UTC))
    txns = [before, on_start, inside, on_end, after]
    result = TimeFilter.filter_by_custom_range(txns, start, end)
    assert result == [on_start, inside, on_end]


def test_filter_by_custom_range_start_after_end_returns_empty():
    start = datetime(2024, 6, 1, tzinfo=UTC)
    end = datetime(2024, 1, 1, tzinfo=UTC)
    txns = [tx(datetime(2024, 3, 1, tzinfo=UTC))]
    assert TimeFilter.filter_by_custom_range(txns, start, end) == []


def test_filter_by_custom_range_empty_input():
    start = datetime(2024, 1, 1, tzinfo=UTC)
    end = datetime(2024, 12, 31, tzinfo=UTC)
    assert TimeFilter.filter_by_custom_range([], start, end) == []


def test_filter_by_custom_range_single_day_window():
    day = datetime(2024, 5, 5, tzinfo=UTC)
    on_day = tx(day)
    txns = [tx(datetime(2024, 5, 4, tzinfo=UTC)), on_day, tx(datetime(2024, 5, 6, tzinfo=UTC))]
    assert TimeFilter.filter_by_custom_range(txns, day, day) == [on_day]


# ---------------------------------------------------------------------------
# filter_by_month_year
# ---------------------------------------------------------------------------


def test_filter_by_month_year_matches_month_and_year():
    match = tx(datetime(2024, 6, 15, tzinfo=UTC))
    txns = [
        match,
        tx(datetime(2024, 7, 15, tzinfo=UTC)),  # wrong month
        tx(datetime(2023, 6, 15, tzinfo=UTC)),  # right month, wrong year
    ]
    assert TimeFilter.filter_by_month_year(txns, 6, 2024) == [match]


def test_filter_by_month_year_same_month_different_year_excluded():
    txns = [tx(datetime(2023, 6, 1, tzinfo=UTC))]
    assert TimeFilter.filter_by_month_year(txns, 6, 2024) == []


def test_filter_by_month_year_empty_input():
    assert TimeFilter.filter_by_month_year([], 6, 2024) == []


def test_filter_by_month_year_boundary_first_and_last_day():
    first = tx(datetime(2024, 6, 1, 0, 0, 0, tzinfo=UTC))
    last = tx(datetime(2024, 6, 30, 23, 59, 59, tzinfo=UTC))
    txns = [
        first,
        last,
        tx(datetime(2024, 5, 31, tzinfo=UTC)),
        tx(datetime(2024, 7, 1, tzinfo=UTC)),
    ]
    assert TimeFilter.filter_by_month_year(txns, 6, 2024) == [first, last]


# ---------------------------------------------------------------------------
# filter_by_year
# ---------------------------------------------------------------------------


def test_filter_by_year_matches_year():
    keep = tx(datetime(2024, 3, 1, tzinfo=UTC))
    txns = [keep, tx(datetime(2023, 12, 31, tzinfo=UTC)), tx(datetime(2025, 1, 1, tzinfo=UTC))]
    assert TimeFilter.filter_by_year(txns, 2024) == [keep]


def test_filter_by_year_boundary_dec31_and_jan1():
    jan1 = tx(datetime(2024, 1, 1, 0, 0, 0, tzinfo=UTC))
    dec31 = tx(datetime(2024, 12, 31, 23, 59, 59, tzinfo=UTC))
    prev = tx(datetime(2023, 12, 31, 23, 59, 59, tzinfo=UTC))
    nxt = tx(datetime(2025, 1, 1, 0, 0, 0, tzinfo=UTC))
    txns = [prev, jan1, dec31, nxt]
    assert TimeFilter.filter_by_year(txns, 2024) == [jan1, dec31]


def test_filter_by_year_empty_input():
    assert TimeFilter.filter_by_year([], 2024) == []


# ---------------------------------------------------------------------------
# get_available_years
# ---------------------------------------------------------------------------


def test_get_available_years_empty():
    assert TimeFilter.get_available_years([]) == []


def test_get_available_years_dedup_and_sorted():
    txns = [
        tx(datetime(2024, 6, 1, tzinfo=UTC)),
        tx(datetime(2022, 1, 1, tzinfo=UTC)),
        tx(datetime(2024, 12, 1, tzinfo=UTC)),  # duplicate year
        tx(datetime(2023, 3, 1, tzinfo=UTC)),
    ]
    assert TimeFilter.get_available_years(txns) == [2022, 2023, 2024]


def test_get_available_years_single():
    assert TimeFilter.get_available_years([tx(datetime(2024, 6, 1, tzinfo=UTC))]) == [2024]


# ---------------------------------------------------------------------------
# get_available_months
# ---------------------------------------------------------------------------


def test_get_available_months_empty():
    assert TimeFilter.get_available_months([], 2024) == []


def test_get_available_months_dedup_sorted_and_year_scoped():
    txns = [
        tx(datetime(2024, 6, 15, tzinfo=UTC)),
        tx(datetime(2024, 1, 5, tzinfo=UTC)),
        tx(datetime(2024, 6, 20, tzinfo=UTC)),  # duplicate month
        tx(datetime(2024, 3, 1, tzinfo=UTC)),
        tx(datetime(2023, 9, 1, tzinfo=UTC)),  # different year, excluded
    ]
    assert TimeFilter.get_available_months(txns, 2024) == [1, 3, 6]


def test_get_available_months_no_match_for_year():
    txns = [tx(datetime(2023, 5, 1, tzinfo=UTC))]
    assert TimeFilter.get_available_months(txns, 2024) == []
