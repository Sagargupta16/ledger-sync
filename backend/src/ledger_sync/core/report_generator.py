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


def _change_indicator(pct: float) -> str:
    """Return an arrow indicator for positive/negative change."""
    if pct > 0:
        return f'<span style="color: #16a34a;">+{pct:.1f}%</span>'
    if pct < 0:
        return f'<span style="color: #dc2626;">{pct:.1f}%</span>'
    return '<span style="color: #6b7280;">0.0%</span>'


def generate_html_report(data: MonthlyReportData) -> str:
    """Generate a clean HTML report with inline CSS for printing.

    The report includes:
    - Header with month/year
    - Financial summary (income, expenses, savings, savings rate)
    - Top 5 expense categories with amounts and percentages
    - Top 5 income sources with amounts
    - Monthly comparison (this month vs last month)
    """
    # --- Build expense categories rows ---
    expense_rows = ""
    for i, cat in enumerate(data.top_expense_categories, 1):
        expense_rows += f"""
            <tr>
                <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">{i}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">{cat["category"]}</td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">
                    {_format_currency(cat["amount"])}
                </td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">
                    {cat["percentage"]:.1f}%
                </td>
            </tr>"""

    if not data.top_expense_categories:
        expense_rows = """
            <tr>
                <td colspan="4" style="padding: 12px; text-align: center; color: #9ca3af;">
                    No expense data available for this month.
                </td>
            </tr>"""

    # --- Build income sources rows ---
    income_rows = ""
    for i, src in enumerate(data.top_income_sources, 1):
        income_rows += f"""
            <tr>
                <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">{i}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">{src["category"]}</td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">
                    {_format_currency(src["amount"])}
                </td>
            </tr>"""

    if not data.top_income_sources:
        income_rows = """
            <tr>
                <td colspan="3" style="padding: 12px; text-align: center; color: #9ca3af;">
                    No income data available for this month.
                </td>
            </tr>"""

    # --- Comparison data ---
    comp = data.comparison
    prev_label = f"{comp['prev_month_name']} {comp['prev_year']}"

    # --- Savings color ---
    savings_color = "#16a34a" if data.net_savings >= 0 else "#dc2626"

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Financial Report - {data.month_name} {data.year}</title>
    <style>
        @media print {{
            body {{ margin: 0; padding: 20px; }}
            .no-print {{ display: none; }}
        }}
        * {{ box-sizing: border-box; margin: 0; padding: 0; }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: #ffffff;
            color: #111827;
            line-height: 1.6;
            padding: 40px;
            max-width: 800px;
            margin: 0 auto;
        }}
        h1 {{
            font-size: 24px;
            font-weight: 700;
            color: #111827;
            margin-bottom: 4px;
        }}
        h2 {{
            font-size: 18px;
            font-weight: 600;
            color: #374151;
            margin-top: 32px;
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 2px solid #e5e7eb;
        }}
        .subtitle {{
            font-size: 14px;
            color: #6b7280;
            margin-bottom: 24px;
        }}
        .summary-grid {{
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 16px;
            margin-bottom: 8px;
        }}
        .summary-card {{
            background: #f9fafb;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 16px;
        }}
        .summary-card .label {{
            font-size: 12px;
            font-weight: 600;
            color: #6b7280;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }}
        .summary-card .value {{
            font-size: 22px;
            font-weight: 700;
            margin-top: 4px;
        }}
        table {{
            width: 100%;
            border-collapse: collapse;
            font-size: 14px;
        }}
        thead th {{
            background: #f3f4f6;
            padding: 10px 12px;
            text-align: left;
            font-weight: 600;
            color: #374151;
            border-bottom: 2px solid #d1d5db;
        }}
        thead th.right {{
            text-align: right;
        }}
        .print-btn {{
            position: fixed;
            top: 20px;
            right: 20px;
            background: #2563eb;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
        }}
        .print-btn:hover {{
            background: #1d4ed8;
        }}
        .footer {{
            margin-top: 40px;
            padding-top: 16px;
            border-top: 1px solid #e5e7eb;
            font-size: 12px;
            color: #9ca3af;
            text-align: center;
        }}
    </style>
</head>
<body>
    <button class="print-btn no-print" onclick="window.print()">Print / Save PDF</button>

    <h1>Financial Report - {data.month_name} {data.year}</h1>
    <p class="subtitle">Generated from Ledger Sync</p>

    <!-- ===== Summary ===== -->
    <h2>Summary</h2>
    <div class="summary-grid">
        <div class="summary-card">
            <div class="label">Total Income</div>
            <div class="value" style="color: #16a34a;">{_format_currency(data.total_income)}</div>
        </div>
        <div class="summary-card">
            <div class="label">Total Expenses</div>
            <div class="value" style="color: #dc2626;">{_format_currency(data.total_expenses)}</div>
        </div>
        <div class="summary-card">
            <div class="label">Net Savings</div>
            <div class="value" style="color:{savings_color};">
                {_format_currency(data.net_savings)}
            </div>
        </div>
        <div class="summary-card">
            <div class="label">Savings Rate</div>
            <div class="value" style="color: #2563eb;">{data.savings_rate:.1f}%</div>
        </div>
    </div>

    <!-- ===== Top 5 Expense Categories ===== -->
    <h2>Top 5 Expense Categories</h2>
    <table>
        <thead>
            <tr>
                <th style="width: 40px;">#</th>
                <th>Category</th>
                <th class="right">Amount</th>
                <th class="right">% of Total</th>
            </tr>
        </thead>
        <tbody>
            {expense_rows}
        </tbody>
    </table>

    <!-- ===== Top 5 Income Sources ===== -->
    <h2>Top 5 Income Sources</h2>
    <table>
        <thead>
            <tr>
                <th style="width: 40px;">#</th>
                <th>Source</th>
                <th class="right">Amount</th>
            </tr>
        </thead>
        <tbody>
            {income_rows}
        </tbody>
    </table>

    <!-- ===== Monthly Comparison ===== -->
    <h2>Monthly Comparison</h2>
    <p style="font-size: 13px; color: #6b7280; margin-bottom: 12px;">
        {data.month_name} {data.year} vs {prev_label}
    </p>
    <table>
        <thead>
            <tr>
                <th>Metric</th>
                <th class="right">{data.month_name} {data.year}</th>
                <th class="right">{prev_label}</th>
                <th class="right">Change</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">Income</td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">
                    {_format_currency(comp["current_income"])}
                </td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">
                    {_format_currency(comp["previous_income"])}
                </td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">
                    {_change_indicator(comp["income_change_pct"])}
                </td>
            </tr>
            <tr>
                <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">Expenses</td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">
                    {_format_currency(comp["current_expenses"])}
                </td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">
                    {_format_currency(comp["previous_expenses"])}
                </td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">
                    {_change_indicator(comp["expenses_change_pct"])}
                </td>
            </tr>
            <tr>
                <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">
                    Net Savings
                </td>
                <td class="num">
                    {_format_currency(comp["current_savings"])}
                </td>
                <td class="num">
                    {_format_currency(comp["previous_savings"])}
                </td>
                <td class="num">
                    {_change_indicator(comp["savings_change_pct"])}
                </td>
            </tr>
        </tbody>
    </table>

    <div class="footer">
        Ledger Sync &middot; Monthly Financial Report &middot; {data.month_name} {data.year}
    </div>
</body>
</html>"""

    return html
