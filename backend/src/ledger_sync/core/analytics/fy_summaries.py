"""Fiscal-year summary aggregation mixin."""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import delete

from ledger_sync.core.analytics.base import AnalyticsEngineBase
from ledger_sync.core.ledger_clock import ledger_now
from ledger_sync.core.ledger_math import investment_transfer_delta
from ledger_sync.core.metric_rules import is_tax_paid
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
                "capital_losses": Decimal(0),
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
            # Mirrors the monthly rollup: net_savings nets the realised loss off
            # (the cash left, so FY-end wealth is lower) and savings_rate stays
            # net_savings / income, so the published rate still equals the
            # published net on the same row. See ``summaries.py`` for why the
            # rate must NOT be quietly redefined to a consumption ratio under an
            # unchanged column name.
            net_savings = total_income - total_expenses - data["capital_losses"]
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
        # ``end_date`` is midnight on the FY's last day. The FY is complete once
        # the next FY has started on the IST calendar, not at 05:30 IST on its
        # last day (when that UTC midnight passes).
        end_date = data["end_date"]
        is_complete = bool(
            end_date and end_date.replace(tzinfo=None) + timedelta(days=1) <= ledger_now()
        )

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
            capital_losses=data["capital_losses"],
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
            self._accumulate_fy_income(txn, data, amount)

        elif txn.type == TransactionType.EXPENSE:
            self._accumulate_fy_expense(txn, data, amount)

        elif txn.type == TransactionType.TRANSFER:
            contribution = investment_transfer_delta(
                amount,
                source_is_investment=self._is_investment_account(txn.from_account),  # type: ignore[attr-defined]
                destination_is_investment=self._is_investment_account(txn.to_account),  # type: ignore[attr-defined]
            )
            # Gross external funding. Internal rebalancing is not a new purchase;
            # withdrawals are represented in the monthly net investment flow.
            data["investments_made"] += max(contribution, Decimal(0))

    def _accumulate_fy_income(
        self,
        txn: Transaction,
        data: dict[str, Any],
        amount: Decimal,
    ) -> None:
        """Add an INCOME row to the FY total and to exactly one income bucket.

        The buckets are checked in this order because they are not disjoint: a
        taxable row whose subcategory reads like both salary and a bonus must
        land in salary, and ``other_income`` is the residual that keeps
        salary + bonus + investment + other == total_income.
        """
        data["total_income"] += amount
        if self._is_salary_income(txn):  # type: ignore[attr-defined]
            data["salary_income"] += amount
        elif self._is_bonus_income(txn):  # type: ignore[attr-defined]
            data["bonus_income"] += amount
        elif self._is_investment_income(txn):  # type: ignore[attr-defined]
            data["investment_income"] += amount
        else:
            data["other_income"] += amount

    def _accumulate_fy_expense(
        self,
        txn: Transaction,
        data: dict[str, Any],
        amount: Decimal,
    ) -> None:
        """Add an EXPENSE row to FY expenses, or to the realised-loss bucket."""
        # Same exclusion as the monthly rollup: a classified realised loss
        # is a negative investment return, not consumption, so it must not
        # inflate FY expenses or the FY savings rate. Its own bucket keeps
        # the loss visible and auditable, and a loss is never tax paid.
        if self._is_capital_loss(txn):  # type: ignore[attr-defined]
            data["capital_losses"] += amount
            return

        data["total_expenses"] += amount
        # Tax categories only (``core.metric_rules.is_tax_paid``). The note is
        # not read: a purchase note "incl GST" or a broker note "STCG advance
        # tax adjustment" is not income tax the user paid, and crediting it
        # overstated tax paid on the Tax Planning page.
        if is_tax_paid(txn.category, txn.subcategory):
            data["tax_paid"] += amount
