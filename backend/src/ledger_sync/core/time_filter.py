"""Time range options for the analytics time filter."""

from enum import StrEnum


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
