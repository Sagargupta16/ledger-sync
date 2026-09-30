"""V2 endpoints: net worth, FY summaries, anomalies, budgets, goals.

Net worth and FY summaries live in ``networth_fy``, mounted first so the route
order is unchanged.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import desc, func

from ledger_sync.api.analytics_v2_impl.networth_fy import router as networth_fy_router
from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.core.analytics.refresh import lock_analytics_user, mark_preferences_changed
from ledger_sync.core.ledger_clock import ledger_today
from ledger_sync.db.models import (
    Anomaly,
    AnomalyType,
    Budget,
    FinancialGoal,
)
from ledger_sync.schemas.goals import CreateGoalRequest, UpdateGoalRequest
from ledger_sync.services.goal_service import new_goal, serialize_goal, update_goal

router = APIRouter()
# Mounted before this module's own routes: /net-worth and /fy-summaries first.
router.include_router(networth_fy_router)


class CreateBudgetRequest(BaseModel):
    category: str
    monthly_limit: float
    subcategory: str | None = None
    alert_threshold: float = 80.0


class ReviewAnomalyRequest(BaseModel):
    dismiss: bool = False
    notes: str | None = None


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

    ``limit`` caps only ``data``. ``count`` and ``summary`` cover every
    matching anomaly, so badges and tiles do not stop at the page size.
    """
    query = db.query(Anomaly).filter(Anomaly.user_id == current_user.id)

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

    by_severity: dict[str | None, int] = dict(
        query.with_entities(Anomaly.severity, func.count()).group_by(Anomaly.severity).tuples()
    )
    anomalies = query.order_by(desc(Anomaly.detected_at)).limit(limit).all()

    return {
        "data": [
            {
                "id": a.id,
                "anomaly_type": a.anomaly_type.value if a.anomaly_type else None,
                "severity": a.severity,
                "description": a.description,
                "transaction_id": a.transaction_id,
                "period_key": a.period_key,
                # ``is not None``, not truthiness: 0 is a real detection value,
                # not a missing one. "expected 0, actual 4,500" is the whole
                # point of an unusual-category flag, and the truthiness test
                # sent that expected_value as null -- which the anomaly
                # review UI reads as "no comparison available" and hides the
                # bar entirely, losing the most extreme cases first.
                "expected_value": float(a.expected_value) if a.expected_value is not None else None,
                "actual_value": float(a.actual_value) if a.actual_value is not None else None,
                "deviation_pct": a.deviation_pct,
                "detected_at": a.detected_at.isoformat() if a.detected_at else None,
                "is_reviewed": a.is_reviewed,
                "is_dismissed": a.is_dismissed,
                "review_notes": a.review_notes,
                "reviewed_at": a.reviewed_at.isoformat() if a.reviewed_at else None,
            }
            for a in anomalies
        ],
        "count": sum(by_severity.values()),
        "summary": {
            "high": by_severity.get("high", 0),
            "medium": by_severity.get("medium", 0),
            "low": by_severity.get("low", 0),
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
    lock_analytics_user(db, current_user.id)
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
    lock_analytics_user(db, current_user.id)
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
    mark_preferences_changed(db, current_user.id)
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
        "data": [serialize_goal(goal) for goal in goals],
        "count": len(goals),
    }


@router.post("/goals")
def create_goal(
    current_user: CurrentUser,
    db: DatabaseSession,
    body: CreateGoalRequest,
) -> dict[str, Any]:
    """Create a new financial goal."""
    goal = new_goal(current_user.id, body, ledger_today())
    db.add(goal)
    db.commit()

    return {"success": True, "goal_id": goal.id}


@router.patch("/goals/{goal_id}", responses={404: {"description": "Goal not found"}})
def update_financial_goal(
    goal_id: int,
    current_user: CurrentUser,
    db: DatabaseSession,
    body: UpdateGoalRequest,
) -> dict[str, Any]:
    """Persist goal details or its total allocation for the authenticated owner."""
    goal = (
        db.query(FinancialGoal)
        .filter(FinancialGoal.id == goal_id, FinancialGoal.user_id == current_user.id)
        .with_for_update()
        .first()
    )
    if goal is None:
        raise HTTPException(status_code=404, detail="Goal not found")
    update_goal(goal, body, ledger_today())
    db.commit()
    return serialize_goal(goal)


@router.delete("/goals/{goal_id}", responses={404: {"description": "Goal not found"}})
def delete_financial_goal(
    goal_id: int,
    current_user: CurrentUser,
    db: DatabaseSession,
) -> dict[str, bool]:
    """Delete only the owner's goal, leaving ledger transactions untouched."""
    deleted = (
        db.query(FinancialGoal)
        .filter(FinancialGoal.id == goal_id, FinancialGoal.user_id == current_user.id)
        .delete(synchronize_session=False)
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="Goal not found")
    db.commit()
    return {"success": True}
