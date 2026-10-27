"""Budget reads and writes behind the /budgets endpoints.

Spend is counted from the ledger whenever a budget is listed or written
(``core.analytics.budget_tracking``), so the list never waits for a refresh. A
change to a limit or to whether a budget is active also stores that count,
marks preferences changed so the next refresh rebuilds budget tracking, and
clears the category's open BUDGET_EXCEEDED alert once nothing there is over its
limit. The alert threshold is read at request or run time (the navigation
badges, push alerts), so a threshold-only edit invalidates nothing.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ledger_sync.core.analytics.budget_tracking import (
    apply_tracking,
    clear_budget_alerts,
    usage_pct,
    user_month_spend,
)
from ledger_sync.core.analytics.refresh import mark_preferences_changed
from ledger_sync.db.models import Budget, User
from ledger_sync.schemas.budgets import CreateBudgetRequest, UpdateBudgetRequest

_CENT = Decimal("0.01")


def _money(value: float) -> Decimal:
    return Decimal(str(value)).quantize(_CENT, rounding=ROUND_HALF_UP)


def _category_spend(db: Session, user: User, category: str) -> Decimal:
    return user_month_spend(db, user, {category}).get(category, Decimal(0))


def serialize_budget(budget: Budget, spent: Decimal) -> dict[str, Any]:
    """The wire row; *spent* is this IST month's spend in the budget's category."""
    return {
        "id": budget.id,
        "category": budget.category,
        "subcategory": budget.subcategory,
        "monthly_limit": float(budget.monthly_limit),
        "current_spent": float(spent),
        "remaining": float(budget.monthly_limit - spent),
        "usage_pct": usage_pct(spent, budget.monthly_limit),
        "alert_threshold": budget.alert_threshold_pct,
        "avg_actual": float(budget.avg_monthly_actual),
        "months_over": budget.months_over_budget,
        "months_under": budget.months_under_budget,
        "is_active": budget.is_active,
    }


def list_budgets(db: Session, user: User, *, active_only: bool) -> list[dict[str, Any]]:
    """The user's budgets with this IST month's spend, most-used first."""
    query = select(Budget).where(Budget.user_id == user.id)
    if active_only:
        query = query.where(Budget.is_active.is_(True))
    budgets = db.scalars(query).all()
    spent = user_month_spend(db, user, {budget.category for budget in budgets})
    rows = [serialize_budget(b, spent.get(b.category, Decimal(0))) for b in budgets]
    rows.sort(key=lambda r: (-r["usage_pct"], r["category"], r["subcategory"] or "", r["id"]))
    return rows


def scope_budget(
    db: Session, user_id: int, category: str, subcategory: str | None
) -> Budget | None:
    """The one budget, paused or not, that holds a category and subcategory."""
    scope = (
        Budget.subcategory.is_(None) if subcategory is None else Budget.subcategory == subcategory
    )
    return db.scalars(
        select(Budget).where(Budget.user_id == user_id, Budget.category == category, scope)
    ).first()


def create_or_resume_budget(
    db: Session, user: User, body: CreateBudgetRequest, paused: Budget | None
) -> Budget:
    """Create the scope's budget, or resume its *paused* one with the new values."""
    budget = paused or Budget(
        user_id=user.id, category=body.category, subcategory=body.subcategory or None
    )
    if paused is None:
        db.add(budget)
    budget.monthly_limit = _money(body.monthly_limit)
    budget.alert_threshold_pct = body.alert_threshold
    budget.is_active = True
    apply_tracking(budget, _category_spend(db, user, body.category))
    mark_preferences_changed(db, user.id)
    return budget


def update_budget(db: Session, user: User, budget: Budget, body: UpdateBudgetRequest) -> Decimal:
    """Apply *body* to *budget*; returns this month's spend in its category."""
    new_limit = None if body.monthly_limit is None else _money(body.monthly_limit)
    measure_changed = (new_limit is not None and new_limit != budget.monthly_limit) or (
        body.is_active is not None and body.is_active != budget.is_active
    )
    if new_limit is not None:
        budget.monthly_limit = new_limit
    if body.alert_threshold is not None:
        budget.alert_threshold_pct = body.alert_threshold
    if body.is_active is not None:
        budget.is_active = body.is_active

    spent = _category_spend(db, user, budget.category)
    if measure_changed:
        apply_tracking(budget, spent)
        mark_preferences_changed(db, user.id)
        clear_budget_alerts(db, user.id, budget.category, spent)
    return spent


def delete_budget(db: Session, user: User, budget: Budget) -> None:
    """Delete *budget*, leaving transactions untouched; see ``clear_budget_alerts``."""
    category = budget.category
    db.delete(budget)
    clear_budget_alerts(db, user.id, category, _category_spend(db, user, category))
    mark_preferences_changed(db, user.id)
