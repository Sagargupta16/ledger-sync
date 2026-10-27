"""Baseline detectors: large transfers and unusual category months.

Both judge a value against the user's OWN history with the robust statistics
``anomaly_detectors`` already uses, over a rolling 12 months that excludes the
value under test:

- **Large transfer**: a transfer against the median of what the same source
  account sent in the trailing year, gated by ratio, a log-space modified Z
  (the large-expense gate) and a materiality floor.
- **Unusual category**: a category's monthly total against its own median and
  MAD over the months of the trailing year in which it had spending, graded
  with the high-expense-month rules and the user's threshold. A month that
  repeats the previous month's total exactly is a new level, not a spike: a
  rent raised for good is flagged in its first month only, instead of until
  the new amount fills half the window.
"""

from __future__ import annotations

from bisect import bisect_left
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal
from statistics import median
from typing import Any

from ledger_sync.core.analytics.anomaly_detectors import AnomalyDetectorsMixin
from ledger_sync.core.analytics.anomaly_recurring_index import RecurringIndex
from ledger_sync.core.analytics.anomaly_rules import (
    AUTO_DISMISS_PREFIX,
    UNUSUAL_CATEGORY_PREFIX,
    SpendScale,
    described,
    month_index,
)
from ledger_sync.core.expense_class import is_capital_loss
from ledger_sync.core.query_helpers import as_naive
from ledger_sync.db.models import AnomalyType, Transaction, TransactionType

_WINDOW = timedelta(days=365)
_MIN_HISTORY = 5
_TRANSFER_FLAG_RATIO = 3.0
_TRANSFER_HIGH_RATIO = 5.0
#: Under this share of a month's typical spend a transfer is never "large".
_TRANSFER_MATERIALITY = 0.10
#: A category month must beat its median by this share of a month's typical
#: spend, so a small blip in a minor category stays quiet.
_CATEGORY_MATERIALITY = 0.02
_CATEGORY_WINDOW_MONTHS = 12


@dataclass(frozen=True, slots=True)
class CategoryGates:
    """Per-refresh inputs of the unusual-category detector.

    ``flagged`` holds the ids of expenses already flagged one by one, and
    ``recurring`` is set only when auto-dismiss is on.
    """

    z_cutoff: float
    scale: SpendScale
    flagged: frozenset[str]
    recurring: RecurringIndex | None


def _month_start(month: int) -> date:
    return date(month // 12, month % 12 + 1, 1)


def _repeats_previous(totals: dict[int, float], month: int) -> bool:
    """The month's total equals the month before's: a fixed amount at a new level."""
    previous = totals.get(month - 1)
    return previous is not None and round(previous, 2) == round(totals[month], 2)


class AnomalyBaselinesMixin(AnomalyDetectorsMixin):
    """Mixin: large-transfer and unusual-category detectors."""

    def _detect_large_transfers(
        self, anomalies: list[dict[str, Any]], ledger: list[Transaction], scale: SpendScale
    ) -> None:
        """Flag transfers far above what their source account usually sends."""
        history: dict[str, tuple[list[datetime], list[float]]] = defaultdict(lambda: ([], []))
        for txn in ledger:  # ascending by date
            if txn.type != TransactionType.TRANSFER:
                continue
            source = txn.from_account or txn.account
            dates, amounts = history[source.lower()]
            when = as_naive(txn.date)
            amount = float(txn.amount)
            # Strictly older rows of the trailing year: the row never judges itself.
            window = amounts[bisect_left(dates, when - _WINDOW) : bisect_left(dates, when)]
            dates.append(when)
            amounts.append(amount)
            if len(window) < _MIN_HISTORY or amount < _TRANSFER_MATERIALITY * scale.at(when):
                continue
            baseline = median(window)
            if baseline <= 0 or amount / baseline < _TRANSFER_FLAG_RATIO:
                continue
            if self._passes_log_dispersion_gate(amount, window):
                anomalies.append(self._large_transfer_finding(txn, source, baseline))

    def _large_transfer_finding(
        self, txn: Transaction, source: str, baseline: float
    ) -> dict[str, Any]:
        sym = self._currency_symbol
        when = as_naive(txn.date)
        ratio = float(txn.amount) / baseline
        return {
            "type": AnomalyType.LARGE_TRANSFER,
            "severity": "high" if ratio >= _TRANSFER_HIGH_RATIO else "medium",
            "description": (
                f"Large transfer from {source} to {txn.to_account or 'another account'}: "
                f"{sym}{float(txn.amount):,.0f} vs a usual {sym}{baseline:,.0f} from this account"
            ),
            "transaction_id": txn.transaction_id,
            "period_key": when.strftime("%Y-%m"),
            "expected_value": Decimal(str(round(baseline, 2))),
            "actual_value": txn.amount,
            "deviation_pct": (ratio - 1) * 100,
            "_when": when.date(),
        }

    def _grade_against(self, total: float, window: list[float], z_cutoff: float) -> str | None:
        """The high-expense-month grade of *total* against *window*."""
        med = median(window)
        mad = self._mad(window, med)
        fence = self._tukey_upper_fence(window) if mad == 0 else None
        return self._grade_month(total, med, mad, z_cutoff, mad == 0, fence)

    def _category_months(
        self, ledger: list[Transaction]
    ) -> dict[str, dict[int, list[Transaction]]]:
        """Expense rows per category per month, realised losses left out."""
        losses = self.capital_loss_keys
        months: dict[str, dict[int, list[Transaction]]] = defaultdict(lambda: defaultdict(list))
        for txn in ledger:
            if txn.type == TransactionType.EXPENSE and not is_capital_loss(
                txn.category, txn.subcategory, losses
            ):
                months[txn.category][month_index(txn.date)].append(txn)
        return months

    def _detect_unusual_categories(
        self, anomalies: list[dict[str, Any]], ledger: list[Transaction], gates: CategoryGates
    ) -> None:
        """Flag category months far above that category's own typical month."""
        for category, by_month in self._category_months(ledger).items():
            totals = {month: sum(float(t.amount) for t in rows) for month, rows in by_month.items()}
            for month, rows in by_month.items():
                window = [
                    value
                    for other, value in totals.items()
                    if month - _CATEGORY_WINDOW_MONTHS <= other < month
                ]
                if len(window) < _MIN_HISTORY or _repeats_previous(totals, month):
                    continue
                total = totals[month]
                finding = self._judge_category_month(category, month, rows, total, window, gates)
                if finding is not None:
                    self._explain_by_schedule(finding, rows, total, window, gates)
                    anomalies.append(finding)

    def _judge_category_month(
        self,
        category: str,
        month: int,
        rows: list[Transaction],
        total: float,
        window: list[float],
        gates: CategoryGates,
    ) -> dict[str, Any] | None:
        """The finding for a material, outlying category month, else None."""
        med = median(window)
        start = _month_start(month)
        if med <= 0 or total - med < _CATEGORY_MATERIALITY * gates.scale.at(start):
            return None
        severity = self._grade_against(total, window, gates.z_cutoff)
        # One expense already flagged on its own explains the month; a second
        # card for the same purchase is noise.
        single = sum(float(t.amount) for t in rows if t.transaction_id in gates.flagged)
        if severity is None or (
            single and self._grade_against(total - single, window, gates.z_cutoff) is None
        ):
            return None
        sym = self._currency_symbol
        return {
            "type": AnomalyType.UNUSUAL_CATEGORY,
            "severity": severity,
            "description": described(
                UNUSUAL_CATEGORY_PREFIX,
                category,
                f"{sym}{total:,.0f} in {start:%b %Y} vs a typical {sym}{med:,.0f} a month",
            ),
            "period_key": start.strftime("%Y-%m"),
            "expected_value": Decimal(str(round(med, 2))),
            "actual_value": Decimal(str(round(total, 2))),
            "deviation_pct": (total - med) / med * 100,
            "_when": start,
        }

    def _explain_by_schedule(
        self,
        finding: dict[str, Any],
        rows: list[Transaction],
        total: float,
        window: list[float],
        gates: CategoryGates,
    ) -> None:
        """File the month dismissed when a bill on a longer-than-monthly schedule explains it."""
        if gates.recurring is None:
            return
        scheduled, names = gates.recurring.scheduled_share(rows)
        if scheduled and self._grade_against(total - scheduled, window, gates.z_cutoff) is None:
            finding["_auto_dismiss"] = (
                f"{AUTO_DISMISS_PREFIX}explained by the recurring {', '.join(names)}."
            )
