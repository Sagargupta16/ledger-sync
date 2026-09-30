"""V2 endpoints: net worth history and FY summaries.

Split out of ``networth_misc``, which mounts this router ahead of its own
routes, so the route order is unchanged.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Query
from sqlalchemy import desc

from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.db.models import FYSummary, NetWorthSnapshot

router = APIRouter()


@router.get("/net-worth")
def get_net_worth_history(
    current_user: CurrentUser,
    db: DatabaseSession,
    limit: Annotated[int, Query(ge=1, le=600, description="Number of snapshots")] = 120,
) -> dict[str, Any]:
    """Get net worth history and current snapshot.

    Returns:
    - Asset breakdown (cash, investments, etc.)
    - Liability breakdown
    - Net worth over time

    """
    snapshots = (
        db.query(NetWorthSnapshot)
        .filter(NetWorthSnapshot.user_id == current_user.id)
        .order_by(desc(NetWorthSnapshot.snapshot_date))
        .limit(limit)
        .all()
    )

    if not snapshots:
        return {"data": [], "current": None, "count": 0}

    current = snapshots[0]

    return {
        "data": [
            {
                "date": s.snapshot_date.isoformat(),
                "assets": {
                    "cash_and_bank": float(s.cash_and_bank),
                    "investments": float(s.investments),
                    "mutual_funds": float(s.mutual_funds),
                    "stocks": float(s.stocks),
                    "fixed_deposits": float(s.fixed_deposits),
                    "ppf_epf": float(s.ppf_epf),
                    "other": float(s.other_assets),
                    "total": float(s.total_assets),
                },
                "liabilities": {
                    "credit_cards": float(s.credit_card_outstanding),
                    "loans": float(s.loans_payable),
                    "other": float(s.other_liabilities),
                    "total": float(s.total_liabilities),
                },
                "net_worth": float(s.net_worth),
                "change": float(s.net_worth_change),
                "change_pct": s.net_worth_change_pct,
            }
            for s in snapshots
        ],
        "current": {
            "net_worth": float(current.net_worth),
            "total_assets": float(current.total_assets),
            "total_liabilities": float(current.total_liabilities),
            "as_of": current.snapshot_date.isoformat(),
        },
        "count": len(snapshots),
    }


@router.get("/fy-summaries")
def get_fy_summaries(
    current_user: CurrentUser,
    db: DatabaseSession,
) -> dict[str, Any]:
    """Get fiscal year summaries (April - March).

    Perfect for:
    - Annual tax planning
    - Year-over-year comparison
    - Financial year analysis (India FY)
    """
    summaries = (
        db.query(FYSummary)
        .filter(FYSummary.user_id == current_user.id)
        .order_by(desc(FYSummary.fiscal_year))
        .all()
    )

    return {
        "data": [
            {
                "fiscal_year": s.fiscal_year,
                "period": f"{s.start_date.strftime('%b %Y')} - {s.end_date.strftime('%b %Y')}",
                "income": {
                    "total": float(s.total_income),
                    "salary": float(s.salary_income),
                    "bonus": float(s.bonus_income),
                    "investment": float(s.investment_income),
                    "other": float(s.other_income),
                },
                "expenses": {
                    "total": float(s.total_expenses),
                    "tax_paid": float(s.tax_paid),
                },
                "investments_made": float(s.investments_made),
                "savings": {
                    "net": float(s.net_savings),
                    "rate": s.savings_rate,
                },
                "yoy": {
                    "income": s.yoy_income_change,
                    "expenses": s.yoy_expense_change,
                    "savings": s.yoy_savings_change,
                },
                "is_complete": s.is_complete,
            }
            for s in summaries
        ],
        "count": len(summaries),
    }
