"""Robust-statistics anomaly detectors used by ``AnomaliesMixin``.

The high-expense-month detector (rolling modified Z-score with an IQR fence
fallback) and the large-transaction detector (rolling per-category median with
materiality and log-dispersion gates). The algorithm rationale and the
threshold mapping are documented in ``ledger_sync.core.analytics.anomalies``.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal
from math import log
from statistics import median, quantiles
from typing import Any

from sqlalchemy import func

from ledger_sync.core.analytics.base import AnalyticsEngineBase
from ledger_sync.core.query_helpers import (
    apply_excluded_accounts_filter,
    fmt_year_month,
)
from ledger_sync.db.models import (
    AnomalyType,
    Transaction,
    TransactionType,
)

# Iglewicz-Hoaglin constant for modified Z-score: 0.6745 = Phi^-1(0.75),
# makes MAD an unbiased estimator of sigma for normally distributed data.
_MZ_CONSTANT = 0.6745

# NIST-recommended cutoff for the Iglewicz-Hoaglin modified Z-score.
# See NIST Handbook of Statistical Methods, section 1.3.5.17.
_DEFAULT_MODIFIED_Z_CUTOFF = 3.5

# The legacy stdev multiplier that produced the default behavior; we anchor
# the mapping stored_threshold=2.0 <-> modified_z=3.5 so a user who never
# tuned the setting sees behavior close to the audit-published intent.
_LEGACY_ANCHOR_STDEV = 2.0

# Rolling window for large-transaction category baseline. 12 months is the
# standard financial-time-series window; anything shorter loses seasonal
# smoothing, longer lets stale outliers linger in the baseline.
_LARGE_TXN_WINDOW = timedelta(days=365)

# Minimum sample size for the rolling baseline. Below this we're comparing
# against noise, not a signal -- warmup returns no anomalies rather than
# false-positive spam.
_LARGE_TXN_MIN_HISTORY = 5

# Ratio thresholds for large-transaction severity grading.
_LARGE_TXN_HIGH_RATIO = 5.0
_LARGE_TXN_FLAG_RATIO = 3.0

# Materiality floor for large-transaction flags, as a fraction of the user's
# median monthly expense. A 3x-of-median chai in a tiny category is not an
# anomaly worth surfacing; real-data measurement showed ratio>=3 alone flagged
# 14.4% of ALL expenses, mostly sub-trivial amounts.
_LARGE_TXN_MATERIALITY_FRACTION = 0.01

# Rolling month window for the high-expense-month baseline.
_MONTH_BASELINE_WINDOW = 12

# Minimum months of history before a month can be judged (matches
# _LARGE_TXN_MIN_HISTORY so both detectors share the same warmup notion).
_MONTH_BASELINE_MIN_HISTORY = 5


class AnomalyDetectorsMixin(AnalyticsEngineBase):
    """Mixin: high-expense-month and large-transaction anomaly detectors."""

    # ─── robust baseline helpers ───────────────────────────────────────────

    @staticmethod
    def _mad(values: list[float], baseline: float) -> float:
        """Median Absolute Deviation from a given baseline (usually the median)."""
        return median(abs(v - baseline) for v in values)

    @staticmethod
    def _tukey_upper_fence(values: list[float], k: float = 1.5) -> float | None:
        """Q3 + k * IQR. Returns None if there are too few values for Q1/Q3."""
        if len(values) < 4:  # quantile needs >=4 samples
            return None
        q1, _q2, q3 = quantiles(values, n=4)
        return q3 + k * (q3 - q1)

    # ─── high-expense-month detector ───────────────────────────────────────

    def _detect_high_expense_months(
        self,
        anomalies: list[dict[str, Any]],
        z_cutoff: float,
    ) -> None:
        """Append anomaly dicts for months whose total expenses look unusual.

        Uses Iglewicz-Hoaglin modified Z-score with IQR fence fallback.
        See module docstring for the algorithm rationale.
        """
        sym = self._currency_symbol
        user_id = self._require_user_id()
        period_col = fmt_year_month(Transaction.date)
        monthly_query = (
            self.db.query(
                period_col.label("period"),
                func.sum(Transaction.amount).label("total"),
            )
            .filter(Transaction.user_id == user_id)
            .filter(Transaction.is_deleted.is_(False))
            .filter(Transaction.type == TransactionType.EXPENSE)
        )
        # Classified realised losses are not spending, so they must not enter
        # either side of this comparison. Excluding them affects the detector
        # TWICE: the month under test stops being flagged as an overspending
        # month (a bad trade is not overspending, and the "reduce your spending"
        # framing is advice the user cannot act on), and every trailing baseline
        # median/MAD drops them too -- a loss left in the window raises the bar
        # and can mask a genuine overspending month later.
        monthly_query = self._exclude_capital_losses(monthly_query)
        monthly_query = apply_excluded_accounts_filter(monthly_query, self.excluded_accounts)
        monthly_expenses = sorted(monthly_query.group_by(period_col).all(), key=lambda m: m.period)

        if len(monthly_expenses) <= 3:  # documented warmup
            return

        # Rolling baseline: judge each month against the trailing 12 months
        # only. Spending series are non-stationary (income growth, lifestyle
        # drift), so an all-time median made every recent month "anomalous"
        # versus years-old spending levels.
        for i, month in enumerate(monthly_expenses):
            window = [
                float(m.total) for m in monthly_expenses[max(0, i - _MONTH_BASELINE_WINDOW) : i]
            ]
            if len(window) < _MONTH_BASELINE_MIN_HISTORY:
                continue  # warmup: not enough trailing history

            med = median(window)
            if med <= 0:
                continue
            mad = self._mad(window, med)
            use_iqr = mad == 0
            iqr_fence = self._tukey_upper_fence(window) if use_iqr else None

            total = float(month.total)
            severity = self._grade_month(total, med, mad, z_cutoff, use_iqr, iqr_fence)
            if severity is None:
                continue
            deviation_pct = ((total - med) / med) * 100
            anomalies.append(
                {
                    "type": AnomalyType.HIGH_EXPENSE,
                    "severity": severity,
                    "description": (
                        f"Unusually high expenses in {month.period}: "
                        f"{sym}{total:,.0f} vs trailing median {sym}{med:,.0f}"
                    ),
                    "period_key": month.period,
                    "expected_value": Decimal(str(med)),
                    "actual_value": Decimal(str(month.total)),
                    "deviation_pct": deviation_pct,
                },
            )

    @staticmethod
    def _grade_month(
        total: float,
        med: float,
        mad: float,
        z_cutoff: float,
        use_iqr: bool,
        iqr_fence: float | None,
    ) -> str | None:
        """Return "high" / "medium" if the month is anomalous, else None."""
        if use_iqr:
            if iqr_fence is None or total <= iqr_fence:
                return None
            return "high" if total > med * 2.5 else "medium"
        m_z = _MZ_CONSTANT * (total - med) / mad
        if m_z <= z_cutoff:
            return None
        # Grade by how far past the cutoff we are, not raw deviation.
        return "high" if m_z >= z_cutoff * 1.5 else "medium"

    # ─── large-transaction detector (rolling window) ───────────────────────

    @staticmethod
    def _large_transaction_materiality_floor(expense_txns: list[Transaction]) -> float:
        monthly_totals: dict[str, float] = {}
        for transaction in expense_txns:
            month = transaction.date.strftime("%Y-%m")
            monthly_totals[month] = monthly_totals.get(month, 0.0) + float(transaction.amount)
        if not monthly_totals:
            return 0.0
        return _LARGE_TXN_MATERIALITY_FRACTION * median(monthly_totals.values())

    @staticmethod
    def _category_amount_history(
        expense_txns: list[Transaction],
    ) -> dict[str, list[tuple[datetime, float]]]:
        history: dict[str, list[tuple[datetime, float]]] = {}
        for transaction in expense_txns:
            history.setdefault(transaction.category, []).append(
                (transaction.date, float(transaction.amount))
            )
        return history

    def _passes_log_dispersion_gate(self, amount: float, window: list[float]) -> bool:
        log_window = [log(value) for value in window if value > 0]
        if not log_window:
            return True
        log_median = median(log_window)
        log_mad = self._mad(log_window, log_median)
        if log_mad <= 0:
            return True
        log_modified_z = _MZ_CONSTANT * (log(amount) - log_median) / log_mad
        return log_modified_z > _DEFAULT_MODIFIED_Z_CUTOFF

    def _detect_large_transactions(self, anomalies: list[dict[str, Any]]) -> None:
        """Append anomaly dicts for individual expenses that look large versus
        their category's rolling-12-month baseline.

        Rolling window + median means a legitimate big purchase from 2 years
        ago no longer poisons the baseline, and the txn under test is compared
        against a leave-one-out median (excluding itself).
        """
        sym = self._currency_symbol

        # Same exclusion as the monthly detector. A realised loss is typically
        # the largest single "expense" row a ledger carries, so leaving it in
        # produced a high-severity "unusually large transaction" alert for a bad
        # trade the user already knows about, AND inflated its category's
        # rolling median so subsequent genuine outliers in that category slipped
        # under the 3x ratio gate.
        expense_txns = (
            self._exclude_capital_losses(
                self._user_transaction_query().filter(Transaction.type == TransactionType.EXPENSE)
            )
            .order_by(Transaction.date.asc())
            .all()
        )

        # Materiality floor: a 3x-of-median blip in a tiny category (a pricier
        # chai) is not worth a user's attention. Derived per user from their
        # own median monthly expense -- no hardcoded currency constants.
        materiality_floor = self._large_transaction_materiality_floor(expense_txns)

        # Group amounts by category, retaining chronological order so the
        # rolling window can prune old entries with an O(1) index cursor.
        # amount_history[cat] = list of (date, amount) sorted ascending.
        history = self._category_amount_history(expense_txns)

        for txn in expense_txns:
            amount = float(txn.amount)
            if amount < materiality_floor:
                continue

            cat_history = history.get(txn.category, [])
            # Rolling window: keep amounts strictly older than the txn under
            # test AND within the last 12 months. Leave-one-out prevents the
            # txn from being compared against a baseline it moved.
            cutoff_start = txn.date - _LARGE_TXN_WINDOW
            window = [amt for (date, amt) in cat_history if cutoff_start <= date < txn.date]
            if len(window) < _LARGE_TXN_MIN_HISTORY:
                continue  # warmup: not enough history for a meaningful baseline

            baseline = median(window)
            if baseline <= 0:
                continue

            ratio = amount / baseline
            if ratio < _LARGE_TXN_FLAG_RATIO:
                continue

            # Dispersion gate in log space: spend distributions are right-
            # skewed, so "3x the median" is trivially reachable in high-
            # variance categories (shopping ranges 100..15,000 routinely).
            # Require the txn to be a genuine outlier of ITS OWN category's
            # log-amount distribution. When log-MAD collapses (near-constant
            # window), keep the ratio-based flag -- mirroring the module's
            # MAD-collapse fallback convention.
            if not self._passes_log_dispersion_gate(amount, window):
                continue

            severity = "high" if ratio >= _LARGE_TXN_HIGH_RATIO else "medium"
            anomalies.append(
                {
                    "type": AnomalyType.HIGH_EXPENSE,
                    "severity": severity,
                    "description": (
                        f"Large {txn.category} expense: "
                        f"{sym}{float(txn.amount):,.0f} vs rolling median {sym}{baseline:,.0f}"
                    ),
                    "transaction_id": txn.transaction_id,
                    "expected_value": Decimal(str(baseline)),
                    "actual_value": Decimal(str(txn.amount)),
                    "deviation_pct": ((float(txn.amount) - baseline) / baseline) * 100,
                },
            )
