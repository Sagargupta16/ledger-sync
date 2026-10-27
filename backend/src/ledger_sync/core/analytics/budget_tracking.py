"""Budget tracking: this IST month's spend per budget, and its open alerts.

One definition of a budget's spend for the analytics refresh
(``_update_budget_tracking``), the budget endpoints and push alerts: live
EXPENSE rows in the budget's category dated in the current IST month, with
classified capital losses and excluded accounts left out. A budget measures its
whole category; a subcategory only names its scope.

The refresh writes one BUDGET_EXCEEDED anomaly for each active budget over its
limit. ``clear_budget_alerts`` removes a category's open ones as soon as a
budget write leaves nothing there over, instead of at the next refresh.
"""

from __future__ import annotations

from collections.abc import Collection
from datetime import datetime, timedelta
from decimal import Decimal

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from ledger_sync.core.expense_class import without_capital_losses
from ledger_sync.core.ledger_clock import ledger_now
from ledger_sync.core.query_helpers import (
    apply_excluded_accounts_filter,
    capital_loss_keys_for,
    excluded_accounts_for,
)
from ledger_sync.db.models import Anomaly, AnomalyType, Budget, Transaction, TransactionType, User

#: BUDGET_EXCEEDED descriptions read "Budget exceeded for <category>: <spent> /
#: <limit>". The amounts never contain ": ", so the category is everything
#: between the prefix and the last ": ".
BUDGET_EXCEEDED_PREFIX = "Budget exceeded for "


def month_bounds(now: datetime | None = None) -> tuple[datetime, datetime]:
    """The IST calendar month holding *now* (default: the ledger clock), half-open."""
    start = (now or ledger_now()).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return start, (start + timedelta(days=32)).replace(day=1)


def month_spend_by_category(
    db: Session,
    user_id: int,
    *,
    capital_loss_keys: set[str],
    excluded_accounts: set[str],
    categories: Collection[str] | None = None,
    now: datetime | None = None,
) -> dict[str, Decimal]:
    """Spend per category in the IST month holding *now*; all categories when None.

    The engine passes its own preference readings; ``user_month_spend`` reads
    them off the user. A half-open date range can use the date index.
    """
    if categories is not None and not categories:
        return {}
    start, end = month_bounds(now)
    query = db.query(Transaction.category, func.sum(Transaction.amount)).filter(
        Transaction.user_id == user_id,
        Transaction.is_deleted.is_(False),
        Transaction.type == TransactionType.EXPENSE,
        Transaction.date >= start,
        Transaction.date < end,
    )
    if categories is not None:
        query = query.filter(Transaction.category.in_(sorted(categories)))
    query = without_capital_losses(query, capital_loss_keys)
    query = apply_excluded_accounts_filter(query, excluded_accounts)
    return {
        category: Decimal(str(total)) for category, total in query.group_by(Transaction.category)
    }


def user_month_spend(
    db: Session, user: User, categories: Collection[str] | None, now: datetime | None = None
) -> dict[str, Decimal]:
    """``month_spend_by_category`` with *user*'s capital-loss and excluded-account settings."""
    return month_spend_by_category(
        db,
        user.id,
        capital_loss_keys=capital_loss_keys_for(user),
        excluded_accounts=excluded_accounts_for(user),
        categories=categories,
        now=now,
    )


def usage_pct(spent: Decimal, limit: Decimal) -> float:
    """*spent* as a percentage of *limit*; 0 for a row saved without a positive limit."""
    return float(spent / limit * 100) if limit > 0 else 0.0


def apply_tracking(budget: Budget, spent: Decimal) -> None:
    """Store *spent* as the budget's current month, with what is left and the share used."""
    budget.current_month_spent = spent
    budget.current_month_remaining = budget.monthly_limit - spent
    budget.current_month_pct = usage_pct(spent, budget.monthly_limit)


def budget_category_from_description(description: str) -> str | None:
    """Recover the budget category a BUDGET_EXCEEDED description was written for."""
    if not description.startswith(BUDGET_EXCEEDED_PREFIX):
        return None
    category, separator, _amounts = description.removeprefix(BUDGET_EXCEEDED_PREFIX).rpartition(
        ": "
    )
    return category if separator else None


def clear_budget_alerts(db: Session, user_id: int, category: str, spent: Decimal) -> int:
    """Delete *category*'s open BUDGET_EXCEEDED alerts unless an active budget there is over.

    Run in the write's transaction after a budget in *category* was deleted,
    paused or given a new limit; *spent* is this month's spend in the category.
    It flushes first, so the check reads that change. The next refresh would
    drop the alerts too, but until then Anomaly Review, the notification center
    and push alerts still show them. Reviewed alerts stay: they keep a dismissed
    overrun from coming back. Returns how many were deleted.
    """
    db.flush()
    limits = db.scalars(
        select(Budget.monthly_limit).where(
            Budget.user_id == user_id,
            Budget.category == category,
            Budget.is_active.is_(True),
        )
    )
    if any(usage_pct(spent, limit) > 100 for limit in limits):
        return 0
    open_alerts = db.execute(
        select(Anomaly.id, Anomaly.description).where(
            Anomaly.user_id == user_id,
            Anomaly.anomaly_type == AnomalyType.BUDGET_EXCEEDED,
            Anomaly.is_reviewed.is_(False),
        )
    )
    ids = [
        alert_id
        for alert_id, description in open_alerts
        if budget_category_from_description(description) == category
    ]
    if ids:
        db.execute(delete(Anomaly).where(Anomaly.user_id == user_id, Anomaly.id.in_(ids)))
    return len(ids)
