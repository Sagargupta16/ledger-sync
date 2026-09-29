"""V2 endpoints: investment holdings, category trends, transfer flows.

Mounted by ``summaries`` so the routes keep their original position and paths.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Query
from sqlalchemy import desc

from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.db.models import (
    CategoryTrend,
    InvestmentHolding,
    TransactionType,
    TransferFlow,
)

router = APIRouter()


@router.get("/investment-holdings")
def get_investment_holdings(
    current_user: CurrentUser,
    db: DatabaseSession,
    active_only: Annotated[bool, Query(description="Only active holdings")] = True,
) -> dict[str, Any]:
    """Get auto-populated investment holdings derived from transaction data.

    Holdings are computed from transfer flows to/from investment accounts
    as defined in user preferences (investment_account_mappings).
    """
    query = (
        db.query(InvestmentHolding)
        .filter(InvestmentHolding.user_id == current_user.id)
        .order_by(desc(InvestmentHolding.invested_amount))
    )

    if active_only:
        query = query.filter(InvestmentHolding.is_active.is_(True))

    holdings = query.all()

    total_invested = sum(float(h.invested_amount) for h in holdings)
    total_current = sum(float(h.current_value) for h in holdings)

    return {
        "data": [
            {
                "id": h.id,
                "account": h.account,
                "investment_type": h.investment_type,
                "instrument_name": h.instrument_name,
                "invested_amount": float(h.invested_amount),
                "current_value": float(h.current_value),
                "realized_gains": float(h.realized_gains),
                "unrealized_gains": float(h.unrealized_gains),
                "is_active": h.is_active,
                "last_updated": h.last_updated.isoformat() if h.last_updated else None,
            }
            for h in holdings
        ],
        "count": len(holdings),
        "summary": {
            "total_invested": total_invested,
            "total_current_value": total_current,
            "total_gains": total_current - total_invested,
        },
    }


@router.get("/category-trends")
def get_category_trends(
    current_user: CurrentUser,
    db: DatabaseSession,
    category: Annotated[str | None, Query(description="Filter by category")] = None,
    transaction_type: Annotated[
        str | None, Query(description="Filter by type (Income/Expense)")
    ] = None,
    start_period: Annotated[str | None, Query(description="Start period (YYYY-MM)")] = None,
    end_period: Annotated[str | None, Query(description="End period (YYYY-MM)")] = None,
    limit: Annotated[int, Query(ge=1, le=5000)] = 1000,
) -> dict[str, Any]:
    """Get category-level trends over time.

    Useful for:
    - Time series charts per category
    - Category growth/decline analysis
    - Spending pattern identification

    Earning-start-date is deliberately NOT applied here. View-window
    cropping belongs on the frontend chart layer.
    """
    query = (
        db.query(CategoryTrend)
        .filter(CategoryTrend.user_id == current_user.id)
        .order_by(
            desc(CategoryTrend.period_key),
            desc(CategoryTrend.total_amount),
        )
    )

    if category:
        query = query.filter(CategoryTrend.category == category)
    if transaction_type:
        try:
            tx_type: TransactionType | str = TransactionType(transaction_type)
        except ValueError:
            tx_type = transaction_type
        query = query.filter(CategoryTrend.transaction_type == tx_type)
    if start_period:
        query = query.filter(CategoryTrend.period_key >= start_period)
    if end_period:
        query = query.filter(CategoryTrend.period_key <= end_period)

    trends = query.limit(limit).all()

    return {
        "data": [
            {
                "period": t.period_key,
                "category": t.category,
                "subcategory": t.subcategory,
                "type": t.transaction_type.value if t.transaction_type else None,
                "total": float(t.total_amount),
                "count": t.transaction_count,
                "avg": float(t.avg_transaction),
                "max": float(t.max_transaction),
                "min": float(t.min_transaction),
                "pct_of_monthly": t.pct_of_monthly_total,
                "mom_change": float(t.mom_change),
                "mom_change_pct": t.mom_change_pct,
            }
            for t in trends
        ],
        "count": len(trends),
    }


@router.get("/transfer-flows")
def get_transfer_flows(
    current_user: CurrentUser,
    db: DatabaseSession,
    min_amount: Annotated[float | None, Query(description="Minimum total amount")] = None,
    min_count: Annotated[int | None, Query(description="Minimum transaction count")] = None,
) -> dict[str, Any]:
    """Get aggregated transfer flows between accounts.

    Perfect for:
    - Sankey diagram visualization
    - Money flow analysis
    - Account relationship mapping
    """
    query = (
        db.query(TransferFlow)
        .filter(TransferFlow.user_id == current_user.id)
        .order_by(desc(TransferFlow.total_amount))
    )

    if min_amount:
        query = query.filter(TransferFlow.total_amount >= min_amount)
    if min_count:
        query = query.filter(TransferFlow.transaction_count >= min_count)

    flows = query.all()

    return {
        "data": [
            {
                "from": f.from_account,
                "to": f.to_account,
                "total": float(f.total_amount),
                "count": f.transaction_count,
                "avg": float(f.avg_transfer),
                "last_date": (f.last_transfer_date.isoformat() if f.last_transfer_date else None),
                "last_amount": (float(f.last_transfer_amount) if f.last_transfer_amount else None),
                "from_type": f.from_account_type,
                "to_type": f.to_account_type,
            }
            for f in flows
        ],
        "count": len(flows),
        # Summary for Sankey
        "summary": {
            "total_flow": sum(float(f.total_amount) for f in flows),
            "unique_accounts": len({f.from_account for f in flows} | {f.to_account for f in flows}),
        },
    }
