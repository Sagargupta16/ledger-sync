"""Monthly financial report generator.

Generates a formatted HTML report of a user's finances for a given month.
The HTML is styled with inline CSS for clean printing to PDF via the browser.
"""

import calendar
from dataclasses import dataclass
from typing import Any

from sqlalchemy import and_
from sqlalchemy.orm import Session

from ledger_sync.db.models import (
    CategoryTrend,
    MonthlySummary,
    TransactionType,
    User,
)


@dataclass
class MonthlyReportData:
    """Structured data for a monthly financial report."""

    year: int
    month: int
    month_name: str

    # Summary
    total_income: float
    total_expenses: float
    net_savings: float
    savings_rate: float

    # Top expense categories: list of (category, amount, percentage)
    top_expense_categories: list[dict[str, Any]]

    # Top income sources: list of (category, amount)
    top_income_sources: list[dict[str, Any]]

    # Monthly comparison (this month vs last month)
    comparison: dict[str, Any]


def _get_previous_month(year: int, month: int) -> tuple[int, int]:
    """Return (year, month) for the previous month."""
    if month == 1:
        return year - 1, 12
    return year, month - 1


def _format_currency(amount: float) -> str:
    """Format amount as Indian currency string."""
    if amount < 0:
        return f"-{_format_currency(abs(amount))}"

    # Indian number format: 1,23,456.78
    int_part = int(amount)
    dec_part = f"{amount - int_part:.2f}"[1:]  # .XX

    s = str(int_part)
    if len(s) <= 3:
        formatted = s
    else:
        # Last 3 digits
        formatted = s[-3:]
        s = s[:-3]
        # Group remaining digits in pairs
        while s:
            formatted = s[-2:] + "," + formatted
            s = s[:-2]

    return formatted + dec_part


def _pct_change(current: float, previous: float) -> float:
    """Calculate percentage change from previous to current."""
    if previous == 0:
        return 0.0 if current == 0 else 100.0
    return ((current - previous) / abs(previous)) * 100


def query_report_data(
    db: Session,
    user: User,
    year: int,
    month: int,
) -> MonthlyReportData:
    """Query database for all data needed to generate the monthly report.

    Uses the pre-calculated MonthlySummary and CategoryTrend tables.
    """
    period_key = f"{year:04d}-{month:02d}"
    month_name = calendar.month_name[month]

    # --- Current month summary ---
    summary = (
        db.query(MonthlySummary)
        .filter(
            and_(
                MonthlySummary.user_id == user.id,
                MonthlySummary.period_key == period_key,
            )
        )
        .first()
    )

    total_income = float(summary.total_income) if summary else 0.0
    total_expenses = float(summary.total_expenses) if summary else 0.0
    net_savings = total_income - total_expenses
    savings_rate = float(summary.savings_rate) if summary else 0.0

    # --- Top 5 expense categories ---
    expense_trends = (
        db.query(CategoryTrend)
        .filter(
            and_(
                CategoryTrend.user_id == user.id,
                CategoryTrend.period_key == period_key,
                CategoryTrend.transaction_type == TransactionType.EXPENSE,
            )
        )
        .order_by(CategoryTrend.total_amount.desc())
        .limit(5)
        .all()
    )

    top_expense_categories = [
        {
            "category": trend.category,
            "amount": float(trend.total_amount),
            "percentage": float(trend.pct_of_monthly_total),
        }
        for trend in expense_trends
    ]

    # --- Top 5 income sources ---
    income_trends = (
        db.query(CategoryTrend)
        .filter(
            and_(
                CategoryTrend.user_id == user.id,
                CategoryTrend.period_key == period_key,
                CategoryTrend.transaction_type == TransactionType.INCOME,
            )
        )
        .order_by(CategoryTrend.total_amount.desc())
        .limit(5)
        .all()
    )

    top_income_sources = [
        {
            "category": trend.category,
            "amount": float(trend.total_amount),
        }
        for trend in income_trends
    ]

    # --- Previous month for comparison ---
    prev_year, prev_month = _get_previous_month(year, month)
    prev_period_key = f"{prev_year:04d}-{prev_month:02d}"

    prev_summary = (
        db.query(MonthlySummary)
        .filter(
            and_(
                MonthlySummary.user_id == user.id,
                MonthlySummary.period_key == prev_period_key,
            )
        )
        .first()
    )

    prev_income = float(prev_summary.total_income) if prev_summary else 0.0
    prev_expenses = float(prev_summary.total_expenses) if prev_summary else 0.0
    prev_savings = prev_income - prev_expenses

    comparison = {
        "prev_month_name": calendar.month_name[prev_month],
        "prev_year": prev_year,
        "current_income": total_income,
        "previous_income": prev_income,
        "income_change_pct": _pct_change(total_income, prev_income),
        "current_expenses": total_expenses,
        "previous_expenses": prev_expenses,
        "expenses_change_pct": _pct_change(total_expenses, prev_expenses),
        "current_savings": net_savings,
        "previous_savings": prev_savings,
        "savings_change_pct": _pct_change(net_savings, prev_savings),
    }

    return MonthlyReportData(
        year=year,
        month=month,
        month_name=month_name,
        total_income=total_income,
        total_expenses=total_expenses,
        net_savings=net_savings,
        savings_rate=savings_rate,
        top_expense_categories=top_expense_categories,
        top_income_sources=top_income_sources,
        comparison=comparison,
    )


def report_data_to_dict(data: MonthlyReportData) -> dict[str, Any]:
    """Convert MonthlyReportData to a JSON-serializable dict."""
    return {
        "year": data.year,
        "month": data.month,
        "month_name": data.month_name,
        "summary": {
            "total_income": data.total_income,
            "total_expenses": data.total_expenses,
            "net_savings": data.net_savings,
            "savings_rate": data.savings_rate,
        },
        "top_expense_categories": data.top_expense_categories,
        "top_income_sources": data.top_income_sources,
        "comparison": data.comparison,
    }


# Re-export from sibling module to keep this file under 500 LOC.
from ledger_sync.core.report_generator_html import generate_html_report  # noqa: E402, F401

__all__ = ["MonthlyReportData", "generate_html_report", "query_report_data", "report_data_to_dict"]
