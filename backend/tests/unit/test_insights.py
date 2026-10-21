"""Unit tests for the partial-month calendar rules in ``core/insight_rules.py``.

Totals may include the month in progress; averages, trends and growth rates may
not. Only the current month can be partial, and not on its final calendar day.

The reference date is injected (``REFERENCE``); nothing here reads the real
clock.
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal

from ledger_sync.core.calculator import complete_month_expense_rows, expense_rows
from ledger_sync.core.insight_rules import is_partial_month, month_key
from ledger_sync.db.models import Transaction, TransactionType

# 26 July 2026: July has 31 days, so 2026-07 is the month in progress and
# 2026-06 and earlier are complete.
REFERENCE = date(2026, 7, 26)


def tx(
    amount: float | str,
    when: datetime,
    kind: TransactionType = TransactionType.EXPENSE,
    category: str = "Groceries",
) -> Transaction:
    """Build an in-memory Transaction for calendar-rule tests."""
    return Transaction(
        amount=Decimal(str(amount)),
        type=kind,
        date=when,
        category=category,
        account="Everyday",
        from_account=None,
        to_account=None,
        currency="INR",
        subcategory="",
        note="",
    )


def on(year: int, month: int, day: int = 15) -> datetime:
    """A tz-aware instant, matching the convention in ``test_calculator.py``."""
    return datetime(year, month, day, tzinfo=UTC)


def test_month_key_zero_pads_to_match_group_by_month() -> None:
    assert month_key(date(2026, 7, 5)) == "2026-07"
    assert month_key(datetime(2026, 12, 31, tzinfo=UTC)) == "2026-12"


def test_only_the_current_month_is_partial() -> None:
    assert is_partial_month("2026-07", REFERENCE) is True
    assert is_partial_month("2026-06", REFERENCE) is False
    assert is_partial_month("2026-08", REFERENCE) is False


def test_the_last_day_of_a_month_is_complete() -> None:
    """Dropping it on the 31st would delete a whole real month from the trend."""
    assert is_partial_month("2026-07", date(2026, 7, 31)) is False
    assert is_partial_month("2026-07", date(2026, 7, 30)) is True


def test_complete_month_expense_rows_filters_type_and_month() -> None:
    rows = [
        tx(100, on(2026, 6)),
        tx(200, on(2026, 7, 10)),
        tx(300, on(2026, 6), kind=TransactionType.INCOME),
    ]
    kept = complete_month_expense_rows(rows, REFERENCE)
    assert [float(t.amount) for t in kept] == [100.0]


def test_expense_rows_keeps_every_month_but_only_expenses() -> None:
    rows = [
        tx(100, on(2026, 6)),
        tx(200, on(2026, 7, 10)),
        tx(300, on(2026, 6), kind=TransactionType.INCOME),
    ]
    assert [float(t.amount) for t in expense_rows(rows)] == [100.0, 200.0]
