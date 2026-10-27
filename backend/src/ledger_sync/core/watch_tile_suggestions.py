"""Categories offered as one-tap watch tiles while nothing is pinned.

Spending follows the app's rule: EXPENSE rows minus the categories the user
classified as realised capital losses, on the IST ledger calendar.
"""

from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Query, Session

from ledger_sync.core.expense_class import without_capital_losses
from ledger_sync.core.query_helpers import (
    build_transaction_query,
    capital_loss_keys_for,
    date_range_criteria,
)
from ledger_sync.core.watch_tiles import TilePeriod, first_of_month, midnight, month_key
from ledger_sync.db.models import Transaction, TransactionType, User
from ledger_sync.schemas.watch_tiles import WatchSuggestion

SUGGESTION_LIMIT = 3


def suggested_categories(
    db: Session, user: User, period: TilePeriod, limit: int = SUGGESTION_LIMIT
) -> tuple[str | None, list[WatchSuggestion]]:
    """Last month's top spending categories, offered as one-tap pins.

    When last month has no spending (a ledger not updated lately), the latest
    earlier month with some is ranked instead; the ``YYYY-MM`` returned names
    the month either way.
    """
    spend = without_capital_losses(
        build_transaction_query(db, user).filter(Transaction.type == TransactionType.EXPENSE),
        capital_loss_keys_for(user),
    )
    month_start = period.previous_start
    totals = _category_totals(db, spend, month_start, limit)
    if not totals:
        # Only rows a suggestion can name (blank categories are never ranked).
        latest = (
            spend.filter(Transaction.date < midnight(month_start), Transaction.category != "")
            .with_entities(func.max(Transaction.date))
            .scalar()
        )
        if latest is None:
            return None, []
        month_start = latest.date().replace(day=1)
        totals = _category_totals(db, spend, month_start, limit)
    return month_key(month_start), totals


def _category_totals(
    db: Session, spend: Query[Transaction], month_start: date, limit: int
) -> list[WatchSuggestion]:
    month_end = first_of_month(month_start, 1) - timedelta(days=1)
    rows = spend.filter(*date_range_criteria(midnight(month_start), midnight(month_end))).subquery()
    total = func.sum(rows.c.amount).label("total")
    result = (
        db.query(rows.c.category, total, func.count().label("row_count"))
        .filter(rows.c.category != "")
        .group_by(rows.c.category)
        .order_by(total.desc(), rows.c.category)
        .limit(limit)
        .all()
    )
    return [
        WatchSuggestion(
            category=row.category,
            amount=round(float(row.total), 2),
            transaction_count=row.row_count,
        )
        for row in result
        if row.total
    ]
