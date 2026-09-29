"""Search filters, date bounds, sorting and the user-scoped base query."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import Query
from pydantic import BaseModel
from sqlalchemy import exists, literal, or_
from sqlalchemy.orm import Query as SAQuery
from sqlalchemy.orm import Session

from ledger_sync.api.transaction_pagination import cursor_context
from ledger_sync.core.query_helpers import (
    apply_excluded_accounts_filter,
    excluded_accounts_for,
    inclusive_end,
)
from ledger_sync.db.models import Transaction, TransactionTag, TransactionType, User

TxQuery = SAQuery[Transaction]

# Query description constants
START_DATE_DESC = "Start date (inclusive)"
END_DATE_DESC = "End date (inclusive)"

# Map of transaction type strings to TransactionType enum values
TRANSACTION_TYPE_MAP: dict[str, TransactionType] = {
    "income": TransactionType.INCOME,
    "expense": TransactionType.EXPENSE,
    "transfer": TransactionType.TRANSFER,
}


class SearchFilters(BaseModel):
    """Query parameters for filtering transactions in the search endpoint."""

    model_config = {"extra": "forbid"}

    query: Annotated[str | None, Query(description="Search in notes, category, account")] = None
    category: Annotated[str | None, Query(description="Filter by category")] = None
    subcategory: Annotated[str | None, Query(description="Filter by subcategory")] = None
    account: Annotated[str | None, Query(description="Filter by account")] = None
    type: Annotated[str | None, Query(description="Filter by type (Income/Expense/Transfer)")] = (
        None
    )
    min_amount: Annotated[
        float | None, Query(allow_inf_nan=False, description="Minimum amount")
    ] = None
    max_amount: Annotated[
        float | None, Query(allow_inf_nan=False, description="Maximum amount")
    ] = None
    start_date: Annotated[datetime | None, Query(description=START_DATE_DESC)] = None
    end_date: Annotated[datetime | None, Query(description=END_DATE_DESC)] = None
    tag: Annotated[str | None, Query(max_length=100, description="Filter by exact tag")] = None


def _apply_search_filters(
    tx_query: TxQuery,
    filters: SearchFilters,
) -> TxQuery:
    """Apply all search filters from a SearchFilters instance to a SQLAlchemy query.

    Handles date range, amount range, category, subcategory, account,
    transaction type, and free-text search filters.

    Args:
        tx_query: Base SQLAlchemy query to filter
        filters: Validated search filter parameters

    Returns:
        Filtered SQLAlchemy query

    """
    tx_query = _apply_date_and_amount_filters(tx_query, filters)
    tx_query = _apply_field_filters(tx_query, filters)
    return tx_query


def _transaction_cursor_context(user: User, filters: SearchFilters, sort_order: str) -> str:
    """Normalize no-op filters, type casing, and inclusive date bounds for signing."""
    effective = filters.model_dump(mode="json")
    for field in ("query", "category", "subcategory", "account", "tag"):
        effective[field] = effective[field] or None
    effective["type"] = filters.type.lower() if filters.type else None
    for field in ("min_amount", "max_amount"):
        if effective[field] == 0:
            effective[field] = 0.0  # SQL compares negative and positive zero equally.
    if filters.end_date is not None:
        effective["end_date"] = inclusive_end(filters.end_date).isoformat()
    return cursor_context(
        {
            "user_id": user.id,
            "excluded_accounts": sorted(excluded_accounts_for(user)),
            "filters": effective,
            "sort_order": sort_order,
        }
    )


def _apply_date_and_amount_filters(
    tx_query: TxQuery,
    filters: SearchFilters,
) -> TxQuery:
    """Apply date range and amount range filters."""
    if filters.start_date:
        tx_query = tx_query.filter(Transaction.date >= filters.start_date)
    if filters.end_date:
        tx_query = tx_query.filter(Transaction.date <= inclusive_end(filters.end_date))
    if filters.min_amount is not None:
        tx_query = tx_query.filter(Transaction.amount >= filters.min_amount)
    if filters.max_amount is not None:
        tx_query = tx_query.filter(Transaction.amount <= filters.max_amount)
    return tx_query


def _apply_field_filters(
    tx_query: TxQuery,
    filters: SearchFilters,
) -> TxQuery:
    """Apply category, subcategory, account, type, and text search filters."""
    if filters.category:
        tx_query = tx_query.filter(Transaction.category == filters.category)
    if filters.subcategory:
        tx_query = tx_query.filter(Transaction.subcategory == filters.subcategory)
    if filters.account:
        tx_query = tx_query.filter(
            (Transaction.account == filters.account)
            | (Transaction.from_account == filters.account)
            | (Transaction.to_account == filters.account),
        )
    if filters.type:
        tx_type = TRANSACTION_TYPE_MAP.get(filters.type.lower())
        if tx_type is not None:
            tx_query = tx_query.filter(Transaction.type == tx_type)
        else:
            tx_query = tx_query.filter(literal(False))  # Invalid type returns empty
    if filters.query:
        search_term = f"%{filters.query}%"
        tx_query = tx_query.filter(
            or_(
                Transaction.note.ilike(search_term),
                Transaction.category.ilike(search_term),
                Transaction.account.ilike(search_term),
                Transaction.subcategory.ilike(search_term),
            )
        )
    return tx_query


def _apply_sorting(
    tx_query: TxQuery,
    sort_by: str,
    sort_order: str,
) -> TxQuery:
    """Apply column sorting to a SQLAlchemy query.

    Args:
        tx_query: SQLAlchemy query to sort
        sort_by: Column name to sort by (date, amount, category, account)
        sort_order: Sort direction ('asc' or 'desc')

    Returns:
        Sorted SQLAlchemy query

    """
    sort_column_map = {
        "date": Transaction.date,
        "amount": Transaction.amount,
        "category": Transaction.category,
        "account": Transaction.account,
    }
    sort_column = sort_column_map.get(sort_by, Transaction.date)
    if sort_order == "desc":
        return tx_query.order_by(sort_column.desc(), Transaction.transaction_id.desc())
    return tx_query.order_by(sort_column.asc(), Transaction.transaction_id.asc())


def _apply_tag_filter(tx_query: TxQuery, user_id: int, tag: str | None) -> TxQuery:
    """Filter to transactions carrying *tag* via an EXISTS subquery.

    Exact string match, DB-agnostic. No-op when *tag* is unset.
    """
    if not tag:
        return tx_query
    return tx_query.filter(
        exists().where(
            (TransactionTag.user_id == user_id)
            & (TransactionTag.transaction_id == Transaction.transaction_id)
            & (TransactionTag.tag == tag)
        )
    )


def _base_transaction_query(db: Session, user: User) -> SAQuery[Transaction]:
    """Create base query for non-deleted, non-excluded transactions for user.

    Honours the user's ``excluded_accounts`` preference via
    ``excluded_accounts_for`` so the raw transactions endpoints stay
    consistent with the analytics pipeline.
    """
    query = db.query(Transaction).filter(
        Transaction.user_id == user.id,
        Transaction.is_deleted.is_(False),
    )
    return apply_excluded_accounts_filter(query, excluded_accounts_for(user))


def _apply_date_range(
    query: SAQuery[Transaction],
    start_date: datetime | None,
    end_date: datetime | None,
) -> SAQuery[Transaction]:
    """Apply explicit date-range filters to a transaction query.

    Earning-start is deliberately NOT applied here: transactions
    endpoints return factual raw data, and the caller supplies the
    window it wants. View-layer clamping belongs on the client.
    """
    if start_date:
        query = query.filter(Transaction.date >= start_date)
    if end_date:
        query = query.filter(Transaction.date <= inclusive_end(end_date))
    return query
