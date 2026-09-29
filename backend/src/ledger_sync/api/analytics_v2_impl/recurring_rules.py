"""Shared rules for the recurring-transaction endpoints.

Next-expected-date estimation, the editable-field and validation constants, and
the lookup/rename helpers the CRUD handlers in ``recurring`` use.
"""

from __future__ import annotations

import calendar
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ledger_sync.core.analytics.recurring import (
    DISMISSED_PATTERN_KIND,
    effective_pattern_kind,
    normalize_recurring_note,
)
from ledger_sync.core.ledger_clock import ledger_now
from ledger_sync.db.models import RecurringTransaction

_FREQUENCY_DAYS = {
    "daily": 1,
    "weekly": 7,
    "biweekly": 14,
}
_FREQUENCY_MONTHS = {"monthly": 1, "bimonthly": 2, "quarterly": 3, "semiannual": 6, "yearly": 12}


def _compute_next_expected(
    last_occurrence: datetime | None,
    frequency: str | None,
    expected_day: int | None,
) -> str | None:
    """Estimate the next expected date from last occurrence + frequency."""
    if not last_occurrence or not frequency:
        return None
    freq = frequency.lower()
    months = _FREQUENCY_MONTHS.get(freq)
    if months:
        year, month_index = divmod(
            last_occurrence.year * 12 + last_occurrence.month - 1 + months, 12
        )
        month = month_index + 1
        day = min(max(expected_day or last_occurrence.day, 1), calendar.monthrange(year, month)[1])
        return last_occurrence.replace(year=year, month=month, day=day).isoformat()
    days = _FREQUENCY_DAYS.get(freq)
    if days:
        return (last_occurrence + timedelta(days=days)).isoformat()
    return None


def _next_expected_for_record(record: RecurringTransaction) -> str | None:
    """Manual monthly commitments can have a due day without any ledger history."""
    if effective_pattern_kind(record) != "commitment":
        return None
    frequency = record.frequency.value if record.frequency else None
    if (
        record.last_occurrence is None
        and record.is_user_confirmed
        and frequency == "monthly"
        and record.expected_day
    ):
        today = ledger_now().replace(hour=0, minute=0, second=0, microsecond=0)
        day = min(max(record.expected_day, 1), calendar.monthrange(today.year, today.month)[1])
        due = today.replace(day=day)
        if due >= today:
            return due.isoformat()
        return _compute_next_expected(today, frequency, record.expected_day)
    return _compute_next_expected(record.last_occurrence, frequency, record.expected_day)


_VALID_PATTERN_KINDS = {"commitment", "habit"}
_MANUAL_ACCOUNT = "Manual"
_USER_EDITABLE_FIELDS = (
    "pattern_name",
    "frequency",
    "expected_amount",
    "is_active",
    "pattern_kind",
)


def _find_visible_record(db: Session, user_id: int, item_id: int) -> RecurringTransaction:
    """Return the user's row, treating a dismissed tombstone as already deleted."""
    record = (
        db.query(RecurringTransaction)
        .filter(
            RecurringTransaction.id == item_id,
            RecurringTransaction.user_id == user_id,
            RecurringTransaction.pattern_kind != DISMISSED_PATTERN_KIND,
        )
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="Recurring transaction not found")
    return record


def _detection_keys(name: str) -> set[str]:
    """Labels refresh matches a confirmed row by (see ``_load_confirmed_recurring``)."""
    return {key for key in (normalize_recurring_note(name), name.lower()) if key}


def _dismiss_detection_label(db: Session, record: RecurringTransaction, new_name: str) -> None:
    """Keep a renamed detected pattern from being re-detected under its old name.

    Refresh finds a confirmed row by its name. Once renamed, the old label no
    longer matches it, so the next refresh would add a duplicate detected row
    for the same transactions. A dismissed tombstone under the old name holds
    that label instead; the renamed row keeps the user's name and values.
    """
    if record.account == _MANUAL_ACCOUNT:
        return
    new_keys = _detection_keys(new_name)
    if _detection_keys(record.pattern_name) <= new_keys:
        return
    # Renaming back onto a label this row left behind reclaims that label.
    for tombstone in db.query(RecurringTransaction).filter(
        RecurringTransaction.user_id == record.user_id,
        RecurringTransaction.transaction_type == record.transaction_type,
        RecurringTransaction.pattern_kind == DISMISSED_PATTERN_KIND,
    ):
        if _detection_keys(tombstone.pattern_name) & new_keys:
            db.delete(tombstone)
    db.add(
        RecurringTransaction(
            user_id=record.user_id,
            pattern_name=record.pattern_name,
            category=record.category,
            subcategory=record.subcategory,
            account=record.account,
            transaction_type=record.transaction_type,
            frequency=record.frequency,
            expected_amount=record.expected_amount,
            amount_variance=record.amount_variance,
            expected_day=record.expected_day,
            confidence_score=record.confidence_score,
            occurrences_detected=record.occurrences_detected,
            pattern_kind=DISMISSED_PATTERN_KIND,
            last_occurrence=record.last_occurrence,
            is_active=False,
            is_user_confirmed=True,
            first_detected=record.first_detected,
            last_updated=datetime.now(UTC),
        )
    )


_VALID_FREQUENCIES = {
    "daily",
    "weekly",
    "biweekly",
    "monthly",
    "bimonthly",
    "quarterly",
    "semiannual",
    "yearly",
}
