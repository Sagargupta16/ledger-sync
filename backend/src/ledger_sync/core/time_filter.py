"""Time filtering utilities for transaction data."""

from datetime import datetime, timedelta
from enum import Enum

from ledger_sync.db.models import Transaction


class TimeRange(str, Enum):
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
        transactions: list[Transaction], time_range: TimeRange
    ) -> list[Transaction]:
        """Filter transactions by time range.

        Args:
            transactions: List of transactions to filter
            time_range: Time range to filter by

        Returns:
            Filtered list of transactions
        """
        if time_range == TimeRange.ALL_TIME:
            return transactions

        if not transactions:
            return []

        # Get the latest transaction date as reference
        latest_date = max(t.date for t in transactions)

        if time_range == TimeRange.THIS_MONTH:
            start_date = latest_date.replace(day=1)
            return [t for t in transactions if t.date >= start_date]

        elif time_range == TimeRange.LAST_MONTH:
            # First day of current month
            first_of_month = latest_date.replace(day=1)
            # Last day of previous month
            last_month_end = first_of_month - timedelta(days=1)
            # First day of previous month
            last_month_start = last_month_end.replace(day=1)
            return [t for t in transactions if last_month_start <= t.date <= last_month_end]

        elif time_range == TimeRange.LAST_3_MONTHS:
            start_date = latest_date - timedelta(days=90)
            return [t for t in transactions if t.date >= start_date]

        elif time_range == TimeRange.LAST_6_MONTHS:
            start_date = latest_date - timedelta(days=180)
            return [t for t in transactions if t.date >= start_date]

        elif time_range == TimeRange.LAST_12_MONTHS:
            start_date = latest_date - timedelta(days=365)
            return [t for t in transactions if t.date >= start_date]

        elif time_range == TimeRange.THIS_YEAR:
            start_date = latest_date.replace(month=1, day=1)
            return [t for t in transactions if t.date >= start_date]

        elif time_range == TimeRange.LAST_YEAR:
            year = latest_date.year - 1
            start_date = datetime(year, 1, 1)
            end_date = datetime(year, 12, 31, 23, 59, 59)
            return [t for t in transactions if start_date <= t.date <= end_date]

        elif time_range == TimeRange.LAST_DECADE:
            start_date = latest_date - timedelta(days=3650)  # Approx 10 years
            return [t for t in transactions if t.date >= start_date]

        return transactions

    @staticmethod
    def filter_by_custom_range(
        transactions: list[Transaction], start_date: datetime, end_date: datetime
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
        transactions: list[Transaction], month: int, year: int
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

        years = sorted({t.date.year for t in transactions})
        return years

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

        months = sorted({t.date.month for t in transactions if t.date.year == year})
        return months
