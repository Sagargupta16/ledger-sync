"""Fiscal-year summary aggregation mixin."""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import delete

from ledger_sync.core.analytics.base import AnalyticsEngineBase
from ledger_sync.db.models import FYSummary, Transaction, TransactionType


class FYSummariesMixin(AnalyticsEngineBase):
    """Mixin: per-fiscal-year rollups with YoY changes."""

    def _calculate_fy_summaries(
        self,
        transactions: list[Transaction] | None = None,
    ) -> int:
        """Calculate and persist fiscal-year summaries."""
        if transactions is None:
            transactions = self._user_transaction_query().all()

        # Group by fiscal year
        fy_data: dict[str, dict[str, Any]] = defaultdict(
            lambda: {
                "total_income": Decimal(0),
                "salary_income": Decimal(0),
                "bonus_income": Decimal(0),
                "investment_income": Decimal(0),
                "other_income": Decimal(0),
                "total_expenses": Decimal(0),
                "tax_paid": Decimal(0),
                "investments_made": Decimal(0),
                "start_date": None,
                "end_date": None,
            },
        )

        for txn in transactions:
            fy, fy_start, fy_end = self._get_fiscal_year(txn.date)
            if fy_data[fy]["start_date"] is None:
                fy_data[fy]["start_date"] = fy_start
                fy_data[fy]["end_date"] = fy_end
            amount = Decimal(str(txn.amount))
            self._categorize_transaction_for_fy(txn, fy_data[fy], amount)

        # Delete existing for this user and insert new
        del_stmt = delete(FYSummary)
        if self.user_id is not None:
            del_stmt = del_stmt.where(FYSummary.user_id == self.user_id)
        self.db.execute(del_stmt)

        count = 0
        prev_income = None
        prev_expenses = None
        prev_savings = None
        now = datetime.now(UTC)

        for fy in sorted(fy_data.keys()):
            data = fy_data[fy]
            total_income = data["total_income"]
            total_expenses = data["total_expenses"]
            net_savings = total_income - total_expenses
            savings_rate = float(net_savings / total_income * 100) if total_income > 0 else 0

            yoy_income, yoy_expense, yoy_savings = self._calculate_yoy_changes(
                total_income,
                total_expenses,
                net_savings,
                prev_income,
                prev_expenses,
                prev_savings,
            )

            summary = self._build_fy_summary_record(
                fy,
                data,
                total_income,
                total_expenses,
                net_savings,
                savings_rate,
                yoy_income,
                yoy_expense,
                yoy_savings,
                now,
            )
            self.db.add(summary)
            count += 1

            prev_income = total_income
            prev_expenses = total_expenses
            prev_savings = net_savings

        return count

    def _calculate_yoy_changes(
        self,
        total_income: Decimal,
        total_expenses: Decimal,
        net_savings: Decimal,
        prev_income: Decimal | None,
        prev_expenses: Decimal | None,
        prev_savings: Decimal | None,
    ) -> tuple[float, float, float]:
        """Return ``(yoy_income_pct, yoy_expense_pct, yoy_savings_pct)``."""
        yoy_income = 0.0
        yoy_expense = 0.0
        yoy_savings = 0.0
        if prev_income and prev_income > 0:
            yoy_income = float((total_income - prev_income) / prev_income * 100)
        if prev_expenses and prev_expenses > 0:
            yoy_expense = float((total_expenses - prev_expenses) / prev_expenses * 100)
        if prev_savings and prev_savings != 0:
            yoy_savings = float((net_savings - prev_savings) / abs(prev_savings) * 100)
        return yoy_income, yoy_expense, yoy_savings

    def _build_fy_summary_record(
        self,
        fy: str,
        data: dict[str, Any],
        total_income: Decimal,
        total_expenses: Decimal,
        net_savings: Decimal,
        savings_rate: float,
        yoy_income: float,
        yoy_expense: float,
        yoy_savings: float,
        now: datetime,
    ) -> FYSummary:
        """Build an FYSummary ORM record from calculated data."""
        is_complete = bool(data["end_date"] and data["end_date"] < now)

        return FYSummary(
            user_id=self.user_id,
            fiscal_year=fy,
            start_date=data["start_date"],
            end_date=data["end_date"],
            total_income=total_income,
            salary_income=data["salary_income"],
            bonus_income=data["bonus_income"],
            investment_income=data["investment_income"],
            other_income=data["other_income"],
            total_expenses=total_expenses,
            tax_paid=data["tax_paid"],
            investments_made=data["investments_made"],
            net_savings=net_savings,
            savings_rate=savings_rate,
            yoy_income_change=yoy_income,
            yoy_expense_change=yoy_expense,
            yoy_savings_change=yoy_savings,
            last_calculated=now,
            is_complete=is_complete,
        )

    def _categorize_transaction_for_fy(
        self,
        txn: Transaction,
        data: dict[str, Any],
        amount: Decimal,
    ) -> None:
        """Mutate *data* with the FY-level classification for *txn*."""
        if txn.type == TransactionType.INCOME:
            data["total_income"] += amount
            if self._is_salary_income(txn):  # type: ignore[attr-defined]
                data["salary_income"] += amount
            elif self._is_bonus_income(txn):  # type: ignore[attr-defined]
                data["bonus_income"] += amount
            elif self._is_investment_income(txn):  # type: ignore[attr-defined]
                data["investment_income"] += amount
            else:
                data["other_income"] += amount

        elif txn.type == TransactionType.EXPENSE:
            data["total_expenses"] += amount
            if "tax" in (txn.note or "").lower() or txn.category == "Taxes":
                data["tax_paid"] += amount

        elif txn.type == TransactionType.TRANSFER:
            if self._is_investment_account(txn.to_account):  # type: ignore[attr-defined]
                data["investments_made"] += amount
