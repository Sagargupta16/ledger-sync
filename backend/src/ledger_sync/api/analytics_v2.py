"""Analytics V2 API endpoints - Enhanced analytics from stored aggregations.

This module provides fast analytics endpoints that read from pre-calculated
aggregation tables rather than computing on-the-fly.
"""

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc
from sqlalchemy.orm import Session

from ledger_sync.db.models import (
    Anomaly,
    Budget,
    CategoryTrend,
    FinancialGoal,
    FYSummary,
    MerchantIntelligence,
    MonthlySummary,
    NetWorthSnapshot,
    RecurringTransaction,
    TransferFlow,
)
from ledger_sync.db.session import get_session

router = APIRouter(prefix="/api/analytics/v2", tags=["analytics-v2"])


@router.get("/monthly-summaries")
def get_monthly_summaries(
    db: Session = Depends(get_session),
    start_period: str | None = Query(None, description="Start period (YYYY-MM)"),
    end_period: str | None = Query(None, description="End period (YYYY-MM)"),
    limit: int = Query(24, ge=1, le=120, description="Number of months to return"),
) -> dict[str, Any]:
    """Get pre-calculated monthly summaries.

    Returns comprehensive monthly data including:
    - Income breakdown (salary, investment, other)
    - Expense breakdown (essential vs discretionary)
    - Savings metrics
    - Month-over-month changes
    """
    query = db.query(MonthlySummary).order_by(desc(MonthlySummary.period_key))

    if start_period:
        query = query.filter(MonthlySummary.period_key >= start_period)
    if end_period:
        query = query.filter(MonthlySummary.period_key <= end_period)

    summaries = query.limit(limit).all()

    return {
        "data": [
            {
                "period": s.period_key,
                "year": s.year,
                "month": s.month,
                "income": {
                    "total": float(s.total_income),
                    "salary": float(s.salary_income),
                    "investment": float(s.investment_income),
                    "other": float(s.other_income),
                    "count": s.income_count,
                    "change_pct": s.income_change_pct,
                },
                "expenses": {
                    "total": float(s.total_expenses),
                    "essential": float(s.essential_expenses),
                    "discretionary": float(s.discretionary_expenses),
                    "count": s.expense_count,
                    "change_pct": s.expense_change_pct,
                },
                "transfers": {
                    "out": float(s.total_transfers_out),
                    "in": float(s.total_transfers_in),
                    "net_investment": float(s.net_investment_flow),
                    "count": s.transfer_count,
                },
                "savings": {
                    "net": float(s.net_savings),
                    "rate": s.savings_rate,
                },
                "expense_ratio": s.expense_ratio,
                "total_transactions": s.total_transactions,
                "last_calculated": s.last_calculated.isoformat() if s.last_calculated else None,
            }
            for s in summaries
        ],
        "count": len(summaries),
    }


@router.get("/category-trends")
def get_category_trends(
    db: Session = Depends(get_session),
    category: str | None = Query(None, description="Filter by category"),
    transaction_type: str | None = Query(None, description="Filter by type (Income/Expense)"),
    start_period: str | None = Query(None, description="Start period (YYYY-MM)"),
    end_period: str | None = Query(None, description="End period (YYYY-MM)"),
    limit: int = Query(100, ge=1, le=500),
) -> dict[str, Any]:
    """Get category-level trends over time.

    Useful for:
    - Time series charts per category
    - Category growth/decline analysis
    - Spending pattern identification
    """
    query = db.query(CategoryTrend).order_by(
        desc(CategoryTrend.period_key), desc(CategoryTrend.total_amount)
    )

    if category:
        query = query.filter(CategoryTrend.category == category)
    if transaction_type:
        query = query.filter(CategoryTrend.transaction_type == transaction_type)
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
    db: Session = Depends(get_session),
    min_amount: float | None = Query(None, description="Minimum total amount"),
    min_count: int | None = Query(None, description="Minimum transaction count"),
) -> dict[str, Any]:
    """Get aggregated transfer flows between accounts.

    Perfect for:
    - Sankey diagram visualization
    - Money flow analysis
    - Account relationship mapping
    """
    query = db.query(TransferFlow).order_by(desc(TransferFlow.total_amount))

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
                "last_date": f.last_transfer_date.isoformat() if f.last_transfer_date else None,
                "last_amount": float(f.last_transfer_amount) if f.last_transfer_amount else None,
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


@router.get("/recurring-transactions")
def get_recurring_transactions(
    db: Session = Depends(get_session),
    active_only: bool = Query(True, description="Only show active recurring patterns"),
    min_confidence: float = Query(50, ge=0, le=100, description="Minimum confidence score"),
) -> dict[str, Any]:
    """Get detected recurring transaction patterns.

    Includes:
    - Subscriptions (OTT, software)
    - Bills (rent, utilities)
    - Salary/income patterns
    - Regular investments
    """
    query = db.query(RecurringTransaction).order_by(
        desc(RecurringTransaction.confidence_score), desc(RecurringTransaction.expected_amount)
    )

    if active_only:
        query = query.filter(RecurringTransaction.is_active.is_(True))
    if min_confidence:
        query = query.filter(RecurringTransaction.confidence_score >= min_confidence)

    recurring = query.all()

    return {
        "data": [
            {
                "id": r.id,
                "name": r.pattern_name,
                "category": r.category,
                "subcategory": r.subcategory,
                "account": r.account,
                "type": r.transaction_type.value if r.transaction_type else None,
                "frequency": r.frequency.value if r.frequency else None,
                "expected_amount": float(r.expected_amount),
                "variance": float(r.amount_variance),
                "expected_day": r.expected_day,
                "confidence": r.confidence_score,
                "occurrences": r.occurrences_detected,
                "last_occurrence": r.last_occurrence.isoformat() if r.last_occurrence else None,
                "next_expected": r.next_expected.isoformat() if r.next_expected else None,
                "times_missed": r.times_missed,
                "is_confirmed": r.is_user_confirmed,
            }
            for r in recurring
        ],
        "count": len(recurring),
        "summary": {
            "total_monthly_recurring": sum(
                float(r.expected_amount)
                for r in recurring
                if r.frequency and r.frequency.value == "monthly"
            ),
        },
    }


@router.get("/merchant-intelligence")
def get_merchant_intelligence(
    db: Session = Depends(get_session),
    min_transactions: int = Query(3, ge=1, description="Minimum transaction count"),
    recurring_only: bool = Query(False, description="Only show recurring merchants"),
    limit: int = Query(50, ge=1, le=200),
) -> dict[str, Any]:
    """Get merchant/vendor intelligence.

    Shows:
    - Top merchants by spend
    - Transaction patterns per merchant
    - Recurring merchant detection
    """
    query = db.query(MerchantIntelligence).order_by(desc(MerchantIntelligence.total_spent))

    if min_transactions:
        query = query.filter(MerchantIntelligence.transaction_count >= min_transactions)
    if recurring_only:
        query = query.filter(MerchantIntelligence.is_recurring.is_(True))

    merchants = query.limit(limit).all()

    return {
        "data": [
            {
                "merchant": m.merchant_name,
                "category": m.primary_category,
                "subcategory": m.primary_subcategory,
                "total_spent": float(m.total_spent),
                "transaction_count": m.transaction_count,
                "avg_transaction": float(m.avg_transaction),
                "first_transaction": (
                    m.first_transaction.isoformat() if m.first_transaction else None
                ),
                "last_transaction": m.last_transaction.isoformat() if m.last_transaction else None,
                "months_active": m.months_active,
                "avg_days_between": m.avg_days_between,
                "is_recurring": m.is_recurring,
            }
            for m in merchants
        ],
        "count": len(merchants),
    }


@router.get("/net-worth")
def get_net_worth_history(
    db: Session = Depends(get_session),
    limit: int = Query(12, ge=1, le=120, description="Number of snapshots"),
) -> dict[str, Any]:
    """Get net worth history and current snapshot.

    Returns:
    - Asset breakdown (cash, investments, etc.)
    - Liability breakdown
    - Net worth over time
    """
    snapshots = (
        db.query(NetWorthSnapshot).order_by(desc(NetWorthSnapshot.snapshot_date)).limit(limit).all()
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
    db: Session = Depends(get_session),
) -> dict[str, Any]:
    """Get fiscal year summaries (April - March).

    Perfect for:
    - Annual tax planning
    - Year-over-year comparison
    - Financial year analysis (India FY)
    """
    summaries = db.query(FYSummary).order_by(desc(FYSummary.fiscal_year)).all()

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


@router.get("/anomalies")
def get_anomalies(
    db: Session = Depends(get_session),
    severity: str | None = Query(None, description="Filter by severity (low/medium/high/critical)"),
    unreviewed_only: bool = Query(True, description="Only show unreviewed anomalies"),
    limit: int = Query(50, ge=1, le=200),
) -> dict[str, Any]:
    """Get detected anomalies and unusual patterns.

    Types:
    - High expense months
    - Unusual category spending
    - Large transfers
    - Budget exceeded
    """
    query = db.query(Anomaly).order_by(desc(Anomaly.detected_at))

    if severity:
        query = query.filter(Anomaly.severity == severity)
    if unreviewed_only:
        query = query.filter(Anomaly.is_reviewed.is_(False))
        query = query.filter(Anomaly.is_dismissed.is_(False))

    anomalies = query.limit(limit).all()

    return {
        "data": [
            {
                "id": a.id,
                "type": a.anomaly_type.value if a.anomaly_type else None,
                "severity": a.severity,
                "description": a.description,
                "transaction_id": a.transaction_id,
                "period": a.period_key,
                "expected": float(a.expected_value) if a.expected_value else None,
                "actual": float(a.actual_value) if a.actual_value else None,
                "deviation_pct": a.deviation_pct,
                "detected_at": a.detected_at.isoformat() if a.detected_at else None,
                "is_reviewed": a.is_reviewed,
                "is_dismissed": a.is_dismissed,
            }
            for a in anomalies
        ],
        "count": len(anomalies),
        "summary": {
            "high": sum(1 for a in anomalies if a.severity == "high"),
            "medium": sum(1 for a in anomalies if a.severity == "medium"),
            "low": sum(1 for a in anomalies if a.severity == "low"),
        },
    }


@router.post("/anomalies/{anomaly_id}/review")
def review_anomaly(
    anomaly_id: int,
    dismiss: bool = Query(False, description="Dismiss the anomaly"),
    notes: str | None = Query(None, description="Review notes"),
    db: Session = Depends(get_session),
) -> dict[str, Any]:
    """Mark an anomaly as reviewed."""
    anomaly = db.query(Anomaly).filter(Anomaly.id == anomaly_id).first()

    if not anomaly:
        return {"success": False, "error": "Anomaly not found"}

    anomaly.is_reviewed = True
    anomaly.is_dismissed = dismiss
    anomaly.review_notes = notes
    anomaly.reviewed_at = datetime.now()

    db.commit()

    return {"success": True, "anomaly_id": anomaly_id}


@router.get("/budgets")
def get_budgets(
    db: Session = Depends(get_session),
    active_only: bool = Query(True),
) -> dict[str, Any]:
    """Get budget tracking data."""
    query = db.query(Budget)

    if active_only:
        query = query.filter(Budget.is_active.is_(True))

    budgets = query.order_by(desc(Budget.current_month_pct)).all()

    return {
        "data": [
            {
                "id": b.id,
                "category": b.category,
                "subcategory": b.subcategory,
                "monthly_limit": float(b.monthly_limit),
                "current_spent": float(b.current_month_spent),
                "remaining": float(b.current_month_remaining),
                "usage_pct": b.current_month_pct,
                "alert_threshold": b.alert_threshold_pct,
                "avg_actual": float(b.avg_monthly_actual),
                "months_over": b.months_over_budget,
                "months_under": b.months_under_budget,
            }
            for b in budgets
        ],
        "count": len(budgets),
    }


@router.post("/budgets")
def create_budget(
    category: str,
    monthly_limit: float,
    subcategory: str | None = None,
    alert_threshold: float = 80,
    db: Session = Depends(get_session),
) -> dict[str, Any]:
    """Create a new budget."""
    budget = Budget(
        category=category,
        subcategory=subcategory,
        monthly_limit=monthly_limit,
        alert_threshold_pct=alert_threshold,
        is_active=True,
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )
    db.add(budget)
    db.commit()

    return {"success": True, "budget_id": budget.id}


@router.get("/goals")
def get_financial_goals(
    db: Session = Depends(get_session),
    status: str | None = Query(None, description="Filter by status (active/completed/paused)"),
) -> dict[str, Any]:
    """Get financial goals."""
    query = db.query(FinancialGoal)

    if status:
        query = query.filter(FinancialGoal.status == status)

    goals = query.order_by(desc(FinancialGoal.created_at)).all()

    return {
        "data": [
            {
                "id": g.id,
                "name": g.name,
                "description": g.description,
                "type": g.goal_type,
                "target": float(g.target_amount),
                "current": float(g.current_amount),
                "target_date": g.target_date.isoformat() if g.target_date else None,
                "progress_pct": g.progress_pct,
                "monthly_target": float(g.monthly_target),
                "on_track": g.on_track,
                "status": g.status.value if g.status else None,
            }
            for g in goals
        ],
        "count": len(goals),
    }


@router.post("/goals")
def create_goal(
    name: str,
    target_amount: float,
    goal_type: str = "savings",
    description: str | None = None,
    target_date: datetime | None = None,
    db: Session = Depends(get_session),
) -> dict[str, Any]:
    """Create a new financial goal."""
    from ledger_sync.db.models import GoalStatus

    # Calculate monthly target if target date provided
    monthly_target = 0
    if target_date:
        months_remaining = (target_date.year - datetime.now().year) * 12 + (
            target_date.month - datetime.now().month
        )
        if months_remaining > 0:
            monthly_target = target_amount / months_remaining

    goal = FinancialGoal(
        name=name,
        description=description,
        goal_type=goal_type,
        target_amount=target_amount,
        target_date=target_date,
        monthly_target=monthly_target,
        status=GoalStatus.ACTIVE,
        created_at=datetime.now(),
    )
    db.add(goal)
    db.commit()

    return {"success": True, "goal_id": goal.id}
