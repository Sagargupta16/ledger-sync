"""What the weekly recap lists as coming up: expense commitments and payday.

Bills restate the rules the Bill Calendar and the notification bell apply:

- the due date starts from the recurring endpoint's ``next_expected``
  (``api/analytics_v2_impl/recurring_rules._next_expected_for_record``),
  restated because core must not import the API layer;
- a detected commitment counts while its last payment is inside the review
  window of two cadence intervals plus seven days, and a confirmed one always
  counts (frontend ``lib/recurringCalculations.isAcceptedRecurringCommitment``);
- a due date already past rolls forward to its first occurrence from today,
  the way the Bill Calendar keeps plotting a bill whose latest payment is not
  imported yet. It rolls only while the last payment is inside that review
  window, so a long-stopped confirmed commitment does not come back;
- the window is today and the next seven days, the bell's ``DUE_SOON_DAYS``.

Amounts are the effective amount the recurring endpoint serves: the user's own
when one is set, else the detected one (``core/analytics/recurring_amounts``).
Card statement dues are not recurring rows, so they stay on the Bill Calendar.
"""

from __future__ import annotations

import calendar
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from ledger_sync.core.analytics.recurring import DISMISSED_PATTERN_KIND, effective_pattern_kind
from ledger_sync.core.analytics.recurring_amounts import (
    effective_expected_amount,
    load_user_amount,
)
from ledger_sync.core.weekly_recap_flows import money
from ledger_sync.db.models import RecurrenceFrequency, RecurringTransaction, TransactionType
from ledger_sync.schemas.weekly_recap import BillDue, RecapBills, RecapPayday

#: Days after today the window runs to: today plus the next seven days.
DUE_HORIZON_DAYS = 7

_DAY_STRIDES = {
    RecurrenceFrequency.DAILY: 1,
    RecurrenceFrequency.WEEKLY: 7,
    RecurrenceFrequency.BIWEEKLY: 14,
}
_MONTH_STRIDES = {
    RecurrenceFrequency.MONTHLY: 1,
    RecurrenceFrequency.BIMONTHLY: 2,
    RecurrenceFrequency.QUARTERLY: 3,
    RecurrenceFrequency.SEMIANNUAL: 6,
    RecurrenceFrequency.YEARLY: 12,
}


def _clamped(year: int, month: int, day: int) -> date:
    return date(year, month, min(max(day, 1), calendar.monthrange(year, month)[1]))


def _add_months(anchor: date, months: int, day: int) -> date:
    year, month_index = divmod(anchor.year * 12 + anchor.month - 1 + months, 12)
    return _clamped(year, month_index + 1, day)


def _step(anchor: date, frequency: RecurrenceFrequency, expected_day: int | None) -> date | None:
    months = _MONTH_STRIDES.get(frequency)
    if months is not None:
        return _add_months(anchor, months, expected_day or anchor.day)
    days = _DAY_STRIDES.get(frequency)
    return anchor + timedelta(days=days) if days is not None else None


def next_due(record: RecurringTransaction, today: date) -> date | None:
    """The endpoint's ``next_expected`` as a date (see the module docstring)."""
    frequency = record.frequency
    if (
        record.last_occurrence is None
        and record.is_user_confirmed
        and frequency == RecurrenceFrequency.MONTHLY
        and record.expected_day
    ):
        # A manual monthly commitment has a due day before it has any history.
        due = _clamped(today.year, today.month, record.expected_day)
        return due if due >= today else _step(today, frequency, record.expected_day)
    if record.last_occurrence is None:
        return None
    return _step(record.last_occurrence.date(), frequency, record.expected_day)


def _review_window_days(frequency: RecurrenceFrequency) -> int | None:
    interval = _DAY_STRIDES.get(frequency)
    if interval is None:
        months = _MONTH_STRIDES.get(frequency)
        if months is None:
            return None
        interval = 366 if months == 12 else months * 31
    return interval * 2 + 7


def _within_review_window(record: RecurringTransaction, today: date) -> bool:
    """The last payment is at most two cadence intervals plus seven days old."""
    window = _review_window_days(record.frequency)
    if window is None or record.last_occurrence is None:
        return False
    return 0 <= (today - record.last_occurrence.date()).days <= window


def _is_accepted(record: RecurringTransaction, today: date) -> bool:
    return record.is_user_confirmed or _within_review_window(record, today)


def _roll_forward(record: RecurringTransaction, due: date, today: date) -> date | None:
    """*due*, or the first occurrence after it that falls on or after *today*.

    A missed or not-yet-imported payment keeps its cadence. Past the review
    window the commitment has stopped rather than lagged, so it has no due date.
    """
    last = record.last_occurrence
    if due >= today:
        return due
    if last is None or not _within_review_window(record, today):
        return None
    stride = _DAY_STRIDES.get(record.frequency)
    if stride is not None:
        return due + timedelta(days=-(-(today - due).days // stride) * stride)
    months = _MONTH_STRIDES[record.frequency]
    # Step from the last payment, not from a clamped due date, so the 31st
    # does not drift to the 30th after a short month.
    day, steps = record.expected_day or last.day, 1
    while due < today:
        steps += 1
        due = _add_months(last.date(), months * steps, day)
    return due


def _bill(record: RecurringTransaction, today: date, window_end: date) -> BillDue | None:
    """The commitment as it falls due in the window, or ``None`` when it does not."""
    if effective_pattern_kind(record) != "commitment" or not _is_accepted(record, today):
        return None
    due = next_due(record, today)
    due = None if due is None else _roll_forward(record, due, today)
    if due is None or due > window_end:
        return None
    stride = _DAY_STRIDES.get(record.frequency)
    occurrences = 1 + (window_end - due).days // stride if stride else 1
    amount = abs(effective_expected_amount(record))
    return BillDue(
        id=record.id,
        name=record.pattern_name,
        category=record.category,
        frequency=record.frequency.value,
        due_date=due,
        days_until=(due - today).days,
        amount=money(amount),
        occurrences=occurrences,
        total=money(amount * occurrences),
        is_confirmed=record.is_user_confirmed,
    )


def bills_due(db: Session, user_id: int, today: date) -> RecapBills:
    """Active expense commitments falling due from today to seven days ahead."""
    window_end = today + timedelta(days=DUE_HORIZON_DAYS)
    records = db.scalars(
        select(RecurringTransaction)
        .options(load_user_amount())
        .where(
            RecurringTransaction.user_id == user_id,
            RecurringTransaction.pattern_kind != DISMISSED_PATTERN_KIND,
            RecurringTransaction.is_active.is_(True),
            RecurringTransaction.transaction_type == TransactionType.EXPENSE,
        )
    ).all()
    items = [bill for record in records if (bill := _bill(record, today, window_end)) is not None]
    items.sort(key=lambda bill: (bill.due_date, -bill.total, bill.name))
    # Each item total is exact to the paisa (amounts are NUMERIC(15, 2)).
    total = sum((Decimal(str(bill.total)) for bill in items), Decimal(0))
    return RecapBills(window_start=today, window_end=window_end, total=money(total), items=items)


def next_payday(today: date, payday: int | None) -> RecapPayday:
    """Today when it is payday, else the next one; short months clamp the day."""
    day = min(max(payday or 1, 1), 31)
    upcoming = _clamped(today.year, today.month, day)
    if upcoming < today:
        upcoming = _add_months(today, 1, day)
    return RecapPayday(day_of_month=day, next_date=upcoming, days_until=(upcoming - today).days)
