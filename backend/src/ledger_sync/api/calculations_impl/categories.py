"""Category-shaped reads for the calculations router."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Query as SAQuery
from sqlalchemy.orm import Session

from ledger_sync.api.calculations_helpers import (
    _build_category_data_from_rows,
    _build_category_data_from_trends,
)
from ledger_sync.core.expense_class import capital_loss_sql_filter
from ledger_sync.core.query_helpers import (
    build_transaction_query,
    capital_loss_keys_for,
    fmt_date,
)
from ledger_sync.db.models import CategoryTrend, Transaction, TransactionType, User


def without_capital_losses(
    query: SAQuery[Transaction], user: User, tx_type: TransactionType
) -> SAQuery[Transaction]:
    """Drop the user's classified realised-loss rows from an EXPENSE query.

    Keeps the date-filtered paths in agreement with ``CategoryTrend`` (and the
    no-date fast path built from it), which never counts a realised loss as a
    spending category. Income queries and users who classified nothing are
    returned unchanged.
    """
    if tx_type != TransactionType.EXPENSE:
        return query
    not_a_loss = capital_loss_sql_filter(capital_loss_keys_for(user))
    return query if not_a_loss is None else query.filter(not_a_loss)


def master_categories(db: Session, user: User) -> dict[str, dict[str, list[str]]]:
    """Distinct categories -> sorted subcategories, per income/expense type."""
    result: dict[str, dict[str, list[str]]] = {
        "income": {},
        "expense": {},
    }

    # Use SELECT DISTINCT to fetch only unique (type, category, subcategory) tuples
    rows = (
        db.query(
            Transaction.type,
            Transaction.category,
            Transaction.subcategory,
        )
        .filter(
            Transaction.user_id == user.id,
            Transaction.is_deleted.is_(False),
            Transaction.type.in_([TransactionType.INCOME, TransactionType.EXPENSE]),
        )
        .distinct()
        .all()
    )

    for tx_type, category, subcategory in rows:
        type_key = "income" if tx_type == TransactionType.INCOME else "expense"
        cat = category or "Uncategorized"
        subcat = subcategory or "Other"

        if cat not in result[type_key]:
            result[type_key][cat] = []

        if subcat not in result[type_key][cat]:
            result[type_key][cat].append(subcat)

    # Sort subcategories for consistency
    for tx_type in result:
        for category in result[tx_type]:
            result[tx_type][category].sort()
        # Sort categories alphabetically
        sorted_categories = dict(sorted(result[tx_type].items()))
        result[tx_type] = sorted_categories

    return result


def category_breakdown(
    db: Session,
    user: User,
    start_date: datetime | None,
    end_date: datetime | None,
    tx_type: TransactionType,
) -> dict[str, Any]:
    """Category/subcategory totals with shares; CategoryTrend when unfiltered."""
    # Fast path: aggregate from category_trends when no date filter
    if start_date is None and end_date is None:
        trends = (
            db.query(CategoryTrend)
            .filter(
                CategoryTrend.user_id == user.id,
                CategoryTrend.transaction_type == tx_type,
            )
            .all()
        )
        if trends:
            return _build_category_data_from_trends(trends)

    # Fallback: compute from raw transactions with date filters
    query = build_transaction_query(db, user, start_date, end_date).filter(
        Transaction.type == tx_type
    )
    query = without_capital_losses(query, user, tx_type)

    base = query.subquery()
    cat_col = func.coalesce(base.c.category, "Uncategorized")
    subcat_col = func.coalesce(base.c.subcategory, "Other")

    rows = (
        db.query(
            cat_col.label("category"),
            subcat_col.label("subcategory"),
            func.coalesce(func.sum(base.c.amount), 0).label("total"),
            func.count().label("count"),
        )
        .group_by(cat_col, subcat_col)
        .all()
    )

    return _build_category_data_from_rows(rows)


def income_facets(db: Session, user: User) -> dict[str, list[dict[str, Any]]]:
    """Every income ``(category, subcategory)`` bucket with its count and sum."""
    base = build_transaction_query(db, user).subquery()
    cat_col = func.coalesce(base.c.category, "Uncategorized")
    subcat_col = func.coalesce(base.c.subcategory, "Other")

    rows = (
        db.query(
            cat_col.label("category"),
            subcat_col.label("subcategory"),
            func.coalesce(func.sum(base.c.amount), 0).label("total"),
            func.count().label("count"),
        )
        .filter(base.c.type == TransactionType.INCOME)
        .group_by(cat_col, subcat_col)
        .all()
    )

    return {
        "facets": [
            {
                "category": row.category,
                "subcategory": row.subcategory,
                # Income amounts are stored positive, but abs() keeps a
                # sign-flipped correction row from subtracting from its bucket.
                "total": abs(float(row.total)),
                "count": row.count,
            }
            for row in rows
        ],
    }


def category_daily_series(
    db: Session,
    user: User,
    start_date: datetime | None,
    end_date: datetime | None,
    tx_type: TransactionType,
    category: str | None,
) -> dict[str, Any]:
    """Daily ``(date, category, subcategory)`` absolute sums."""
    query = build_transaction_query(db, user, start_date, end_date).filter(
        Transaction.type == tx_type
    )
    query = without_capital_losses(query, user, tx_type)
    if category:
        query = query.filter(Transaction.category == category)

    base = query.subquery()
    day_col = fmt_date(base.c.date).label("day")
    cat_col = func.coalesce(base.c.category, "Uncategorized").label("category")
    sub_col = func.coalesce(base.c.subcategory, "Other").label("subcategory")

    rows = (
        db.query(
            day_col,
            cat_col,
            sub_col,
            func.coalesce(func.sum(func.abs(base.c.amount)), 0).label("amount"),
            func.count().label("count"),
        )
        .group_by(day_col, cat_col, sub_col)
        .all()
    )

    return {
        "data": [
            {
                "date": r.day,
                "category": r.category,
                "subcategory": r.subcategory,
                "amount": float(r.amount),
            }
            for r in rows
        ],
        "transaction_count": sum(r.count for r in rows),
    }


def top_categories(
    db: Session,
    user: User,
    start_date: datetime | None,
    end_date: datetime | None,
    *,
    limit: int,
    tx_type: TransactionType,
) -> list[dict[str, Any]]:
    """Top *limit* categories by amount, each with its share of the grand total."""
    query = build_transaction_query(db, user, start_date, end_date).filter(
        Transaction.type == tx_type
    )
    query = without_capital_losses(query, user, tx_type)

    base = query.subquery()
    cat_col = func.coalesce(base.c.category, "Uncategorized").label("category")

    rows = (
        db.query(
            cat_col,
            func.coalesce(func.sum(base.c.amount), 0).label("amount"),
            func.count().label("count"),
        )
        .group_by(cat_col)
        .order_by(func.sum(base.c.amount).desc())
        .limit(limit)
        .all()
    )

    # We need the grand total (not just top-N total) for accurate percentages.
    grand_total_row = db.query(
        func.coalesce(func.sum(base.c.amount), 0).label("grand_total"),
    ).one()
    grand_total = float(grand_total_row.grand_total)

    return [
        {
            "category": row.category,
            "amount": float(row.amount),
            "percentage": (float(row.amount) / grand_total * 100) if grand_total > 0 else 0,
            "count": row.count,
        }
        for row in rows
    ]
