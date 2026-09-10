"""Goal mutations and progress derived from the saved allocation."""

from __future__ import annotations

from datetime import UTC, date, datetime, time
from decimal import Decimal
from typing import Any

from ledger_sync.db.models import FinancialGoal, GoalStatus
from ledger_sync.schemas.goals import CreateGoalRequest, UpdateGoalRequest


def serialize_goal(goal: FinancialGoal) -> dict[str, Any]:
    """Use the same representation after a read, create, or update."""
    return {
        "id": goal.id,
        "name": goal.name,
        "goal_type": goal.goal_type,
        "target_amount": float(goal.target_amount),
        "current_amount": float(goal.current_amount or 0),
        "progress_pct": goal.progress_pct or 0,
        "start_date": goal.created_at.isoformat() if goal.created_at else None,
        "target_date": goal.target_date.isoformat() if goal.target_date else None,
        "is_achieved": goal.status == GoalStatus.COMPLETED,
        "achieved_date": goal.completed_at.isoformat() if goal.completed_at else None,
        "notes": goal.description,
        "created_at": goal.created_at.isoformat() if goal.created_at else None,
        "updated_at": goal.updated_at.isoformat() if goal.updated_at else None,
    }


def refresh_goal_progress(goal: FinancialGoal, today: date) -> None:
    """Recalculate funding and completion without modifying ledger transactions."""
    current_amount = goal.current_amount or Decimal(0)
    remaining = max(Decimal(0), goal.target_amount - current_amount)
    goal.progress_pct = float(current_amount / goal.target_amount * 100)
    goal.monthly_target = Decimal(0)
    if goal.target_date:
        months_remaining = (goal.target_date.year - today.year) * 12 + (
            goal.target_date.month - today.month
        )
        if months_remaining > 0:
            goal.monthly_target = (remaining / months_remaining).quantize(Decimal("0.01"))

    if current_amount >= goal.target_amount:
        goal.status = GoalStatus.COMPLETED
        goal.completed_at = goal.completed_at or datetime.now(UTC)
    elif goal.status == GoalStatus.COMPLETED:
        goal.status = GoalStatus.ACTIVE
        goal.completed_at = None
    goal.updated_at = datetime.now(UTC)


def new_goal(user_id: int, body: CreateGoalRequest, today: date) -> FinancialGoal:
    goal = FinancialGoal(
        user_id=user_id,
        name=body.name,
        description=body.notes,
        goal_type=body.goal_type,
        target_amount=body.target_amount,
        current_amount=Decimal(0),
        target_date=datetime.combine(body.target_date, time.min) if body.target_date else None,
        status=GoalStatus.ACTIVE,
        created_at=datetime.now(UTC),
    )
    refresh_goal_progress(goal, today)
    return goal


def update_goal(goal: FinancialGoal, body: UpdateGoalRequest, today: date) -> None:
    for field, value in body.model_dump(exclude_unset=True).items():
        if field == "notes":
            goal.description = value
        elif field == "target_date":
            goal.target_date = datetime.combine(value, time.min) if value else None
        else:
            setattr(goal, field, value)
    refresh_goal_progress(goal, today)
