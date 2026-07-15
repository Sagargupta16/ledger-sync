"""Anomaly detection + budget tracking mixin.

## Detection algorithms

Uses robust statistics (median + MAD, with IQR fence fallback) instead of
mean + stdev, so a single outlier month doesn't self-mask by inflating both
the mean and the standard deviation. The historical mean+stdev approach
missed genuine anomalies exactly when they mattered most: one 3x-of-normal
month raised the sample mean by ~25% and stdev by ~50%, silently pushing
its own modified-Z score below the flagging cutoff.

- **High-expense-month detection**: Iglewicz-Hoaglin modified Z-score
  ``|0.6745 * (x - median) / MAD|`` with configurable cutoff (default 3.5,
  the NIST-recommended outlier boundary), computed against a ROLLING
  trailing-12-month baseline (excluding the month under test). An all-time
  baseline on a non-stationary spend series (income growth, lifestyle
  drift) made every recent month look anomalous versus years-old medians.
  When the window's MAD collapses to zero (identical months), fall back to
  Tukey's upper IQR fence (Q3 + 1.5 * IQR) over the same window.

- **Large-transaction detection**: 12-month rolling per-category median,
  gated by (a) a per-user materiality floor (fraction of median monthly
  expense) and (b) a log-space modified-Z outlier test against the
  category's own amount distribution. The bare ratio>=3 rule flagged
  14.4% of all expenses on real data because right-skewed spend
  categories make "3x the median" trivially reachable; the gates cut
  that to ~2% while keeping genuine outliers.

## Threshold preservation across the algorithm swap

The existing user preference ``anomaly_expense_threshold`` stored a stdev
multiplier (default 2.0). To avoid a semantic-drift incident on deploy
(where every user's stored threshold would suddenly mean something
completely different), the new code maps the stdev-multiplier space onto
the modified-Z cutoff space:

    effective_z_cutoff = 3.5 * (stored_threshold / 2.0)

So the default 2.0 gives the recommended 3.5 modified-Z cutoff; a user
who tuned to 2.5 (stricter) gets 4.375; a user who tuned to 1.5 (looser)
gets 2.625. Same knob, better math underneath, no migration required.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from math import log
from statistics import median, quantiles
from typing import Any

from sqlalchemy import delete, func

from ledger_sync.core.analytics.base import AnalyticsEngineBase
from ledger_sync.core.query_helpers import apply_excluded_accounts_filter, fmt_year_month
from ledger_sync.db.models import (
    Anomaly,
    AnomalyType,
    Budget,
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


class AnomaliesMixin(AnalyticsEngineBase):
    """Mixin: anomaly detection + monthly budget tracking."""

    def _detect_anomalies(self) -> int:
        """Detect anomalies in the data using configurable thresholds."""
        anomalies_detected: list[dict[str, Any]] = []

        # Map the legacy stdev-multiplier preference to the modified-Z cutoff.
        # See module docstring for the anchor rationale.
        stored = self.anomaly_expense_threshold
        z_cutoff = _DEFAULT_MODIFIED_Z_CUTOFF * (stored / _LEGACY_ANCHOR_STDEV)

        self._detect_high_expense_months(anomalies_detected, z_cutoff)
        self._detect_large_transactions(anomalies_detected)

        # Suppress findings the user already reviewed/dismissed BEFORE the cap,
        # so a dismissed anomaly neither resurrects as a fresh unreviewed row
        # nor consumes cap slots. The `if r.period_key` / `if r.transaction_id`
        # guards are load-bearing: both detectors emit HIGH_EXPENSE, so without
        # them one reviewed txn anomaly (period_key=None) would suppress every
        # month anomaly via (HIGH_EXPENSE, None) and vice versa.
        reviewed_rows = (
            self.db.query(Anomaly.anomaly_type, Anomaly.period_key, Anomaly.transaction_id)
            .filter(Anomaly.user_id == self.user_id, Anomaly.is_reviewed.is_(True))
            .all()
        )
        reviewed_periods = {(r.anomaly_type, r.period_key) for r in reviewed_rows if r.period_key}
        reviewed_txn_ids = {r.transaction_id for r in reviewed_rows if r.transaction_id}
        anomalies_detected = [
            a
            for a in anomalies_detected
            if (a["type"], a.get("period_key")) not in reviewed_periods
            and a.get("transaction_id") not in reviewed_txn_ids
        ]

        # Delete old unreviewed anomalies for this user and insert new. Reviewed
        # anomalies are preserved so users don't have to re-dismiss the same
        # finding on every refresh.
        del_stmt = delete(Anomaly).where(Anomaly.is_reviewed.is_(False))
        if self.user_id is not None:
            del_stmt = del_stmt.where(Anomaly.user_id == self.user_id)
        self.db.execute(del_stmt)

        # Cap per shape, not across shapes: month rows (period_key) and single-
        # transaction rows (transaction_id) have different natural deviation_pct
        # scales, so a global sort let hundreds of 300%-deviation txn flags
        # evict nearly every month anomaly. Reserve up to 25 slots for months,
        # give the remainder to transactions.
        month_rows = [a for a in anomalies_detected if a.get("period_key")]
        txn_rows = [a for a in anomalies_detected if not a.get("period_key")]
        month_rows.sort(key=lambda a: a.get("deviation_pct") or 0, reverse=True)
        txn_rows.sort(key=lambda a: a.get("deviation_pct") or 0, reverse=True)
        kept_months = month_rows[:25]
        keep = kept_months + txn_rows[: 50 - len(kept_months)]

        for anomaly_data in keep:
            anomaly = Anomaly(
                user_id=self.user_id,
                anomaly_type=anomaly_data["type"],
                severity=anomaly_data["severity"],
                description=anomaly_data["description"],
                transaction_id=anomaly_data.get("transaction_id"),
                period_key=anomaly_data.get("period_key"),
                expected_value=anomaly_data.get("expected_value"),
                actual_value=anomaly_data.get("actual_value"),
                deviation_pct=anomaly_data.get("deviation_pct"),
                detected_at=datetime.now(UTC),
            )
            self.db.add(anomaly)

        return len(anomalies_detected)

    # ─── robust baseline helpers ───────────────────────────────────────────

    @staticmethod
    def _mad(values: list[float], baseline: float) -> float:
        """Median Absolute Deviation from a given baseline (usually the median)."""
        return median(abs(v - baseline) for v in values)

    @staticmethod
    def _tukey_upper_fence(values: list[float], k: float = 1.5) -> float | None:
        """Q3 + k * IQR. Returns None if there are too few values for Q1/Q3."""
        if len(values) < 4:  # noqa: PLR2004 -- quantile needs >=4 samples
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
        monthly_query = apply_excluded_accounts_filter(monthly_query, self.excluded_accounts)
        monthly_expenses = sorted(monthly_query.group_by(period_col).all(), key=lambda m: m.period)

        if len(monthly_expenses) <= 3:  # noqa: PLR2004 -- documented warmup
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
            return "high" if total > med * 2.5 else "medium"  # noqa: PLR2004
        m_z = _MZ_CONSTANT * (total - med) / mad
        if m_z <= z_cutoff:
            return None
        # Grade by how far past the cutoff we are, not raw deviation.
        return "high" if m_z >= z_cutoff * 1.5 else "medium"  # noqa: PLR2004

    # ─── large-transaction detector (rolling window) ───────────────────────

    def _detect_large_transactions(self, anomalies: list[dict[str, Any]]) -> None:
        """Append anomaly dicts for individual expenses that look large versus
        their category's rolling-12-month baseline.

        Rolling window + median means a legitimate big purchase from 2 years
        ago no longer poisons the baseline, and the txn under test is compared
        against a leave-one-out median (excluding itself).
        """
        sym = self._currency_symbol

        expense_txns = (
            self._user_transaction_query()
            .filter(Transaction.type == TransactionType.EXPENSE)
            .order_by(Transaction.date.asc())
            .all()
        )

        # Materiality floor: a 3x-of-median blip in a tiny category (a pricier
        # chai) is not worth a user's attention. Derived per user from their
        # own median monthly expense -- no hardcoded currency constants.
        monthly_totals: dict[str, float] = {}
        for t in expense_txns:
            key = t.date.strftime("%Y-%m")
            monthly_totals[key] = monthly_totals.get(key, 0.0) + float(t.amount)
        materiality_floor = (
            _LARGE_TXN_MATERIALITY_FRACTION * median(monthly_totals.values())
            if monthly_totals
            else 0.0
        )

        # Group amounts by category, retaining chronological order so the
        # rolling window can prune old entries with an O(1) index cursor.
        # amount_history[cat] = list of (date, amount) sorted ascending.
        history: dict[str, list[tuple[datetime, float]]] = {}
        for t in expense_txns:
            history.setdefault(t.category, []).append((t.date, float(t.amount)))

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
            log_window = [log(a) for a in window if a > 0]
            if log_window:
                log_med = median(log_window)
                log_mad = self._mad(log_window, log_med)
                if log_mad > 0:
                    log_mz = _MZ_CONSTANT * (log(amount) - log_med) / log_mad
                    if log_mz <= _DEFAULT_MODIFIED_Z_CUTOFF:
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

    # ─── budget tracking (unchanged behavior; kept in this mixin) ─────────

    def _update_budget_tracking(self) -> int:
        """Update budget tracking with current month's spending."""
        sym = self._currency_symbol
        user_id = self._require_user_id()
        budget_query = (
            self.db.query(Budget)
            .filter(Budget.user_id == user_id)
            .filter(Budget.is_active.is_(True))
        )
        budgets = budget_query.all()

        if not budgets:
            return 0

        # Get current month's spending by category
        now = datetime.now(UTC)
        current_period = now.strftime("%Y-%m")

        spending_query = (
            self.db.query(Transaction.category, func.sum(Transaction.amount).label("total"))
            .filter(Transaction.user_id == user_id)
            .filter(Transaction.is_deleted.is_(False))
            .filter(Transaction.type == TransactionType.EXPENSE)
            .filter(fmt_year_month(Transaction.date) == current_period)
        )
        spending_query = apply_excluded_accounts_filter(spending_query, self.excluded_accounts)
        current_spending = spending_query.group_by(Transaction.category).all()
        spending_map = {c.category: float(c.total) for c in current_spending}

        # Don't resurrect a budget-exceeded anomaly the user already reviewed
        # for this period (same suppression rule as _detect_anomalies).
        reviewed_budget_periods = {
            r.period_key
            for r in self.db.query(Anomaly.period_key)
            .filter(
                Anomaly.user_id == user_id,
                Anomaly.is_reviewed.is_(True),
                Anomaly.anomaly_type == AnomalyType.BUDGET_EXCEEDED,
            )
            .all()
            if r.period_key
        }

        count = 0
        for budget in budgets:
            spent = Decimal(str(spending_map.get(budget.category, 0)))
            budget.current_month_spent = spent
            budget.current_month_remaining = budget.monthly_limit - spent
            budget.current_month_pct = (
                float(spent / budget.monthly_limit * 100) if budget.monthly_limit > 0 else 0
            )
            budget.updated_at = now

            # Check for budget exceeded anomaly
            if budget.current_month_pct > 100 and current_period not in reviewed_budget_periods:  # noqa: PLR2004
                anomaly = Anomaly(
                    user_id=self.user_id,
                    anomaly_type=AnomalyType.BUDGET_EXCEEDED,
                    severity="high",
                    description=(
                        f"Budget exceeded for {budget.category}: "
                        f"{sym}{float(spent):,.0f} / {sym}{float(budget.monthly_limit):,.0f}"
                    ),
                    period_key=current_period,
                    expected_value=budget.monthly_limit,
                    actual_value=spent,
                    deviation_pct=budget.current_month_pct - 100,
                    detected_at=now,
                )
                self.db.add(anomaly)

            count += 1

        return count
