"""Tests for the central IST ledger clock.

The bug this module exists to prevent is a boundary bug, so the tests are
boundary tests: the 5.5-hour window where the UTC date and the IST date differ,
and the 1 April instant where the financial year flips.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta, timezone

from ledger_sync.core.ledger_clock import (
    IST_OFFSET,
    financial_year_label,
    financial_year_start,
    ledger_now,
    ledger_today,
    ledger_today_iso,
    start_of_month,
    start_of_year,
    to_ledger_time,
)


def test_ist_offset_is_five_thirty() -> None:
    assert IST_OFFSET == timedelta(hours=5, minutes=30)


def test_ledger_now_is_naive() -> None:
    """Naive is the contract: it has to compare against a naive DB column."""
    assert ledger_now().tzinfo is None


def test_ledger_now_leads_utc_by_the_offset() -> None:
    delta = ledger_now() - datetime.now(UTC).replace(tzinfo=None)
    # Allow a second of slack for the two clock reads.
    assert abs(delta - IST_OFFSET) < timedelta(seconds=2)


def test_ledger_today_iso_matches_ledger_today() -> None:
    assert ledger_today_iso() == ledger_today().isoformat()


def test_to_ledger_time_converts_aware_input() -> None:
    # 20:00 UTC is 01:30 IST the NEXT day -- the window where a UTC date is
    # already stale for an Indian user.
    aware = datetime(2026, 7, 26, 20, 0, tzinfo=UTC)
    assert to_ledger_time(aware) == datetime(2026, 7, 27, 1, 30)


def test_to_ledger_time_passes_naive_input_through() -> None:
    naive = datetime(2026, 7, 26, 20, 0)
    assert to_ledger_time(naive) == naive


def test_to_ledger_time_handles_a_non_utc_aware_input() -> None:
    """A caller may hold an offset that is neither UTC nor IST."""
    jst = timezone(timedelta(hours=9))
    tokyo = datetime(2026, 7, 27, 5, 0, tzinfo=jst)
    # 05:00 JST is 20:00 UTC the previous day, so 01:30 IST on the 27th.
    assert to_ledger_time(tokyo) == datetime(2026, 7, 27, 1, 30)


def test_start_of_month_uses_the_ist_month_not_the_utc_month() -> None:
    """The regression: 02:00 IST on 1 April is still 31 March in UTC.

    A UTC anchor opens "this month" on 1 March, so the user's first look at the
    new month shows five extra weeks of spending.
    """
    utc_instant = datetime(2026, 3, 31, 20, 30, tzinfo=UTC)  # 02:00 IST, 1 Apr
    assert start_of_month(utc_instant) == datetime(2026, 4, 1)


def test_start_of_year_uses_the_ist_year() -> None:
    """31 Dec 20:30 UTC is already 1 Jan in India."""
    utc_instant = datetime(2025, 12, 31, 20, 30, tzinfo=UTC)
    assert start_of_year(utc_instant) == datetime(2026, 1, 1)


def test_financial_year_opens_on_1_april() -> None:
    assert financial_year_start(datetime(2026, 4, 1, tzinfo=UTC)) == datetime(2026, 4, 1)
    assert financial_year_start(datetime(2026, 7, 26, tzinfo=UTC)) == datetime(2026, 4, 1)


def test_january_to_march_belong_to_the_previous_april() -> None:
    assert financial_year_start(datetime(2026, 3, 31, tzinfo=UTC)) == datetime(2025, 4, 1)
    assert financial_year_start(datetime(2026, 1, 1, tzinfo=UTC)) == datetime(2025, 4, 1)


def test_financial_year_boundary_is_judged_in_ist() -> None:
    """The headline defect, stated as a test.

    At 02:00 IST on 1 April 2026 the user is in FY2026-27. A UTC anchor sees
    2026-03-31 and reports FY2025-26 -- every FY figure a year stale.
    """
    utc_instant = datetime(2026, 3, 31, 20, 30, tzinfo=UTC)
    assert financial_year_start(utc_instant) == datetime(2026, 4, 1)
    assert financial_year_label(utc_instant) == "FY2026-27"


def test_financial_year_label_format() -> None:
    assert financial_year_label(datetime(2026, 7, 26, tzinfo=UTC)) == "FY2026-27"
    assert financial_year_label(datetime(2026, 2, 1, tzinfo=UTC)) == "FY2025-26"


def test_financial_year_label_across_a_century_boundary() -> None:
    """The two-digit suffix must come from the year, not a hardcoded prefix."""
    assert financial_year_label(datetime(2099, 5, 1, tzinfo=UTC)) == "FY2099-00"


def test_defaults_read_the_current_clock() -> None:
    """Every helper must work with no argument, since that is the common call."""
    now = ledger_now()
    assert start_of_month().year == now.year
    assert start_of_month().month == now.month
    assert start_of_month().day == 1
    assert start_of_year().month == 1
    assert financial_year_start().month == 4
