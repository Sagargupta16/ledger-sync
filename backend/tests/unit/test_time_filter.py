"""Tests for the calendar-month arithmetic behind the analytics time ranges."""

from datetime import UTC, datetime

from ledger_sync.api.analytics_helpers import _subtract_months

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
