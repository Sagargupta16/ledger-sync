"""Monthly and daily summary aggregation mixin."""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import delete

from ledger_sync.core._analytics_helpers import mom_change_pct as _mom_change_pct
from ledger_sync.core.analytics.base import AnalyticsEngineBase
from ledger_sync.db.models import (
    DailySummary,
    MonthlySummary,
    Transaction,
    TransactionType,
)


class SummariesMixin(AnalyticsEngineBase):
    """Mixin: monthly and daily aggregation persistence."""

    def _calculate_monthly_summaries(
        self,
        transactions: list[Transaction] | None = None,
    ) -> int:
        """Calculate and persist monthly summary aggregations."""
        if transactions is None:
            transactions = self._user_transaction_query().all()

        # Group by month
        monthly_data: dict[str, dict[str, Any]] = defaultdict(
            lambda: {
                "total_income": Decimal(0),
                "salary_income": Decimal(0),
                "investment_income": Decimal(0),
                "other_income": Decimal(0),
                "total_expenses": Decimal(0),
                "essential_expenses": Decimal(0),
                "discretionary_expenses": Decimal(0),
                "total_transfers_out": Decimal(0),
                "total_transfers_in": Decimal(0),
                "net_investment_flow": Decimal(0),
                "income_count": 0,
                "expense_count": 0,
                "transfer_count": 0,
            },
        )

        for txn in transactions:
            period_key = txn.date.strftime("%Y-%m")
            amount = Decimal(str(txn.amount))
            self._categorize_transaction_for_summary(txn, monthly_data[period_key], amount)
            monthly_data[period_key]["year"] = txn.date.year
            monthly_data[period_key]["month"] = txn.date.month

        # Upsert: merge existing rows instead of delete-then-reinsert.
        # This is atomic -- no window where data is missing.
        count = 0
        sorted_periods = sorted(monthly_data.keys())
        prev_income = None
        prev_expenses = None

        for period_key in sorted_periods:
            data = monthly_data[period_key]
            total_income = data["total_income"]
            total_expenses = data["total_expenses"]
            net_savings = total_income - total_expenses
            savings_rate = float(net_savings / total_income * 100) if total_income > 0 else 0
            expense_ratio = float(total_expenses / total_income * 100) if total_income > 0 else 0

            income_change_pct = _mom_change_pct(total_income, prev_income)
            expense_change_pct = _mom_change_pct(total_expenses, prev_expenses)

            now = datetime.now(UTC)
            total_txns = data["income_count"] + data["expense_count"] + data["transfer_count"]

            self._upsert_monthly_summary(
                period_key,
                data,
                total_income,
                total_expenses,
                net_savings,
                savings_rate,
                expense_ratio,
                income_change_pct,
                expense_change_pct,
                total_txns,
                now,
            )
            count += 1

            prev_income = total_income
            prev_expenses = total_expenses

        # Remove stale periods that no longer have transactions
        if self.user_id is not None:
            stale = self.db.query(MonthlySummary).filter(
                MonthlySummary.user_id == self.user_id,
                MonthlySummary.period_key.notin_(sorted_periods),
            )
            stale.delete(synchronize_session=False)

        return count

    def _upsert_monthly_summary(
        self,
        period_key: str,
        data: dict[str, Any],
        total_income: Decimal,
        total_expenses: Decimal,
        net_savings: Decimal,
        savings_rate: float,
        expense_ratio: float,
        income_change_pct: float,
        expense_change_pct: float,
        total_txns: int,
        now: datetime,
    ) -> None:
        """Merge (insert or update) a single MonthlySummary row."""
        existing = (
            self.db.query(MonthlySummary)
            .filter(
                MonthlySummary.user_id == self.user_id,
                MonthlySummary.period_key == period_key,
            )
            .first()
        )

        if existing:
            existing.total_income = total_income
            existing.salary_income = data["salary_income"]
            existing.investment_income = data["investment_income"]
            existing.other_income = data["other_income"]
            existing.total_expenses = total_expenses
            existing.essential_expenses = data["essential_expenses"]
            existing.discretionary_expenses = data["discretionary_expenses"]
            existing.total_transfers_out = data["total_transfers_out"]
            existing.total_transfers_in = data["total_transfers_in"]
            existing.net_investment_flow = data["net_investment_flow"]
            existing.net_savings = net_savings
            existing.savings_rate = savings_rate
            existing.expense_ratio = expense_ratio
            existing.income_count = data["income_count"]
            existing.expense_count = data["expense_count"]
            existing.transfer_count = data["transfer_count"]
            existing.total_transactions = total_txns
            existing.income_change_pct = income_change_pct
            existing.expense_change_pct = expense_change_pct
            existing.last_calculated = now
        else:
            self.db.add(
                MonthlySummary(
                    user_id=self.user_id,
                    year=data["year"],
                    month=data["month"],
                    period_key=period_key,
                    total_income=total_income,
                    salary_income=data["salary_income"],
                    investment_income=data["investment_income"],
                    other_income=data["other_income"],
                    total_expenses=total_expenses,
                    essential_expenses=data["essential_expenses"],
                    discretionary_expenses=data["discretionary_expenses"],
                    total_transfers_out=data["total_transfers_out"],
                    total_transfers_in=data["total_transfers_in"],
                    net_investment_flow=data["net_investment_flow"],
                    net_savings=net_savings,
                    savings_rate=savings_rate,
                    expense_ratio=expense_ratio,
                    income_count=data["income_count"],
                    expense_count=data["expense_count"],
                    transfer_count=data["transfer_count"],
                    total_transactions=total_txns,
                    income_change_pct=income_change_pct,
                    expense_change_pct=expense_change_pct,
                    last_calculated=now,
                ),
            )

    def _categorize_transaction_for_summary(
        self,
        txn: Transaction,
        data: dict[str, Any],
        amount: Decimal,
    ) -> None:
        """Mutate *data* in place with classification/aggregation for *txn*.

        Uses the classification predicates (``_is_salary_income``,
        ``_is_investment_income``, ``_is_investment_account``) from the
        ClassificationMixin, which will be present at runtime via MRO.
        """
        if txn.type == TransactionType.INCOME:
            data["total_income"] += amount
            data["income_count"] += 1
            if self._is_salary_income(txn):  # type: ignore[attr-defined]
                data["salary_income"] += amount
            elif self._is_investment_income(txn):  # type: ignore[attr-defined]
                data["investment_income"] += amount
            else:
                data["other_income"] += amount

        elif txn.type == TransactionType.EXPENSE:
            data["total_expenses"] += amount
            data["expense_count"] += 1
            if txn.category in self.essential_categories:
                data["essential_expenses"] += amount
            else:
                data["discretionary_expenses"] += amount

        elif txn.type == TransactionType.TRANSFER:
            data["transfer_count"] += 1
            data["total_transfers_out"] += amount
            data["total_transfers_in"] += amount
            if self._is_investment_account(txn.to_account):  # type: ignore[attr-defined]
                data["net_investment_flow"] -= amount
            elif self._is_investment_account(txn.from_account):  # type: ignore[attr-defined]
                data["net_investment_flow"] += amount

    def _calculate_daily_summaries(
        self,
        transactions: list[Transaction] | None = None,
    ) -> int:
        """Calculate and persist daily summary aggregations.

        Groups all transactions by date and stores daily income/expense/net
        totals. Used by the YearInReview heatmap and daily trend charts.
        """
        if transactions is None:
            transactions = self._user_transaction_query().all()

        # Group by date (YYYY-MM-DD)
        daily_data: dict[str, dict[str, Any]] = defaultdict(
            lambda: {
                "total_income": Decimal(0),
                "total_expenses": Decimal(0),
                "income_count": 0,
                "expense_count": 0,
                "transfer_count": 0,
                "expense_categories": defaultdict(Decimal),
            },
        )

        for txn in transactions:
            date_key = txn.date.strftime("%Y-%m-%d")
            amount = Decimal(str(txn.amount))
            day = daily_data[date_key]

            if txn.type == TransactionType.INCOME:
                day["total_income"] += amount
                day["income_count"] += 1
            elif txn.type == TransactionType.EXPENSE:
                day["total_expenses"] += amount
                day["expense_count"] += 1
                day["expense_categories"][txn.category] += amount
            elif txn.type == TransactionType.TRANSFER:
                day["transfer_count"] += 1

        # Delete existing for this user and bulk insert
        del_stmt = delete(DailySummary)
        if self.user_id is not None:
            del_stmt = del_stmt.where(DailySummary.user_id == self.user_id)
        self.db.execute(del_stmt)

        now = datetime.now(UTC)
        count = 0
        for date_key in sorted(daily_data.keys()):
            data = daily_data[date_key]
            total_income = data["total_income"]
            total_expenses = data["total_expenses"]
            total_txns = data["income_count"] + data["expense_count"] + data["transfer_count"]

            # Find top expense category for the day
            top_category = None
            if data["expense_categories"]:
                top_category = max(
                    data["expense_categories"],
                    key=data["expense_categories"].get,
                )

            self.db.add(
                DailySummary(
                    user_id=self.user_id,
                    date=date_key,
                    total_income=total_income,
                    total_expenses=total_expenses,
                    net=total_income - total_expenses,
                    income_count=data["income_count"],
                    expense_count=data["expense_count"],
                    transfer_count=data["transfer_count"],
                    total_transactions=total_txns,
                    top_category=top_category,
                    last_calculated=now,
                ),
            )
            count += 1

        return count
