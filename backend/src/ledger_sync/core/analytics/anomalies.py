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
from typing import Any

from sqlalchemy import delete, func

# The detectors and their tuning constants live in ``anomaly_detectors``.
from ledger_sync.core.analytics.anomaly_detectors import (
    _DEFAULT_MODIFIED_Z_CUTOFF,
    _LEGACY_ANCHOR_STDEV,
    AnomalyDetectorsMixin,
)
from ledger_sync.core.ledger_clock import ledger_now
from ledger_sync.core.query_helpers import apply_excluded_accounts_filter
from ledger_sync.db.models import (
    Anomaly,
    AnomalyType,
    Budget,
    Transaction,
    TransactionType,
)
from ledger_sync.services.account_settings import get_closed_account_dates

# BUDGET_EXCEEDED descriptions read "Budget exceeded for <category>: <spent> /
# <limit>". The amounts never contain ": ", so the category is everything
# between the prefix and the last ": ".
_BUDGET_EXCEEDED_PREFIX = "Budget exceeded for "


def _budget_category_from_description(description: str) -> str | None:
    """Recover the budget category a BUDGET_EXCEEDED description was written for."""
    if not description.startswith(_BUDGET_EXCEEDED_PREFIX):
        return None
    category, separator, _amounts = description.removeprefix(_BUDGET_EXCEEDED_PREFIX).rpartition(
        ": "
    )
    return category if separator else None


class AnomaliesMixin(AnomalyDetectorsMixin):
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
        self._detect_closed_account_activity(anomalies_detected)

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

    def _detect_closed_account_activity(self, anomalies: list[dict[str, Any]]) -> None:
        """Flag transactions landing on a closed account after its close date.

        Statements routinely trail closures in India by a cycle or two
        (refunds, final interest, reversal entries), so new activity is
        imported normally -- this just surfaces it for review instead of
        silently absorbing it. Only rows dated AFTER the recorded close
        date count; the account's own history never triggers it.
        """
        close_dates = get_closed_account_dates(self.db, self._require_user_id())
        if not close_dates:
            return

        sym = self._currency_symbol
        # One candidate query for all closed accounts avoids a query per account.
        # Python lower matches the dimension keys even for Unicode source labels.
        late_txns = (
            self._user_transaction_query()
            .filter(Transaction.date > min(close_dates.values()))
            .order_by(Transaction.date.desc())
        )
        counts: dict[str, int] = {}
        for txn in late_txns:
            key = (txn.account or "").lower()
            closed_at = close_dates.get(key)
            if (
                closed_at is None
                or txn.date.replace(tzinfo=None) <= closed_at.replace(tzinfo=None)
                or counts.get(key, 0) >= 5
            ):
                continue
            counts[key] = counts.get(key, 0) + 1
            anomalies.append(
                {
                    "type": AnomalyType.CLOSED_ACCOUNT_ACTIVITY,
                    "severity": "medium",
                    "description": (
                        f"Activity on closed account {txn.account}: "
                        f"{sym}{float(txn.amount):,.0f} ({txn.category}) "
                        f"on {txn.date.strftime('%d %b %Y')}"
                    ),
                    "transaction_id": txn.transaction_id,
                    "actual_value": Decimal(str(txn.amount)),
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

        # "Current month" is an IST month, because the date column holds naive
        # IST wall-clock values. Deriving the key from ``datetime.now(UTC)`` was
        # wrong for the first 5.5 hours of every month: at 01:30 IST on 1 August
        # it is still 31 July in UTC, so budget tracking read July's spend as
        # the current month and could key a BUDGET_EXCEEDED anomaly to the
        # month that had just ended.
        #
        # ``now`` stays UTC: it only feeds the audit columns
        # (``budget.updated_at``, ``detected_at``), whose stored values are
        # naive UTC throughout the schema.
        month_start = ledger_now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        next_month_start = (month_start + timedelta(days=32)).replace(day=1)
        current_period = month_start.strftime("%Y-%m")
        now = datetime.now(UTC)

        # A half-open date range selects exactly the rows whose YYYY-MM equals
        # ``current_period`` and, unlike formatting the column, can use the
        # date index.
        spending_query = (
            self.db.query(Transaction.category, func.sum(Transaction.amount).label("total"))
            .filter(Transaction.user_id == user_id)
            .filter(Transaction.is_deleted.is_(False))
            .filter(Transaction.type == TransactionType.EXPENSE)
            .filter(Transaction.date >= month_start, Transaction.date < next_month_start)
        )
        # A realised loss must not consume a spending budget. Left in, a single
        # loss booked to a budgeted category blows that budget for the month and
        # fires a BUDGET_EXCEEDED anomaly, while ``budget.current_month_spent``
        # and ``current_month_remaining`` -- persisted, and read straight into the
        # budget UI -- report money the user never spent.
        spending_query = self._exclude_capital_losses(spending_query)
        spending_query = apply_excluded_accounts_filter(spending_query, self.excluded_accounts)
        current_spending = spending_query.group_by(Transaction.category).all()
        spending_map = {c.category: float(c.total) for c in current_spending}

        # Don't resurrect a budget-exceeded anomaly the user already reviewed
        # for this period and category. Keyed per category: reviewing one
        # category's overrun must not silence another's. The category is read
        # back from the description, the only column that carries it.
        reviewed_budget_keys = {
            (r.period_key, _budget_category_from_description(r.description))
            for r in self.db.query(Anomaly.period_key, Anomaly.description)
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
            if (
                budget.current_month_pct > 100
                and (current_period, budget.category) not in reviewed_budget_keys
            ):
                anomaly = Anomaly(
                    user_id=self.user_id,
                    anomaly_type=AnomalyType.BUDGET_EXCEEDED,
                    severity="high",
                    description=(
                        f"{_BUDGET_EXCEEDED_PREFIX}{budget.category}: "
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
