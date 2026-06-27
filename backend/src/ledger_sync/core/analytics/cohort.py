"""Cohort spending aggregation mixin.

Materializes the "Spending Patterns" widget: average expense bucketed by
day-of-week, day-of-month, and month-of-year, each with an *occurrence-correct*
divisor (so a weekday that occurred 52 times divides by 52, not by a
week-numbering artefact, and days 29/30/31 divide only by the months that
actually contain them). Mirrors the previous client-side math in
``CohortSpendingAnalysis.tsx`` exactly -- moving it server-side also removes the
timezone bug class, since the DB stores naive local dates.
"""

from __future__ import annotations

import calendar
from collections import defaultdict
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import delete

from ledger_sync.core.analytics.base import AnalyticsEngineBase
from ledger_sync.db.models import CohortSpending, Transaction, TransactionType


class CohortMixin(AnalyticsEngineBase):
    """Mixin: temporal-cohort average-spend persistence."""

    def _calculate_cohort_spending(
        self,
        transactions: list[Transaction] | None = None,
    ) -> int:
        """Compute and persist day-of-week / day-of-month / month cohorts.

        Returns the number of cohort rows written.
        """
        if transactions is None:
            transactions = self._user_transaction_query().all()

        expenses = [t for t in transactions if t.type == TransactionType.EXPENSE]

        rows = self._build_cohort_rows(expenses)

        # Replace this user's cohort rows wholesale (small table, ≤ 7+31+12).
        if self.user_id is not None:
            self.db.execute(delete(CohortSpending).where(CohortSpending.user_id == self.user_id))

        now = datetime.now(UTC)
        for dimension, bucket, total, occ in rows:
            avg = (total / occ) if occ > 0 else Decimal(0)
            self.db.add(
                CohortSpending(
                    user_id=self.user_id,
                    dimension=dimension,
                    bucket=bucket,
                    total_amount=total,
                    occurrences=occ,
                    avg_amount=avg,
                    last_calculated=now,
                )
            )

        return len(rows)

    def _build_cohort_rows(
        self,
        expenses: list[Transaction],
    ) -> list[tuple[str, int, Decimal, int]]:
        """Return ``(dimension, bucket, total_amount, occurrences)`` tuples."""
        if not expenses:
            return []

        return [
            *self._dow_rows(expenses),
            *self._dom_rows(expenses),
            *self._month_rows(expenses),
        ]

    @staticmethod
    def _dow_rows(expenses: list[Transaction]) -> list[tuple[str, int, Decimal, int]]:
        """Day-of-week cohorts (bucket 0=Mon..6=Sun per Python weekday()).

        Divisor = exact count of each weekday in the inclusive [min, max] span,
        so zero-spend days are reflected (frequency, not just size).
        """
        totals: dict[int, Decimal] = defaultdict(lambda: Decimal(0))
        min_date = max_date = None
        for tx in expenses:
            wd = tx.date.weekday()  # Python weekday: Monday is zero, Sunday is six
            totals[wd] += abs(Decimal(str(tx.amount)))
            d = tx.date.date()
            if min_date is None or d < min_date:
                min_date = d
            if max_date is None or d > max_date:
                max_date = d

        occurrences = dict.fromkeys(range(7), 0)
        if min_date and max_date:
            total_days = (max_date - min_date).days + 1
            base = total_days // 7
            remainder = total_days % 7
            start_wd = min_date.weekday()
            for w in range(7):
                occurrences[w] = base
            for r in range(remainder):
                occurrences[(start_wd + r) % 7] += 1

        return [("day_of_week", wd, totals.get(wd, Decimal(0)), occurrences[wd]) for wd in range(7)]

    @staticmethod
    def _dom_rows(expenses: list[Transaction]) -> list[tuple[str, int, Decimal, int]]:
        """Day-of-month cohorts (bucket 1..31).

        Divisor = distinct YYYY-MM months whose length actually reaches that
        day (29/30/31 don't exist in every month).
        """
        totals: dict[int, Decimal] = defaultdict(lambda: Decimal(0))
        seen_months: set[str] = set()
        for tx in expenses:
            totals[tx.date.day] += abs(Decimal(str(tx.amount)))
            seen_months.add(tx.date.strftime("%Y-%m"))

        months_by_day: list[set[str]] = [set() for _ in range(32)]
        for ym in seen_months:
            y, m = (int(p) for p in ym.split("-"))
            days_in_month = calendar.monthrange(y, m)[1]
            for day in range(1, days_in_month + 1):
                months_by_day[day].add(ym)

        return [
            ("day_of_month", day, totals.get(day, Decimal(0)), len(months_by_day[day]))
            for day in range(1, 32)
        ]

    @staticmethod
    def _month_rows(expenses: list[Transaction]) -> list[tuple[str, int, Decimal, int]]:
        """Month-of-year cohorts (bucket 1..12).

        Divisor = distinct years that month appears in.
        """
        totals: dict[int, Decimal] = defaultdict(lambda: Decimal(0))
        years_by_month: list[set[int]] = [set() for _ in range(13)]
        for tx in expenses:
            month = tx.date.month
            totals[month] += abs(Decimal(str(tx.amount)))
            years_by_month[month].add(tx.date.year)

        return [
            ("month_of_year", m, totals.get(m, Decimal(0)), len(years_by_month[m]))
            for m in range(1, 13)
        ]
