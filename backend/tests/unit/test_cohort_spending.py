"""Unit tests for cohort-spending divisor math.

The averages hinge on occurrence-correct divisors (the bug class this replaced
inflated them several-fold). These lock in:
- day-of-week divides by real weekday occurrences in the [min, max] span
- day-of-month divides only by months that actually contain that day
- month-of-year divides by distinct years the month appears in
"""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from ledger_sync.core.analytics.cohort import CohortMixin
from ledger_sync.db.models import Transaction, TransactionType


def _expense(date: datetime, amount: str) -> Transaction:
    return Transaction(
        transaction_id=f"{date.isoformat()}-{amount}",
        user_id=1,
        date=date,
        amount=Decimal(amount),
        currency="INR",
        type=TransactionType.EXPENSE,
        account="HDFC",
        category="Food",
        source_file="t.xlsx",
        last_seen_at=date,
        is_deleted=False,
    )


def _rows_by_dim(rows, dim):
    return {bucket: (total, occ) for (d, bucket, total, occ) in rows if d == dim}


def test_day_of_week_divides_by_real_weekday_occurrences() -> None:
    # 2024-01-01 is a Monday. Span Mon 1 Jan .. Sun 7 Jan = exactly one of each
    # weekday. Two Monday expenses (100 + 50) -> Monday avg = 150 / 1.
    txns = [
        _expense(datetime(2024, 1, 1, tzinfo=UTC), "100"),  # Mon
        _expense(datetime(2024, 1, 1, tzinfo=UTC), "50"),  # Mon (same day)
        _expense(datetime(2024, 1, 7, tzinfo=UTC), "70"),  # Sun
    ]
    rows = CohortMixin._dow_rows(txns)
    dow = _rows_by_dim([("day_of_week", b, t, o) for (_, b, t, o) in rows], "day_of_week")

    # Python weekday Mon=0
    assert dow[0] == (Decimal("150"), 1)  # Monday: total 150, 1 occurrence
    assert dow[6] == (Decimal("70"), 1)  # Sunday: total 70, 1 occurrence
    # A weekday with no spend still has 1 occurrence in the span (divisor != 0).
    assert dow[2][0] == Decimal("0")
    assert dow[2][1] == 1


def test_day_of_month_only_counts_months_reaching_that_day() -> None:
    # Feb 2023 (28 days) + Jan 2023 (31 days). Day 31 exists only in Jan.
    txns = [
        _expense(datetime(2023, 1, 31, tzinfo=UTC), "300"),
        _expense(datetime(2023, 1, 15, tzinfo=UTC), "100"),
        _expense(datetime(2023, 2, 15, tzinfo=UTC), "100"),
    ]
    rows = CohortMixin._dom_rows(txns)
    dom = {b: (t, o) for (_, b, t, o) in rows}

    # Day 31: only Jan reaches it -> divisor 1.
    assert dom[31] == (Decimal("300"), 1)
    # Day 15: both Jan and Feb reach it -> divisor 2, total 200.
    assert dom[15] == (Decimal("200"), 2)


def test_month_of_year_divides_by_distinct_years() -> None:
    # January appears in 2023 and 2024 -> divisor 2.
    txns = [
        _expense(datetime(2023, 1, 10, tzinfo=UTC), "100"),
        _expense(datetime(2024, 1, 10, tzinfo=UTC), "300"),
        _expense(datetime(2023, 6, 10, tzinfo=UTC), "60"),
    ]
    rows = CohortMixin._month_rows(txns)
    moy = {b: (t, o) for (_, b, t, o) in rows}

    assert moy[1] == (Decimal("400"), 2)  # Jan total 400 over 2 years
    assert moy[6] == (Decimal("60"), 1)  # Jun total 60 over 1 year


def test_empty_expenses_yield_no_rows() -> None:
    assert CohortMixin._build_cohort_rows(None, []) == []  # type: ignore[arg-type]
