"""Dates on a recurrence cadence, for safe-to-spend's commitment and schedule flows.

Day cadences step a fixed number of days. Month cadences land on a day of the
month, clamped to short months, so a bill due on the 31st falls on the 30th of
a 30-day month and on the 31st again after it.
"""

from __future__ import annotations

import calendar
from datetime import date, timedelta

from ledger_sync.db.models import RecurrenceFrequency

_DAY_STRIDE = {
    RecurrenceFrequency.DAILY: 1,
    RecurrenceFrequency.WEEKLY: 7,
    RecurrenceFrequency.BIWEEKLY: 14,
}
_MONTH_STRIDE = {
    RecurrenceFrequency.MONTHLY: 1,
    RecurrenceFrequency.BIMONTHLY: 2,
    RecurrenceFrequency.QUARTERLY: 3,
    RecurrenceFrequency.SEMIANNUAL: 6,
    RecurrenceFrequency.YEARLY: 12,
}


def month_day(index: int, day: int) -> date:
    """The ``day`` of month ``index`` (year * 12 + month - 1), clamped to its length."""
    year, month0 = divmod(index, 12)
    last = calendar.monthrange(year, month0 + 1)[1]
    return date(year, month0 + 1, min(max(day, 1), last))


def expand_dates(
    anchor: date,
    frequency: RecurrenceFrequency,
    day_of_month: int | None,
    start: date,
    end: date,
    *,
    include_anchor: bool,
) -> list[date]:
    """Every date in ``[start, end]`` on the cadence through ``anchor``.

    Day cadences step a fixed number of days; month cadences land on
    ``day_of_month`` (default the anchor's day), clamped to short months.
    """
    first = 0 if include_anchor else 1
    stride = _DAY_STRIDE.get(frequency)
    if stride is not None:
        k = max(first, -(-(start - anchor).days // stride))
        dates = []
        while (current := anchor + timedelta(days=stride * k)) <= end:
            dates.append(current)
            k += 1
        return dates
    months = _MONTH_STRIDE[frequency]
    day = day_of_month or anchor.day
    base = anchor.year * 12 + anchor.month - 1
    k = max(first, (start.year * 12 + start.month - 1 - base) // months - 1)
    dates = []
    while (current := month_day(base + months * k, day)) <= end:
        if current >= start:
            dates.append(current)
        k += 1
    return dates


def interval_days(frequency: RecurrenceFrequency) -> int:
    """The cadence's interval in days; month cadences take 31 a month, a year 366."""
    if frequency in _DAY_STRIDE:
        return _DAY_STRIDE[frequency]
    months = _MONTH_STRIDE[frequency]
    return 366 if months == 12 else months * 31
