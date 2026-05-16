"""FY summary, tax summary, cash flow, budgets, anomalies, preferences."""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ledger_sync.db.models import (
    Anomaly,
    Budget,
    FYSummary,
    MonthlySummary,
    TaxRecord,
    User,
    UserPreferences,
)

from .registry import (
    ToolSpec,
    register,
    to_decimal,
)

# --- Extra tools backed by analytics tables ---------------------------------


def _exec_get_fy_summary(user: User, db: Session, args: dict[str, Any]) -> Any:
    """Return a full FY rollup (income, expenses, tax paid, savings rate).

    `fiscal_year` like 'FY2024-25'. Omit to get the most recent FY on record.
    """
    fy = str(args.get("fiscal_year", "")).strip() or None
    stmt = select(FYSummary).where(FYSummary.user_id == user.id)
    if fy:
        stmt = stmt.where(FYSummary.fiscal_year == fy)
    else:
        stmt = stmt.order_by(FYSummary.fiscal_year.desc())
    row = db.execute(stmt.limit(1)).scalar_one_or_none()
    if not row:
        return {"found": False, "fiscal_year": fy}
    return {
        "found": True,
        "fiscal_year": row.fiscal_year,
        "start_date": row.start_date.date().isoformat(),
        "end_date": row.end_date.date().isoformat(),
        "income": {
            "total": to_decimal(row.total_income),
            "salary": to_decimal(row.salary_income),
            "bonus": to_decimal(row.bonus_income),
            "investment": to_decimal(row.investment_income),
            "other": to_decimal(row.other_income),
        },
        "expenses": to_decimal(row.total_expenses),
        "tax_paid": to_decimal(row.tax_paid),
        "investments_made": to_decimal(row.investments_made),
        "net_savings": to_decimal(row.net_savings),
        "savings_rate": row.savings_rate,
        "yoy_change": {
            "income_pct": row.yoy_income_change,
            "expense_pct": row.yoy_expense_change,
            "savings_pct": row.yoy_savings_change,
        },
        "is_complete": row.is_complete,
    }


register(
    ToolSpec(
        name="get_fy_summary",
        description=(
            "Get a fiscal-year summary (Apr-Mar for India): gross income by "
            "source, total expenses, tax paid, savings, and YoY change. Use "
            "for questions like 'what was FY 2024-25 income' or 'show last "
            "year's totals'. Omit `fiscal_year` to get the most recent FY."
        ),
        schema={
            "type": "object",
            "properties": {
                "fiscal_year": {
                    "type": "string",
                    "description": "Fiscal year like FY2024-25. Optional.",
                },
            },
        },
        execute=_exec_get_fy_summary,
    )
)


def _fetch_tax_record(db: Session, user_id: int, fy: str | None) -> TaxRecord | None:
    stmt = select(TaxRecord).where(TaxRecord.user_id == user_id)
    if fy:
        stmt = stmt.where(TaxRecord.financial_year == fy)
    else:
        stmt = stmt.order_by(TaxRecord.financial_year.desc())
    return db.execute(stmt.limit(1)).scalar_one_or_none()


def _fetch_fy_summary(db: Session, user_id: int, fy: str | None) -> FYSummary | None:
    stmt = select(FYSummary).where(FYSummary.user_id == user_id)
    if fy:
        stmt = stmt.where(FYSummary.fiscal_year == fy)
    else:
        stmt = stmt.order_by(FYSummary.fiscal_year.desc())
    return db.execute(stmt.limit(1)).scalar_one_or_none()


def _tax_income_section(tr: TaxRecord | None, fys: FYSummary | None) -> dict[str, Any]:
    if tr is not None:
        return {
            "gross_salary": to_decimal(tr.gross_salary),
            "bonus": to_decimal(tr.bonus),
            "stipend": to_decimal(tr.stipend),
            "rsu": to_decimal(tr.rsu),
            "other": to_decimal(tr.other_income),
            "total_gross": to_decimal(tr.total_gross_income),
        }
    total_gross = to_decimal(fys.total_income) if fys else 0.0
    return {"total_gross": total_gross}


def _tax_deductions_section(tr: TaxRecord | None) -> dict[str, Any] | None:
    if tr is None:
        return None
    return {
        "standard": to_decimal(tr.standard_deduction),
        "section_80c": to_decimal(tr.section_80c),
        "section_80d": to_decimal(tr.section_80d),
        "other": to_decimal(tr.other_deductions),
        "total": to_decimal(tr.total_deductions),
    }


def _tax_paid_section(tr: TaxRecord | None, fys: FYSummary | None) -> dict[str, Any]:
    if tr is not None:
        total = to_decimal(tr.total_tax_paid)
        return {
            "tds": to_decimal(tr.tds_deducted),
            "advance_tax": to_decimal(tr.advance_tax),
            "self_assessment": to_decimal(tr.self_assessment_tax),
            "total": total,
        }
    derived_total = to_decimal(fys.tax_paid) if fys else 0.0
    return {"tds": None, "advance_tax": None, "self_assessment": None, "total": derived_total}


def _resolve_tax_fy(
    tr: TaxRecord | None, fys: FYSummary | None, fallback: str | None
) -> str | None:
    if tr is not None:
        return tr.financial_year
    if fys is not None:
        return fys.fiscal_year
    return fallback


def _exec_get_tax_summary(user: User, db: Session, args: dict[str, Any]) -> Any:
    """Return tax-specific details for an FY, combining TaxRecord (user-
    uploaded filings) with FYSummary.tax_paid (derived from transactions).

    Falls back to "data not found" when no tax has been recorded/filed.
    """
    fy = str(args.get("fiscal_year", "")).strip() or None
    tr = _fetch_tax_record(db, user.id, fy)
    fys = _fetch_fy_summary(db, user.id, fy)

    if tr is None and fys is None:
        return {"found": False, "fiscal_year": fy}

    return {
        "found": True,
        "fiscal_year": _resolve_tax_fy(tr, fys, fy),
        "filed_return": tr is not None,
        "income": _tax_income_section(tr, fys),
        "deductions": _tax_deductions_section(tr),
        "taxable_income": to_decimal(tr.taxable_income) if tr is not None else None,
        "tax_paid": _tax_paid_section(tr, fys),
        "source": "filed_tax_record" if tr is not None else "derived_from_transactions",
    }


register(
    ToolSpec(
        name="get_tax_summary",
        description=(
            "Tax details for a fiscal year: gross income, deductions (80C/80D/"
            "standard), taxable income, TDS, advance tax, self-assessment, and "
            "total tax paid. Prefers a filed TaxRecord if uploaded; otherwise "
            "returns what can be derived from transactions. Use for 'how much "
            "tax did I pay in FY 2024-25', '80C utilization', 'last year tax'."
        ),
        schema={
            "type": "object",
            "properties": {
                "fiscal_year": {
                    "type": "string",
                    "description": "Optional. Most recent if omitted.",
                },
            },
        },
        execute=_exec_get_tax_summary,
    )
)


def _exec_get_cash_flow(user: User, db: Session, args: dict[str, Any]) -> Any:
    """Return a monthly income/expense/savings time series.

    Equivalent of what the Cash Flow page shows, but tabular for the LLM.
    Defaults to the last 12 months.
    """
    limit = min(int(args.get("months", 12)), 60)
    rows = (
        db.execute(
            select(MonthlySummary)
            .where(MonthlySummary.user_id == user.id)
            .order_by(MonthlySummary.period_key.desc())
            .limit(limit)
        )
        .scalars()
        .all()
    )
    # Build tabular + aggregate views. Tracking totals in parallel with the
    # list avoids Any-typed comprehensions that mypy rejects.
    total_income = 0.0
    total_expenses = 0.0
    total_net = 0.0
    series: list[dict[str, Any]] = []
    for r in reversed(rows):
        income = to_decimal(r.total_income)
        expenses = to_decimal(r.total_expenses)
        net = to_decimal(r.net_savings)
        total_income += income
        total_expenses += expenses
        total_net += net
        series.append(
            {
                "period": r.period_key,
                "income": income,
                "expenses": expenses,
                "net": net,
                "savings_rate": r.savings_rate,
            }
        )
    n = len(series)
    totals = {"income": total_income, "expenses": total_expenses, "net": total_net}
    avg = {
        "income": total_income / n if n else 0,
        "expenses": total_expenses / n if n else 0,
        "net": total_net / n if n else 0,
    }
    return {"series": series, "totals": totals, "averages": avg, "months": n}


register(
    ToolSpec(
        name="get_cash_flow",
        description=(
            "Monthly income vs expense time series (oldest -> newest). Use for "
            "'show cash flow', 'how has saving changed', 'trend of expenses'."
        ),
        schema={
            "type": "object",
            "properties": {
                "months": {"type": "integer", "minimum": 1, "maximum": 60, "default": 12},
            },
        },
        execute=_exec_get_cash_flow,
    )
)


def _exec_list_budgets(user: User, db: Session, _args: dict[str, Any]) -> Any:
    """Return active budgets with current-month usage."""
    rows = (
        db.execute(
            select(Budget)
            .where(Budget.user_id == user.id, Budget.is_active.is_(True))
            .order_by(Budget.current_month_pct.desc())
        )
        .scalars()
        .all()
    )
    return {
        "budgets": [
            {
                "category": b.category,
                "subcategory": b.subcategory,
                "monthly_limit": to_decimal(b.monthly_limit),
                "spent": to_decimal(b.current_month_spent),
                "remaining": to_decimal(b.current_month_remaining),
                "usage_pct": b.current_month_pct,
                "alert_threshold_pct": b.alert_threshold_pct,
                "over_budget": b.current_month_pct is not None and b.current_month_pct > 100,
            }
            for b in rows
        ],
        "count": len(rows),
    }


register(
    ToolSpec(
        name="list_budgets",
        description=(
            "List active budgets with current-month usage. Use for 'which "
            "budgets am I over', 'show my budgets', 'is my food budget ok'."
        ),
        schema={"type": "object", "properties": {}, "required": []},
        execute=_exec_list_budgets,
    )
)


def _exec_list_anomalies(user: User, db: Session, args: dict[str, Any]) -> Any:
    """Return unreviewed anomalies (unusual spending, duplicate-like txns, etc.)."""
    include_reviewed = bool(args.get("include_reviewed", False))
    stmt = select(Anomaly).where(Anomaly.user_id == user.id)
    if not include_reviewed:
        stmt = stmt.where(Anomaly.is_reviewed.is_(False), Anomaly.is_dismissed.is_(False))
    stmt = stmt.order_by(Anomaly.detected_at.desc()).limit(25)
    rows = db.execute(stmt).scalars().all()
    return {
        "anomalies": [
            {
                "type": a.anomaly_type.value if a.anomaly_type else None,
                "severity": a.severity,
                "description": a.description,
                "period": a.period_key,
                "expected": to_decimal(a.expected_value),
                "actual": to_decimal(a.actual_value),
                "deviation_pct": a.deviation_pct,
                "detected_at": a.detected_at.date().isoformat() if a.detected_at else None,
                "is_reviewed": a.is_reviewed,
                "is_dismissed": a.is_dismissed,
            }
            for a in rows
        ],
        "count": len(rows),
    }


register(
    ToolSpec(
        name="list_anomalies",
        description=(
            "Recent unusual-spending alerts the system detected. Use for 'any "
            "anomalies this month', 'what did I overspend on'."
        ),
        schema={
            "type": "object",
            "properties": {
                "include_reviewed": {"type": "boolean", "default": False},
            },
        },
        execute=_exec_list_anomalies,
    )
)


def _exec_get_preferences_summary(user: User, db: Session, _args: dict[str, Any]) -> Any:
    """Return the user's key configuration so the LLM can reason about context:
    currency, fiscal year start, salary structure basics, tax regime hint."""
    prefs = db.execute(
        select(UserPreferences).where(UserPreferences.user_id == user.id)
    ).scalar_one_or_none()
    if not prefs:
        return {"found": False}

    salary: dict[str, Any] = {}
    try:
        import json

        salary = json.loads(prefs.salary_structure or "{}")
    except ValueError:
        salary = {}

    return {
        "found": True,
        "currency_symbol": prefs.currency_symbol,
        "display_currency": prefs.display_currency,
        "fiscal_year_start_month": prefs.fiscal_year_start_month,
        "salary_structure_configured": bool(salary),
        "salary_components": {
            k: v
            for k, v in salary.items()
            if k
            in {
                "basic",
                "hra",
                "special_allowance",
                "bonus",
                "lta",
                "provident_fund",
                "nps",
                "gratuity",
                "ctc",
            }
        },
    }


register(
    ToolSpec(
        name="get_preferences_summary",
        description=(
            "Key user preferences: currency, fiscal year start, and salary "
            "structure components if configured. Use when the user asks about "
            "their salary breakdown, CTC, or why numbers are shown in a specific "
            "currency."
        ),
        schema={"type": "object", "properties": {}, "required": []},
        execute=_exec_get_preferences_summary,
    )
)
