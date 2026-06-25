"""HTML rendering for monthly financial reports.

Extracted from report_generator.py to keep both modules under 500 LOC.
"""

from __future__ import annotations

import html
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ledger_sync.core.report_generator import MonthlyReportData


def _esc(value: object) -> str:
    """HTML-escape a dynamic (user-derived) value before interpolation."""
    return html.escape(str(value))


def _format_currency(amount: float) -> str:
    """Format a number as INR currency."""
    if amount < 0:
        return f"-Rs. {abs(amount):,.2f}"
    return f"Rs. {amount:,.2f}"


def _change_indicator(pct: float) -> str:
    """Return arrow + percent suitable for HTML report cells."""
    if pct > 0:
        return f"&uarr; {abs(pct):.1f}%"
    if pct < 0:
        return f"&darr; {abs(pct):.1f}%"
    return "—"


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
        cat_name = _esc(cat["category"])
        expense_rows += f"""
            <tr>
                <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">{i}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">{cat_name}</td>
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
        src_name = _esc(src["category"])
        income_rows += f"""
            <tr>
                <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">{i}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">{src_name}</td>
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
