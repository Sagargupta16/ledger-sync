"""V2 endpoints: category budgets (list, create, update, pause, delete).

Split out of ``networth_misc``, which mounts this router. A handler locks the
user's analytics before a write, loads the owner's row and commits; the rules
live in ``services.budget_service``: spend counted at request time, the
invalidation a new limit or a pause needs, and clearing a category's open
budget alert.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Path, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.core.analytics.refresh import lock_analytics_user
from ledger_sync.db.models import Budget
from ledger_sync.schemas.budgets import CreateBudgetRequest, UpdateBudgetRequest
from ledger_sync.services import budget_service

router = APIRouter()

_NOT_FOUND: dict[int | str, dict[str, Any]] = {404: {"description": "Budget not found"}}
# ``budgets.id`` is a 32-bit integer; a larger id overflowed the query into a 500.
BudgetId = Annotated[int, Path(ge=1, le=2_147_483_647)]


def _owned_budget(db: Session, user_id: int, budget_id: int) -> Budget:
    budget = db.scalars(
        select(Budget).where(Budget.id == budget_id, Budget.user_id == user_id)
    ).first()
    if budget is None:
        raise HTTPException(status_code=404, detail="Budget not found")
    return budget


@router.get("/budgets")
def get_budgets(
    current_user: CurrentUser,
    db: DatabaseSession,
    active_only: Annotated[bool, Query(description="False adds paused budgets")] = True,
) -> dict[str, Any]:
    """Budgets with this IST month's spend counted now, most-used first."""
    rows = budget_service.list_budgets(db, current_user, active_only=active_only)
    return {"data": rows, "count": len(rows)}


@router.post(
    "/budgets",
    responses={409: {"description": "The category already has an active budget"}},
)
def create_budget(
    current_user: CurrentUser,
    db: DatabaseSession,
    body: CreateBudgetRequest,
) -> dict[str, Any]:
    """Create a budget, or resume the paused one that already holds its scope.

    A scope (category plus optional subcategory) holds one budget, paused or
    not, so a paused budget takes the new limit and threshold instead of
    failing the unique index.
    """
    lock_analytics_user(db, current_user.id)
    existing = budget_service.scope_budget(
        db, current_user.id, body.category, body.subcategory or None
    )
    if existing is not None and existing.is_active:
        raise HTTPException(status_code=409, detail=f"{body.category} already has a budget.")
    budget = budget_service.create_or_resume_budget(db, current_user, body, existing)
    db.commit()
    return {"success": True, "budget_id": budget.id, "reactivated": existing is not None}


@router.patch("/budgets/{budget_id}", responses=_NOT_FOUND)
def update_budget(
    budget_id: BudgetId,
    current_user: CurrentUser,
    db: DatabaseSession,
    body: UpdateBudgetRequest,
) -> dict[str, Any]:
    """Change the owner's limit or alert threshold, or pause or resume the budget."""
    lock_analytics_user(db, current_user.id)
    budget = _owned_budget(db, current_user.id, budget_id)
    spent = budget_service.update_budget(db, current_user, budget, body)
    db.commit()
    return budget_service.serialize_budget(budget, spent)


@router.delete("/budgets/{budget_id}", responses=_NOT_FOUND)
def delete_budget(
    budget_id: BudgetId,
    current_user: CurrentUser,
    db: DatabaseSession,
) -> dict[str, bool]:
    """Delete only the owner's budget, leaving ledger transactions untouched."""
    lock_analytics_user(db, current_user.id)
    budget_service.delete_budget(db, current_user, _owned_budget(db, current_user.id, budget_id))
    db.commit()
    return {"success": True}
