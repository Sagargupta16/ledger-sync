"""When a commitment's entries were due, and which of them did not arrive.

The walk starts after the due the pattern's last occurrence paid. An entry
pays a due from its grace window before it until the next cycle's window
opens, so the next cycle's entry, or one months later, never covers a skipped
one. On a fixed day of the month the schedule keeps its dates, and a payment a
few days early or late across a month end (rent for the 1st paid on the 30th)
counts for its own due. A skipped entry followed by a normal one is found when
the last occurrence lags the entries (another note, matched by category), but
not when recurring detection already moved it past the skip.
"""

from __future__ import annotations

import calendar
from bisect import bisect_left
from datetime import datetime, timedelta

from ledger_sync.core.query_helpers import as_naive
from ledger_sync.db.models import RecurrenceFrequency, RecurringTransaction

_FREQ = RecurrenceFrequency
_MONTHS = {
    _FREQ.MONTHLY: 1,
    _FREQ.BIMONTHLY: 2,
    _FREQ.QUARTERLY: 3,
    _FREQ.SEMIANNUAL: 6,
    _FREQ.YEARLY: 12,
}
_DAYS = {_FREQ.DAILY: 1, _FREQ.WEEKLY: 7, _FREQ.BIWEEKLY: 14}
#: How late an entry may land before it counts as missing.
_GRACE_DAYS = {
    _FREQ.DAILY: 2,
    _FREQ.WEEKLY: 3,
    _FREQ.BIWEEKLY: 4,
    _FREQ.MONTHLY: 7,
    _FREQ.BIMONTHLY: 10,
    _FREQ.QUARTERLY: 15,
    _FREQ.SEMIANNUAL: 20,
    _FREQ.YEARLY: 30,
}
_MAX_CYCLES = 60
#: ``(first missed due, latest missed due, last entry before them, how many)``.
type MissedRun = tuple[datetime, datetime, datetime, int]


def _add_months(when: datetime, months: int, day: int) -> datetime:
    """*when* moved by *months*, on *day* clamped to that month's length."""
    year, month = divmod(when.year * 12 + when.month - 1 + months, 12)
    last_day = calendar.monthrange(year, month + 1)[1]
    return when.replace(year=year, month=month + 1, day=min(max(day, 1), last_day))


def next_due(last: datetime, frequency: RecurrenceFrequency, expected_day: int | None) -> datetime:
    """The entry after *last*, on the pattern's day of month when it has one."""
    months = _MONTHS.get(frequency)
    if months is None:
        return last + timedelta(days=_DAYS.get(frequency, 30))
    return _add_months(last, months, expected_day or last.day)


def _first_due(
    last: datetime, frequency: RecurrenceFrequency, day: int | None, grace: timedelta
) -> datetime:
    """The due after the one *last* paid.

    On a fixed day of the month, *last* may have paid the due of its own month,
    the one before (late, across a month end) or the next one (early: rent for
    the 1st paid on the 30th). Without a fixed day the schedule follows *last*.
    """
    months = _MONTHS.get(frequency)
    if months is None or day is None:
        return next_due(last, frequency, day)
    paid = _add_months(last, 0, day)
    if last < paid - grace:
        paid = _add_months(paid, -months, day)
    elif last >= _add_months(paid, months, day) - grace:
        paid = _add_months(paid, months, day)
    return _add_months(paid, months, day)


def missed_entries(
    pattern: RecurringTransaction, entries: list[datetime], as_of: datetime
) -> MissedRun | None:
    """The latest run of consecutive missed entries since the last occurrence, else None.

    *entries* are the ascending dates of rows that could be the pattern's
    entries; *as_of* is the newest date the account's data covers.
    """
    if pattern.last_occurrence is None:
        return None
    frequency, day = pattern.frequency, pattern.expected_day
    fixed_day = day is not None and frequency in _MONTHS
    grace = timedelta(days=_GRACE_DAYS.get(frequency, 7))
    last = as_naive(pattern.last_occurrence)
    due = _first_due(last, frequency, day, grace)
    run: MissedRun | None = None
    latest_run: MissedRun | None = None
    for _ in range(_MAX_CYCLES):
        if due + grace >= as_of:
            break
        following = next_due(due, frequency, day)
        # Paid on time or late, but before the next cycle's window opens.
        closes = max(following - grace, due + grace)
        found = bisect_left(entries, max(due - grace, last + timedelta(seconds=1)))
        if found < len(entries) and entries[found] < closes and entries[found] <= as_of:
            # Paid, perhaps under another note. A fixed day keeps its dates;
            # any other schedule follows the payment, never back onto this due.
            last, run = entries[found], None
            follows = next_due(last, frequency, day)
            due = following if fixed_day or follows <= due else follows
            continue
        run = (run[0], due, last, run[3] + 1) if run else (due, due, last, 1)
        latest_run, due = run, following
    return latest_run
