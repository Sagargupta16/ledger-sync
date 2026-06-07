"""Time filtering utilities for transaction data."""

import calendar
from datetime import UTC, datetime, timedelta
from enum import StrEnum

from ledger_sync.db.models import Transaction


def _subtract_months(dt: datetime, months: int) -> datetime:
    """Subtract N calendar months from a datetime, clamping to a valid day."""
    month = dt.month - months
    year = dt.year + (month - 1) // 12
    month = (month - 1) % 12 + 1
    max_day = calendar.monthrange(year, month)[1]
    day = min(dt.day, max_day)
    return dt.replace(year=year, month=month, day=day)


class TimeRange(StrEnum):
    """Time range filter options."""

    ALL_TIME = "all_time"
    THIS_MONTH = "this_month"
    LAST_MONTH = "last_month"
    LAST_3_MONTHS = "last_3_months"
    LAST_6_MONTHS = "last_6_months"
    LAST_12_MONTHS = "last_12_months"
    THIS_YEAR = "this_year"
    LAST_YEAR = "last_year"
    LAST_DECADE = "last_decade"


class TimeFilter:
    """Filter transactions by time range."""

    @staticmethod
    def filter_by_range(
        transactions: list[Transaction],
        time_range: TimeRange,
    ) -> list[Transaction]:
        """Filter transactions by time range, anchored on ``now()``.

        "This month", "Last 3 months", etc. are computed relative to the
        current UTC time, not the user's most recent transaction. This
        keeps semantics consistent with the analytics API and means stale
        data legitimately yields empty filtered results instead of silently
        showing months-old data under "This Month" labels.
        """
        if time_range == TimeRange.ALL_TIME:
            return transactions

        if not transactions:
            return []

        now = datetime.now(UTC)

        if time_range == TimeRange.THIS_MONTH:
            start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            return [t for t in transactions if t.date >= start_date]

        if time_range == TimeRange.LAST_MONTH:
            first_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            last_month_end = first_of_month - timedelta(microseconds=1)
            last_month_start = last_month_end.replace(
                day=1, hour=0, minute=0, second=0, microsecond=0
            )
            return [t for t in transactions if last_month_start <= t.date <= last_month_end]

        # Sliding ranges -- calendar-aligned: snap to the first of the month
        # N-1 months ago, so "Last 3 months" = current + 2 prior calendar
        # months instead of a fixed 90-day window.
        first_of_now = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        if time_range == TimeRange.LAST_3_MONTHS:
            start_date = _subtract_months(first_of_now, 2)
            return [t for t in transactions if t.date >= start_date]

        if time_range == TimeRange.LAST_6_MONTHS:
            start_date = _subtract_months(first_of_now, 5)
            return [t for t in transactions if t.date >= start_date]

        if time_range == TimeRange.LAST_12_MONTHS:
            start_date = _subtract_months(first_of_now, 11)
            return [t for t in transactions if t.date >= start_date]

        if time_range == TimeRange.THIS_YEAR:
            start_date = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
            return [t for t in transactions if t.date >= start_date]

        if time_range == TimeRange.LAST_YEAR:
            year = now.year - 1
            start_date = datetime(year, 1, 1, tzinfo=UTC)
            end_date = datetime(year, 12, 31, 23, 59, 59, tzinfo=UTC)
            return [t for t in transactions if start_date <= t.date <= end_date]

        if time_range == TimeRange.LAST_DECADE:
            start_date = _subtract_months(first_of_now, 119)
            return [t for t in transactions if t.date >= start_date]

        return transactions

    @staticmethod
    def filter_by_custom_range(
        transactions: list[Transaction],
        start_date: datetime,
        end_date: datetime,
    ) -> list[Transaction]:
        """Filter transactions by custom date range.

        Args:
            transactions: List of transactions to filter
            start_date: Start date (inclusive)
            end_date: End date (inclusive)

        Returns:
            Filtered list of transactions

        """
        return [t for t in transactions if start_date <= t.date <= end_date]

    @staticmethod
    def filter_by_month_year(
        transactions: list[Transaction],
        month: int,
        year: int,
    ) -> list[Transaction]:
        """Filter transactions by specific month and year.

        Args:
            transactions: List of transactions to filter
            month: Month (1-12)
            year: Year

        Returns:
            Filtered list of transactions

        """
        return [t for t in transactions if t.date.month == month and t.date.year == year]

    @staticmethod
    def filter_by_year(transactions: list[Transaction], year: int) -> list[Transaction]:
        """Filter transactions by specific year.

        Args:
            transactions: List of transactions to filter
            year: Year

        Returns:
            Filtered list of transactions

        """
        return [t for t in transactions if t.date.year == year]

    @staticmethod
    def get_available_years(transactions: list[Transaction]) -> list[int]:
        """Get list of years present in transactions.

        Args:
            transactions: List of transactions

        Returns:
            Sorted list of years

        """
        if not transactions:
            return []

        return sorted({t.date.year for t in transactions})

    @staticmethod
    def get_available_months(transactions: list[Transaction], year: int) -> list[int]:
        """Get list of months present in transactions for a given year.

        Args:
            transactions: List of transactions
            year: Year to filter by

        Returns:
            Sorted list of months (1-12)

        """
        if not transactions:
            return []

        return sorted({t.date.month for t in transactions if t.date.year == year})
