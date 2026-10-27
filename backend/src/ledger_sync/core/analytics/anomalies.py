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
The unusual-category detector reads the same cutoff.

## The other detectors

- ``anomaly_baselines``: large transfers (per source account) and unusual
  category months (per category).
- ``anomaly_ledger_checks``: possible duplicates, fee and interest charges,
  activity on closed accounts.
- ``anomaly_recurring``: missing entries of the commitments the user confirmed.
- ``anomaly_recurring_index``: which recurring pattern a row is an entry of,
  for the missing-entry check and ``auto_dismiss_recurring_anomalies``.

## Settings

``anomaly_types_enabled`` picks the detectors (see
``anomaly_rules.enabled_anomaly_types`` for how a list saved before the newer
types existed is read). With ``auto_dismiss_recurring_anomalies`` on, a
large-expense flag on an entry of a recurring pattern, and an unusual category
month explained by a bill on a longer-than-monthly schedule, are stored
already dismissed with an ``Auto-dismissed:`` note, and rebuilt on every
refresh so turning the setting off brings them back.
"""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from ledger_sync.core.analytics.anomaly_baselines import AnomalyBaselinesMixin, CategoryGates

# The robust detectors and their tuning constants live in ``anomaly_detectors``.
from ledger_sync.core.analytics.anomaly_detectors import (
    _DEFAULT_MODIFIED_Z_CUTOFF,
    _LEGACY_ANCHOR_STDEV,
)
from ledger_sync.core.analytics.anomaly_ledger_checks import AnomalyLedgerChecksMixin
from ledger_sync.core.analytics.anomaly_recurring import AnomalyRecurringMixin
from ledger_sync.core.analytics.anomaly_recurring_index import auto_dismiss_matches
from ledger_sync.core.analytics.anomaly_rules import (
    ALL_TYPES,
    FEE_CHARGE,
    SpendScale,
    enabled_anomaly_types,
)
from ledger_sync.core.analytics.anomaly_store import AnomalyStoreMixin
from ledger_sync.core.analytics.budget_tracking import (
    BUDGET_EXCEEDED_PREFIX,
    apply_tracking,
    budget_category_from_description,
    month_bounds,
    month_spend_by_category,
)
from ledger_sync.core.ledger_clock import ledger_now
from ledger_sync.db.models import (
    Anomaly,
    AnomalyType,
    Budget,
    Transaction,
)

#: Every detector but these three reads the whole ledger, loaded once for all.
_LEDGER_TYPES = ALL_TYPES - {
    AnomalyType.HIGH_EXPENSE,
    AnomalyType.BUDGET_EXCEEDED,
    AnomalyType.CLOSED_ACCOUNT_ACTIVITY,
}


class AnomaliesMixin(
    AnomalyBaselinesMixin, AnomalyLedgerChecksMixin, AnomalyRecurringMixin, AnomalyStoreMixin
):
    """Mixin: anomaly detection + monthly budget tracking."""

    @property
    def _enabled_anomaly_types(self) -> frozenset[AnomalyType]:
        prefs = self._preferences
        return enabled_anomaly_types(prefs.anomaly_types_enabled if prefs else None)

    @property
    def _auto_dismiss_recurring(self) -> bool:
        """``auto_dismiss_recurring_anomalies``; on (the column default) with no row."""
        prefs = self._preferences
        return True if prefs is None else bool(prefs.auto_dismiss_recurring_anomalies)

    def _detect_anomalies(self) -> int:
        """Run the enabled detectors and replace this user's open findings.

        Returns how many open (not auto-dismissed) findings survived review
        suppression, before the per-type caps.
        """
        enabled = self._enabled_anomaly_types
        # Map the legacy stdev-multiplier preference to the modified-Z cutoff.
        # See module docstring for the anchor rationale.
        stored = self.anomaly_expense_threshold
        z_cutoff = _DEFAULT_MODIFIED_Z_CUTOFF * (stored / _LEGACY_ANCHOR_STDEV)

        findings: list[dict[str, Any]] = []
        if AnomalyType.HIGH_EXPENSE in enabled:
            self._detect_high_expense_months(findings, z_cutoff)
            self._detect_large_transactions(findings)
        if enabled & _LEDGER_TYPES or (findings and self._auto_dismiss_recurring):
            self._run_ledger_detectors(findings, enabled, z_cutoff)
        if AnomalyType.CLOSED_ACCOUNT_ACTIVITY in enabled:
            self._detect_closed_account_activity(findings)

        return self._replace_findings(findings)

    def _run_ledger_detectors(
        self, findings: list[dict[str, Any]], enabled: frozenset[AnomalyType], z_cutoff: float
    ) -> None:
        """The detectors that share one ascending read of the ledger."""
        ledger = self._user_transaction_query().order_by(Transaction.date.asc()).all()
        recurring = self._recurring_index()
        scale = SpendScale.from_ledger(ledger, self.capital_loss_keys)
        if AnomalyType.UNUSUAL_CATEGORY in enabled:
            singles = frozenset(
                f["transaction_id"]
                for f in findings
                if f["type"] == AnomalyType.HIGH_EXPENSE and f.get("transaction_id")
            )
            gates = CategoryGates(
                z_cutoff, scale, singles, recurring if self._auto_dismiss_recurring else None
            )
            self._detect_unusual_categories(findings, ledger, gates)
        if AnomalyType.LARGE_TRANSFER in enabled:
            self._detect_large_transfers(findings, ledger, scale)
        if AnomalyType.DUPLICATE_SUSPECTED in enabled:
            self._detect_duplicate_rows(findings, ledger, scale)
        if AnomalyType.MISSING_RECURRING in enabled:
            self._detect_missing_recurring(findings, ledger, recurring)
        if FEE_CHARGE in enabled:
            self._detect_fee_charges(findings, ledger)
        if self._auto_dismiss_recurring:
            by_id = {txn.transaction_id: txn for txn in ledger}
            auto_dismiss_matches(findings, by_id, recurring)

    # ─── budget tracking (kept in this mixin) ──────────────────────────────

    def _update_budget_tracking(self) -> int:
        """Store this month's spend on every active budget and alert the ones over.

        Spend is ``budget_tracking.month_spend_by_category``, the definition the
        budget endpoints and push alerts read (classified losses and excluded
        accounts left out). The month is read from ``ledger_now()`` here, an
        IST month because the date column holds naive IST wall-clock values:
        from ``datetime.now(UTC)``, 01:30 IST on 1 August still read July's
        spend. ``now`` stays UTC; it only feeds the naive-UTC audit columns.
        """
        budgets = (
            self.db.query(Budget)
            .filter(Budget.user_id == self.user_id, Budget.is_active.is_(True))
            .all()
        )
        if not budgets:
            return 0
        month_start, _next_month = month_bounds(ledger_now())
        current_period = month_start.strftime("%Y-%m")
        spending = month_spend_by_category(
            self.db,
            self.user_id,
            capital_loss_keys=self.capital_loss_keys,
            excluded_accounts=self.excluded_accounts,
            now=month_start,
        )
        reviewed = self._reviewed_budget_keys()
        # Spend is tracked either way; only the alert follows the type toggle.
        alerts_on = AnomalyType.BUDGET_EXCEEDED in self._enabled_anomaly_types
        sym = self._currency_symbol
        now = datetime.now(UTC)
        for budget in budgets:
            spent = spending.get(budget.category, Decimal(0))
            apply_tracking(budget, spent)
            budget.updated_at = now
            if (
                alerts_on
                and budget.current_month_pct > 100
                and (current_period, budget.category) not in reviewed
            ):
                self.db.add(
                    Anomaly(
                        user_id=self.user_id,
                        anomaly_type=AnomalyType.BUDGET_EXCEEDED,
                        severity="high",
                        description=(
                            f"{BUDGET_EXCEEDED_PREFIX}{budget.category}: "
                            f"{sym}{float(spent):,.0f} / {sym}{float(budget.monthly_limit):,.0f}"
                        ),
                        period_key=current_period,
                        expected_value=budget.monthly_limit,
                        actual_value=spent,
                        deviation_pct=budget.current_month_pct - 100,
                        detected_at=now,
                    )
                )
        return len(budgets)

    def _reviewed_budget_keys(self) -> set[tuple[str, str | None]]:
        """``(month, category)`` of every overrun the user reviewed, so none comes back.

        Per category: reviewing one category's overrun must not silence
        another's. The category is read back from the description, the only
        column that carries it.
        """
        rows = self.db.query(Anomaly.period_key, Anomaly.description).filter(
            Anomaly.user_id == self.user_id,
            Anomaly.is_reviewed.is_(True),
            Anomaly.anomaly_type == AnomalyType.BUDGET_EXCEEDED,
        )
        return {
            (period, budget_category_from_description(description))
            for period, description in rows
            if period
        }
