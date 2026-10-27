"""Which ledger rows and plans describe the same bill, for safe-to-spend.

Recurring detection groups rows under a label: the note with any billing date
removed, else the category and subcategory. A bill's own rows carry its label,
so they are kept out of discretionary spend, and the label (or the same amount
on the same day) is what pairs a schedule with the commitment detected from
the rows that schedule produced.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from ledger_sync.core.analytics.recurring import normalize_recurring_note
from ledger_sync.core.analytics.recurring_amounts import MANUAL_ACCOUNT, effective_expected_amount
from ledger_sync.db.models import RecurringTransaction, ScheduledTransaction


def row_pattern_key(note: str | None, category: str, subcategory: str | None) -> str:
    """The label recurring detection groups a row under (``group_txns_by_pattern``)."""
    label = normalize_recurring_note(note)
    if label:
        return label
    lowered = category.lower()
    return f"{lowered} - {subcategory.lower()}" if subcategory else lowered


def pattern_keys(name: str) -> set[str]:
    """Labels a pattern's rows can carry, as refresh matches a confirmed row by name."""
    return {key for key in (normalize_recurring_note(name), name.lower()) if key}


def schedule_labels(schedule: ScheduledTransaction) -> set[str]:
    """Labels the schedule's own rows carry, as detection would group them.

    A Money Manager rule is named by its payee, else its subcategory or
    category, and a row with no note groups under its category and subcategory.
    """
    labels = pattern_keys(schedule.name)
    if schedule.name.lower() in (schedule.category.lower(), (schedule.subcategory or "").lower()):
        labels.add(row_pattern_key(None, schedule.category, schedule.subcategory))
    return labels


def _due_day(anchor: date | None, expected_day: int | None) -> int | None:
    return expected_day or (anchor.day if anchor else None)


def _same(a: str | None, b: str | None) -> bool:
    return (a or "").lower() == (b or "").lower()


#: How far apart a schedule's amount and a commitment's may be and still be one bill.
_AMOUNT_TOLERANCE = Decimal("0.15")


def _close(a: Decimal, b: Decimal) -> bool:
    larger = max(abs(a), abs(b))
    return abs(abs(a) - abs(b)) <= larger * _AMOUNT_TOLERANCE


def same_commitment(schedule: ScheduledTransaction, record: RecurringTransaction) -> bool:
    """Whether the schedule already carries this commitment.

    Same type and cadence, then a shared label on the same account, on any
    account for one added by hand (which has none), or on any account with an
    amount within 15%: a Money Manager rule often posts its rows from more than
    one account, so detection can file the bill under another one. Otherwise,
    on the same account, the same amount on the same day in the same category
    and subcategory. Two bills that only share an amount and a day (a maid and
    a cook paid on the 1st) stay apart: pairing them would drop a real bill and
    overstate the figure.
    """
    if schedule.type != record.transaction_type or schedule.frequency != record.frequency:
        return False
    same_account = _same(schedule.account, record.account)
    if schedule_labels(schedule) & pattern_keys(record.pattern_name):
        return (
            same_account
            or record.account == MANUAL_ACCOUNT
            or _close(schedule.amount, effective_expected_amount(record))
        )
    last = record.last_occurrence
    return (
        same_account
        and _same(schedule.category, record.category)
        and _same(schedule.subcategory, record.subcategory)
        and abs(schedule.amount) == abs(effective_expected_amount(record))
        and _due_day(schedule.next_due_date.date(), schedule.expected_day)
        == _due_day(last.date() if last else None, record.expected_day)
    )
