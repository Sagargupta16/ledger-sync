"""Centralized calculation service for financial metrics and insights.

This module provides all calculation logic in one place for consistency
and maintainability. All calculations are pure functions that take
transaction data and return computed metrics.

Uses Decimal for all financial arithmetic to avoid floating-point precision loss.
"""

import math
from collections import defaultdict
from datetime import timedelta
from decimal import Decimal
from typing import Any

from ledger_sync.db.models import Transaction, TransactionType


def _to_decimal(amount: Any) -> Decimal:
    """Safely convert a transaction amount to Decimal."""
    if isinstance(amount, Decimal):
        return amount
    return Decimal(str(amount))


class FinancialCalculator:
    """Centralized calculator for all financial metrics."""

    @staticmethod
    def calculate_totals(
        transactions: list[Transaction],
    ) -> dict[str, float]:
        """Calculate total income and expenses.

        Args:
            transactions: List of transactions

        Returns:
            Dictionary with total_income, total_expenses, net_change

        """
        total_income = sum(
            (_to_decimal(t.amount) for t in transactions if t.type == TransactionType.INCOME),
            Decimal(0),
        )
        total_expenses = sum(
            (_to_decimal(t.amount) for t in transactions if t.type == TransactionType.EXPENSE),
            Decimal(0),
        )

        return {
            "total_income": float(total_income),
            "total_expenses": float(total_expenses),
            "net_change": float(total_income - total_expenses),
        }

    @staticmethod
    def calculate_savings_rate(total_income: float, total_expenses: float) -> float:
        """Calculate savings rate as percentage.

        Args:
            total_income: Total income amount
            total_expenses: Total expense amount

        Returns:
            Savings rate as percentage (0-100)

        """
        if total_income == 0:
            return 0.0
        return ((total_income - total_expenses) / total_income) * 100

    @staticmethod
    def calculate_daily_spending_rate(
        transactions: list[Transaction],
    ) -> float:
        """Calculate average daily spending.

        Args:
            transactions: List of expense transactions

        Returns:
            Average daily spending amount

        """
        expenses = [t for t in transactions if t.type == TransactionType.EXPENSE]
        if not expenses:
            return 0.0

        dates = [t.date for t in expenses]
        min_date = min(dates)
        max_date = max(dates)
        days_span = (max_date - min_date).days + 1

        total_spent = sum(
            (_to_decimal(t.amount) for t in expenses),
            Decimal(0),
        )
        return float(total_spent / days_span) if days_span > 0 else 0.0

    @staticmethod
    def calculate_monthly_burn_rate(
        transactions: list[Transaction],
    ) -> float:
        """Calculate average monthly spending.

        Args:
            transactions: List of expense transactions

        Returns:
            Average monthly spending amount

        """
        expenses = [t for t in transactions if t.type == TransactionType.EXPENSE]
        if not expenses:
            return 0.0

        dates = [t.date for t in expenses]
        min_date = min(dates)
        max_date = max(dates)
        months_span = max(
            (max_date.year - min_date.year) * 12 + (max_date.month - min_date.month) + 1, 1
        )

        total_spent = sum(
            (_to_decimal(t.amount) for t in expenses),
            Decimal(0),
        )
        return float(total_spent / months_span) if months_span > 0 else 0.0

    @staticmethod
    def group_by_month(
        transactions: list[Transaction],
    ) -> dict[str, dict[str, float]]:
        """Group transactions by month with income/expense breakdown.

        Args:
            transactions: List of transactions

        Returns:
            Dictionary mapping month (YYYY-MM) to income/expense amounts

        """
        monthly_data: dict[str, dict[str, Decimal]] = defaultdict(
            lambda: {"income": Decimal(0), "expenses": Decimal(0)},
        )

        for t in transactions:
            month_key = t.date.strftime("%Y-%m")

            if t.type == TransactionType.INCOME:
                monthly_data[month_key]["income"] += _to_decimal(t.amount)
            elif t.type == TransactionType.EXPENSE:
                monthly_data[month_key]["expenses"] += _to_decimal(t.amount)

        return {
            k: {"income": float(v["income"]), "expenses": float(v["expenses"])}
            for k, v in monthly_data.items()
        }

    @staticmethod
    def group_by_category(
        transactions: list[Transaction],
    ) -> dict[str, float]:
        """Group expense transactions by category.

        Only includes expense transactions for spending analysis.
        Income and transfer transactions are excluded.

        Args:
            transactions: List of transactions (will be filtered to expenses)

        Returns:
            Dictionary mapping category to total expense amount

        """
        category_totals: dict[str, Decimal] = defaultdict(Decimal)

        for t in transactions:
            if t.type == TransactionType.EXPENSE:
                category_totals[t.category] += _to_decimal(t.amount)

        return {k: float(v) for k, v in category_totals.items()}

    @staticmethod
    def group_by_account(
        transactions: list[Transaction],
    ) -> dict[str, float]:
        """Group transactions by account and calculate net balance.

        Income adds to the account balance, expenses subtract from it.
        Transfers debit the source account and credit the destination account.

        Args:
            transactions: List of transactions

        Returns:
            Dictionary mapping account to net balance

        """
        account_totals: dict[str, Decimal] = defaultdict(Decimal)

        for t in transactions:
            amount = _to_decimal(t.amount)
            if t.type == TransactionType.INCOME:
                account_totals[t.account] += amount
            elif t.type == TransactionType.EXPENSE:
                account_totals[t.account] -= amount
            elif t.type == TransactionType.TRANSFER:
                if t.from_account:
                    account_totals[t.from_account] -= amount
                if t.to_account:
                    account_totals[t.to_account] += amount

        return {k: float(v) for k, v in account_totals.items()}

    @staticmethod
    def calculate_consistency_score(monthly_expenses: list[float]) -> float:
        """Calculate spending consistency score (0-100).

        Higher score = more consistent spending patterns.
        Uses coefficient of variation (inverse).

        Args:
            monthly_expenses: List of monthly expense amounts

        Returns:
            Consistency score (0-100)

        """
        if len(monthly_expenses) <= 1:
            return 100.0

        mean_expense = sum(monthly_expenses) / len(monthly_expenses)
        if mean_expense == 0:
            return 100.0

        variance = sum((x - mean_expense) ** 2 for x in monthly_expenses) / len(monthly_expenses)
        std_dev = variance**0.5
        cv = (std_dev / mean_expense * 100) if mean_expense > 0 else 0

        # Convert to score: 100 = very consistent, 0 = very inconsistent
        return max(0.0, 100.0 - cv)

    @staticmethod
    def calculate_lifestyle_inflation(
        transactions: list[Transaction],
    ) -> float:
        """Calculate lifestyle inflation percentage.

        Compares average spending in first 3 months vs last 3 months.

        Args:
            transactions: List of expense transactions

        Returns:
            Lifestyle inflation as percentage

        """
        expenses = [t for t in transactions if t.type == TransactionType.EXPENSE]
        expenses.sort(key=lambda t: t.date)

        if len(expenses) < 6:
            return 0.0

        # First 3 months worth
        first_date = expenses[0].date
        first_3_months = [
            t
            for t in expenses
            if (t.date.year - first_date.year) * 12 + (t.date.month - first_date.month) < 3
        ]

        # Last 3 months worth
        last_date = expenses[-1].date
        last_3_months = [
            t
            for t in expenses
            if (last_date.year - t.date.year) * 12 + (last_date.month - t.date.month) < 3
        ]

        if not first_3_months or not last_3_months:
            return 0.0

        # Use total spending divided by number of months (3) — not by transaction count,
        # which would measure average transaction size rather than average monthly spending.
        avg_first = float(sum((_to_decimal(t.amount) for t in first_3_months), Decimal(0)) / 3)
        avg_last = float(sum((_to_decimal(t.amount) for t in last_3_months), Decimal(0)) / 3)

        if avg_first == 0:
            return 0.0

        return ((avg_last - avg_first) / avg_first) * 100

    @staticmethod
    def calculate_category_concentration(
        category_totals: dict[str, float],
    ) -> float:
        """Calculate top category concentration percentage.

        Args:
            category_totals: Dictionary of category to amount

        Returns:
            Percentage of total spent on top category

        """
        if not category_totals:
            return 0.0

        total = sum(category_totals.values())
        if total == 0:
            return 0.0

        top_category_amount = max(category_totals.values())
        return (top_category_amount / total) * 100

    @staticmethod
    def calculate_spending_velocity(
        transactions: list[Transaction],
        recent_days: int = 30,
    ) -> dict[str, float]:
        """Calculate spending velocity: recent vs historical.

        Args:
            transactions: List of expense transactions
            recent_days: Number of days to consider as "recent"

        Returns:
            Dictionary with recent_daily, historical_daily, velocity_ratio

        """
        expenses = [t for t in transactions if t.type == TransactionType.EXPENSE]
        if not expenses:
            return {"recent_daily": 0.0, "historical_daily": 0.0, "velocity_ratio": 0.0}

        today = max(t.date for t in expenses)
        recent_cutoff = today - timedelta(days=recent_days)

        recent_expenses = [t for t in expenses if t.date >= recent_cutoff]
        historical_expenses = [t for t in expenses if t.date < recent_cutoff]

        recent_total = sum(
            (_to_decimal(t.amount) for t in recent_expenses),
            Decimal(0),
        )
        recent_daily = float(recent_total / recent_days) if recent_days > 0 else 0.0

        if historical_expenses:
            hist_dates = [t.date for t in historical_expenses]
            hist_days = (max(hist_dates) - min(hist_dates)).days + 1
            hist_total = sum(
                (_to_decimal(t.amount) for t in historical_expenses),
                Decimal(0),
            )
            historical_daily = float(hist_total / hist_days) if hist_days > 0 else 0.0
        else:
            historical_daily = 0.0

        velocity_ratio = (recent_daily / historical_daily) if historical_daily > 0 else 0.0

        return {
            "recent_daily": recent_daily,
            "historical_daily": historical_daily,
            "velocity_ratio": velocity_ratio,
        }

    @staticmethod
    def find_best_worst_months(
        monthly_data: dict[str, dict[str, float]],
    ) -> dict[str, Any]:
        """Find best and worst months by surplus.

        Args:
            monthly_data: Dictionary of month to income/expense data

        Returns:
            Dictionary with best_month and worst_month details

        """
        if not monthly_data:
            return {"best_month": None, "worst_month": None}

        best_month = None
        worst_month = None
        best_surplus = -math.inf
        worst_surplus = math.inf

        for month, data in monthly_data.items():
            surplus = data["income"] - data["expenses"]

            if surplus > best_surplus:
                best_surplus = surplus
                best_month = {
                    "month": month,
                    "income": data["income"],
                    "expenses": data["expenses"],
                    "surplus": surplus,
                }

            if surplus < worst_surplus:
                worst_surplus = surplus
                worst_month = {
                    "month": month,
                    "income": data["income"],
                    "expenses": data["expenses"],
                    "surplus": surplus,
                }

        return {"best_month": best_month, "worst_month": worst_month}

    @staticmethod
    def calculate_convenience_spending(
        transactions: list[Transaction],
    ) -> dict[str, float]:
        """Calculate convenience spending metrics.

        Args:
            transactions: List of expense transactions

        Returns:
            Dictionary with convenience_amount, total_amount, percentage

        """
        expenses = [t for t in transactions if t.type == TransactionType.EXPENSE]

        convenience_categories = {
            "shopping",
            "entertainment",
            "food",
            "dining",
            "restaurant",
            "movie",
            "games",
        }

        convenience_spending = sum(
            (
                _to_decimal(t.amount)
                for t in expenses
                if t.category and t.category.lower() in convenience_categories
            ),
            Decimal(0),
        )
        total_spending = sum(
            (_to_decimal(t.amount) for t in expenses),
            Decimal(0),
        )

        convenience_pct = (
            float(convenience_spending / total_spending * 100) if total_spending > 0 else 0.0
        )

        return {
            "convenience_amount": float(convenience_spending),
            "total_amount": float(total_spending),
            "convenience_pct": convenience_pct,
        }


# Global calculator instance
calculator = FinancialCalculator()
