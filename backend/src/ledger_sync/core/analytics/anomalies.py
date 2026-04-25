"""Anomaly detection + budget tracking mixin."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from statistics import mean, stdev
from typing import Any

from sqlalchemy import delete, func

from ledger_sync.core.analytics.base import AnalyticsEngineBase
from ledger_sync.core.query_helpers import fmt_year_month
from ledger_sync.db.models import (
    Anomaly,
    AnomalyType,
    Budget,
    Transaction,
    TransactionType,
)


class AnomaliesMixin(AnalyticsEngineBase):
    """Mixin: anomaly detection + monthly budget tracking."""

    def _detect_anomalies(self) -> int:
        """Detect anomalies in the data using configurable thresholds."""
        anomalies_detected: list[dict[str, Any]] = []
        threshold_multiplier = self.anomaly_expense_threshold  # From preferences

        # 1. Detect high expense months (>threshold x std dev)
        self._detect_high_expense_months(anomalies_detected, threshold_multiplier)

        # 2. Detect large individual transactions (>3x category average)
        self._detect_large_transactions(anomalies_detected)

        # Delete old unreviewed anomalies for this user and insert new
        del_stmt = delete(Anomaly).where(Anomaly.is_reviewed.is_(False))
        if self.user_id is not None:
            del_stmt = del_stmt.where(Anomaly.user_id == self.user_id)
        self.db.execute(del_stmt)

        for anomaly_data in anomalies_detected[:50]:  # Limit to 50 anomalies
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

    def _detect_high_expense_months(
        self,
        anomalies: list[dict[str, Any]],
        threshold_multiplier: float,
    ) -> None:
        """Append anomaly dicts for months with unusually high total expenses."""
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
        monthly_expenses = monthly_query.group_by(period_col).all()

        if len(monthly_expenses) <= 3:
            return

        expense_values = [float(m.total) for m in monthly_expenses]
        avg_expense = mean(expense_values)
        std_expense = stdev(expense_values) if len(expense_values) > 1 else 0

        # If average is zero (all-zero months), there's no meaningful "unusual" to flag
        if avg_expense <= 0:
            return

        for month in monthly_expenses:
            month_total = float(month.total)
            if month_total > avg_expense + threshold_multiplier * std_expense:
                anomalies.append(
                    {
                        "type": AnomalyType.HIGH_EXPENSE,
                        "severity": "high" if month_total > avg_expense * 2.5 else "medium",
                        "description": (
                            f"Unusually high expenses in {month.period}: "
                            f"{sym}{month_total:,.0f} vs avg {sym}{avg_expense:,.0f}"
                        ),
                        "period_key": month.period,
                        "expected_value": Decimal(str(avg_expense)),
                        "actual_value": Decimal(str(month.total)),
                        "deviation_pct": ((month_total - avg_expense) / avg_expense) * 100,
                    },
                )

    def _detect_large_transactions(self, anomalies: list[dict[str, Any]]) -> None:
        """Append anomaly dicts for transactions >3x their category average."""
        sym = self._currency_symbol
        user_id = self._require_user_id()
        cat_avg_query = (
            self.db.query(Transaction.category, func.avg(Transaction.amount).label("avg_amount"))
            .filter(Transaction.user_id == user_id)
            .filter(Transaction.is_deleted.is_(False))
            .filter(Transaction.type == TransactionType.EXPENSE)
        )
        category_avgs = cat_avg_query.group_by(Transaction.category).all()
        category_avg_map = {c.category: float(c.avg_amount) for c in category_avgs}

        large_txns = (
            self._user_transaction_query().filter(Transaction.type == TransactionType.EXPENSE).all()
        )

        for txn in large_txns:
            cat_avg = category_avg_map.get(txn.category, 0)
            if cat_avg > 0 and float(txn.amount) > cat_avg * 3:
                anomalies.append(
                    {
                        "type": AnomalyType.HIGH_EXPENSE,
                        "severity": "medium",
                        "description": (
                            f"Large {txn.category} expense: "
                            f"{sym}{float(txn.amount):,.0f} vs avg {sym}{cat_avg:,.0f}"
                        ),
                        "transaction_id": txn.transaction_id,
                        "expected_value": Decimal(str(cat_avg)),
                        "actual_value": Decimal(str(txn.amount)),
                        "deviation_pct": ((float(txn.amount) - cat_avg) / cat_avg) * 100,
                    },
                )

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
            .group_by(Transaction.category)
        )
        current_spending = spending_query.all()
        spending_map = {c.category: float(c.total) for c in current_spending}

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
            if budget.current_month_pct > 100:
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
