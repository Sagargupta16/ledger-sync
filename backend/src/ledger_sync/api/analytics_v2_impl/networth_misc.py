"""V2 endpoints: net worth, FY summaries, anomalies, budgets, goals."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import desc

from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.db.models import (
    Anomaly,
    AnomalyType,
    Budget,
    FinancialGoal,
    FYSummary,
    NetWorthSnapshot,
)

router = APIRouter()


class CreateBudgetRequest(BaseModel):
    category: str
    monthly_limit: float
    subcategory: str | None = None
    alert_threshold: float = 80.0


class CreateGoalRequest(BaseModel):
    name: str
    target_amount: float
    goal_type: str = "savings"
    notes: str | None = None
    target_date: str | None = None


class ReviewAnomalyRequest(BaseModel):
    dismiss: bool = False
    notes: str | None = None


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


@router.get("/anomalies")
def get_anomalies(
    current_user: CurrentUser,
    db: DatabaseSession,
    anomaly_type: Annotated[
        str | None,
        Query(
            alias="type",
            description="Filter by anomaly type "
            "(high_expense/unusual_category/large_transfer/budget_exceeded)",
        ),
    ] = None,
    severity: Annotated[
        str | None, Query(description="Filter by severity (low/medium/high/critical)")
    ] = None,
    include_reviewed: Annotated[
        bool, Query(description="Include reviewed/dismissed anomalies")
    ] = False,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> dict[str, Any]:
    """Get detected anomalies and unusual patterns.

    Types:
    - High expense months
    - Unusual category spending
    - Large transfers
    - Budget exceeded
    """
    query = (
        db.query(Anomaly)
        .filter(Anomaly.user_id == current_user.id)
        .order_by(desc(Anomaly.detected_at))
    )

    if anomaly_type:
        try:
            at: AnomalyType | str = AnomalyType(anomaly_type)
        except ValueError:
            at = anomaly_type
        query = query.filter(Anomaly.anomaly_type == at)
    if severity:
        query = query.filter(Anomaly.severity == severity)
    if not include_reviewed:
        query = query.filter(Anomaly.is_reviewed.is_(False))
        query = query.filter(Anomaly.is_dismissed.is_(False))

    anomalies = query.limit(limit).all()

    return {
        "data": [
            {
                "id": a.id,
                "anomaly_type": a.anomaly_type.value if a.anomaly_type else None,
                "severity": a.severity,
                "description": a.description,
                "transaction_id": a.transaction_id,
                "period_key": a.period_key,
                "expected_value": float(a.expected_value) if a.expected_value else None,
                "actual_value": float(a.actual_value) if a.actual_value else None,
                "deviation_pct": a.deviation_pct,
                "detected_at": a.detected_at.isoformat() if a.detected_at else None,
                "is_reviewed": a.is_reviewed,
                "is_dismissed": a.is_dismissed,
                "review_notes": a.review_notes,
                "reviewed_at": a.reviewed_at.isoformat() if a.reviewed_at else None,
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


@router.post(
    "/anomalies/{anomaly_id}/review",
    responses={404: {"description": "Anomaly not found"}},
)
def review_anomaly(
    anomaly_id: int,
    current_user: CurrentUser,
    db: DatabaseSession,
    body: ReviewAnomalyRequest,
) -> dict[str, Any]:
    """Mark an anomaly as reviewed."""
    anomaly = (
        db.query(Anomaly)
        .filter(
            Anomaly.id == anomaly_id,
            Anomaly.user_id == current_user.id,
        )
        .first()
    )

    if not anomaly:
        raise HTTPException(status_code=404, detail="Anomaly not found")

    anomaly.is_reviewed = True
    anomaly.is_dismissed = body.dismiss
    anomaly.review_notes = body.notes
    anomaly.reviewed_at = datetime.now(UTC)

    db.commit()

    return {"success": True, "anomaly_id": anomaly_id}


@router.get("/budgets")
def get_budgets(
    current_user: CurrentUser,
    db: DatabaseSession,
    active_only: Annotated[bool, Query()] = True,
) -> dict[str, Any]:
    """Get budget tracking data."""
    query = db.query(Budget).filter(Budget.user_id == current_user.id)

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
    current_user: CurrentUser,
    db: DatabaseSession,
    body: CreateBudgetRequest,
) -> dict[str, Any]:
    """Create a new budget."""
    budget = Budget(
        user_id=current_user.id,
        category=body.category,
        subcategory=body.subcategory,
        monthly_limit=body.monthly_limit,
        alert_threshold_pct=body.alert_threshold,
        is_active=True,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    db.add(budget)
    db.commit()

    return {"success": True, "budget_id": budget.id}


@router.get("/goals")
def get_financial_goals(
    current_user: CurrentUser,
    db: DatabaseSession,
    goal_type: Annotated[
        str | None, Query(description="Filter by goal type (savings/debt_payoff/investment/etc.)")
    ] = None,
    include_achieved: Annotated[bool, Query(description="Include achieved goals")] = True,
) -> dict[str, Any]:
    """Get financial goals."""
    from ledger_sync.db.models import GoalStatus

    query = db.query(FinancialGoal).filter(FinancialGoal.user_id == current_user.id)

    if goal_type:
        query = query.filter(FinancialGoal.goal_type == goal_type)
    if not include_achieved:
        query = query.filter(FinancialGoal.status != GoalStatus.COMPLETED)

    goals = query.order_by(desc(FinancialGoal.created_at)).all()

    return {
        "data": [
            {
                "id": g.id,
                "name": g.name,
                "goal_type": g.goal_type,
                "target_amount": float(g.target_amount),
                "current_amount": float(g.current_amount),
                "progress_pct": g.progress_pct,
                "start_date": g.created_at.isoformat() if g.created_at else None,
                "target_date": g.target_date.isoformat() if g.target_date else None,
                "is_achieved": g.status == GoalStatus.COMPLETED if g.status else False,
                "achieved_date": g.completed_at.isoformat() if g.completed_at else None,
                "notes": g.description,
                "created_at": g.created_at.isoformat() if g.created_at else None,
                "updated_at": None,
            }
            for g in goals
        ],
        "count": len(goals),
    }


@router.post("/goals")
def create_goal(
    current_user: CurrentUser,
    db: DatabaseSession,
    body: CreateGoalRequest,
) -> dict[str, Any]:
    """Create a new financial goal."""
    from ledger_sync.db.models import GoalStatus

    # Parse target_date string to datetime if provided
    parsed_target_date = None
    if body.target_date:
        parsed_target_date = datetime.fromisoformat(body.target_date)

    # Calculate monthly target if target date provided
    monthly_target: float = 0
    if parsed_target_date:
        months_remaining = (parsed_target_date.year - datetime.now(UTC).year) * 12 + (
            parsed_target_date.month - datetime.now(UTC).month
        )
        if months_remaining > 0:
            monthly_target = body.target_amount / months_remaining

    goal = FinancialGoal(
        user_id=current_user.id,
        name=body.name,
        description=body.notes,
        goal_type=body.goal_type,
        target_amount=body.target_amount,
        target_date=parsed_target_date,
        monthly_target=monthly_target,
        status=GoalStatus.ACTIVE,
        created_at=datetime.now(UTC),
    )
    db.add(goal)
    db.commit()

    return {"success": True, "goal_id": goal.id}
