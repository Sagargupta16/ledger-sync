"""Transaction API endpoints for listing, searching, and exporting transactions."""

import csv
import io
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Query as SAQuery

from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.db.models import Transaction, TransactionType
from ledger_sync.schemas.transactions import (
    TransactionResponse,
    TransactionsListResponse,
)

# Query description constants
START_DATE_DESC = "Start date (inclusive)"
END_DATE_DESC = "End date (inclusive)"

# Map of transaction type strings to TransactionType enum values
_TRANSACTION_TYPE_MAP: dict[str, TransactionType] = {
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
    min_amount: Annotated[float | None, Query(description="Minimum amount")] = None
    max_amount: Annotated[float | None, Query(description="Maximum amount")] = None
    start_date: Annotated[datetime | None, Query(description=START_DATE_DESC)] = None
    end_date: Annotated[datetime | None, Query(description=END_DATE_DESC)] = None


def _apply_search_filters(tx_query: SAQuery, filters: SearchFilters) -> SAQuery:
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


def _apply_date_and_amount_filters(tx_query: SAQuery, filters: SearchFilters) -> SAQuery:
    """Apply date range and amount range filters."""
    if filters.start_date:
        tx_query = tx_query.filter(Transaction.date >= filters.start_date)
    if filters.end_date:
        tx_query = tx_query.filter(Transaction.date <= filters.end_date)
    if filters.min_amount is not None:
        tx_query = tx_query.filter(Transaction.amount >= filters.min_amount)
    if filters.max_amount is not None:
        tx_query = tx_query.filter(Transaction.amount <= filters.max_amount)
    return tx_query


def _apply_field_filters(tx_query: SAQuery, filters: SearchFilters) -> SAQuery:
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
        tx_type = _TRANSACTION_TYPE_MAP.get(filters.type.lower())
        if tx_type is not None:
            tx_query = tx_query.filter(Transaction.type == tx_type)
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


def _apply_sorting(tx_query: SAQuery, sort_by: str, sort_order: str) -> SAQuery:
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
        return tx_query.order_by(sort_column.desc())
    return tx_query.order_by(sort_column.asc())


router = APIRouter(prefix="", tags=["transactions"])


@router.get("/api/transactions")
async def get_transactions(
    current_user: CurrentUser,
    db: DatabaseSession,
    start_date: Annotated[datetime | None, Query(description=START_DATE_DESC)] = None,
    end_date: Annotated[datetime | None, Query(description=END_DATE_DESC)] = None,
    limit: Annotated[int, Query(ge=1, le=1000, description="Maximum results to return")] = 100,
    offset: Annotated[int, Query(ge=0, description="Number of results to skip")] = 0,
) -> TransactionsListResponse:
    """Get all non-deleted transactions (including transfers) with pagination.

    Args:
        current_user: Authenticated user
        db: Database session
        start_date: Optional start date filter (inclusive)
        end_date: Optional end date filter (inclusive)
        limit: Maximum number of results to return
        offset: Number of results to skip (for pagination)

    Returns:
        Paginated list of transactions in JSON format

    """
    # Build query - filter by user
    query = db.query(Transaction).filter(
        Transaction.user_id == current_user.id,
        Transaction.is_deleted.is_(False),
    )

    # Apply date filters if provided
    if start_date:
        query = query.filter(Transaction.date >= start_date.date())
    if end_date:
        query = query.filter(Transaction.date <= end_date.date())

    # Get total count before pagination
    total = query.count()

    # Apply sorting and pagination
    transactions = query.order_by(Transaction.date.desc()).offset(offset).limit(limit).all()

    # Convert transactions to response objects
    result = [
        TransactionResponse(
            id=tx.transaction_id,
            date=tx.date.isoformat(),
            amount=float(tx.amount),
            currency=tx.currency,
            type=tx.type.value,
            category=tx.category,
            subcategory=tx.subcategory or "",
            account=tx.account,
            from_account=tx.from_account,
            to_account=tx.to_account,
            note=tx.note or "",
            source_file=tx.source_file,
            last_seen_at=tx.last_seen_at.isoformat(),
            is_transfer=tx.type.value == "Transfer",
        )
        for tx in transactions
    ]

    return TransactionsListResponse(
        data=result,
        total=total,
        limit=limit,
        offset=offset,
        has_more=offset + limit < total,
    )


@router.get("/api/transactions/all")
async def get_all_transactions(
    current_user: CurrentUser,
    db: DatabaseSession,
    start_date: Annotated[datetime | None, Query(description=START_DATE_DESC)] = None,
    end_date: Annotated[datetime | None, Query(description=END_DATE_DESC)] = None,
) -> list[TransactionResponse]:
    """Return every non-deleted transaction in a single JSON array.

    Designed for the frontend analytics layer which needs the full dataset
    for client-side aggregation. No pagination overhead — one request, one
    response.
    """
    query = db.query(Transaction).filter(
        Transaction.user_id == current_user.id,
        Transaction.is_deleted.is_(False),
    )
    if start_date:
        query = query.filter(Transaction.date >= start_date.date())
    if end_date:
        query = query.filter(Transaction.date <= end_date.date())

    transactions = query.order_by(Transaction.date.desc()).all()

    return [
        TransactionResponse(
            id=tx.transaction_id,
            date=tx.date.isoformat(),
            amount=float(tx.amount),
            currency=tx.currency,
            type=tx.type.value,
            category=tx.category,
            subcategory=tx.subcategory or "",
            account=tx.account,
            from_account=tx.from_account,
            to_account=tx.to_account,
            note=tx.note or "",
            source_file=tx.source_file,
            last_seen_at=tx.last_seen_at.isoformat(),
            is_transfer=tx.type.value == "Transfer",
        )
        for tx in transactions
    ]


@router.get("/api/transactions/search")
async def search_transactions(
    current_user: CurrentUser,
    db: DatabaseSession,
    filters: Annotated[SearchFilters, Depends()],
    limit: Annotated[int, Query(ge=1, le=1000, description="Maximum results to return")] = 100,
    offset: Annotated[int, Query(ge=0, description="Number of results to skip")] = 0,
    sort_by: Annotated[
        str,
        Query(
            pattern="^(date|amount|category|account)$",
            description="Sort field",
        ),
    ] = "date",
    sort_order: Annotated[str, Query(pattern="^(asc|desc)$", description="Sort order")] = "desc",
) -> dict[str, Any]:
    """Search and filter transactions with pagination.

    Args:
        current_user: Authenticated user
        db: Database session
        filters: Search filter parameters (query, category, subcategory, etc.)
        limit: Maximum number of results to return
        offset: Number of results to skip (for pagination)
        sort_by: Field to sort by
        sort_order: Sort direction (asc/desc)

    Returns:
        Dictionary with filtered transactions, total count, and pagination info

    """
    # Start with base query - filter by user
    tx_query = db.query(Transaction).filter(
        Transaction.user_id == current_user.id,
        Transaction.is_deleted.is_(False),
    )

    # Apply all search filters
    tx_query = _apply_search_filters(tx_query, filters)

    # Get total count before pagination
    total = tx_query.count()

    # Apply sorting and pagination
    tx_query = _apply_sorting(tx_query, sort_by, sort_order)
    transactions = tx_query.offset(offset).limit(limit).all()

    # Convert to result format
    result = [
        {
            "id": tx.transaction_id,
            "date": tx.date.isoformat(),
            "amount": float(tx.amount),
            "currency": tx.currency,
            "type": tx.type.value,
            "category": tx.category,
            "subcategory": tx.subcategory or "",
            "account": tx.account,
            "from_account": tx.from_account,
            "to_account": tx.to_account,
            "note": tx.note or "",
            "source_file": tx.source_file,
            "last_seen_at": tx.last_seen_at.isoformat(),
            "is_transfer": tx.type.value == "Transfer",
        }
        for tx in transactions
    ]

    return {
        "data": result,
        "total": total,
        "limit": limit,
        "offset": offset,
        "has_more": offset + limit < total,
    }


# --- CSV Export Endpoint ---
@router.get("/api/transactions/export")
async def export_transactions(
    current_user: CurrentUser,
    db: DatabaseSession,
    start_date: Annotated[datetime | None, Query(description=START_DATE_DESC)] = None,
    end_date: Annotated[datetime | None, Query(description=END_DATE_DESC)] = None,
):
    """Export all non-deleted transactions as CSV for the current user."""
    query = db.query(Transaction).filter(
        Transaction.user_id == current_user.id,
        Transaction.is_deleted.is_(False),
    )
    if start_date:
        query = query.filter(Transaction.date >= start_date.date())
    if end_date:
        query = query.filter(Transaction.date <= end_date.date())
    transactions = query.all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "id",
            "date",
            "amount",
            "currency",
            "type",
            "category",
            "subcategory",
            "account",
            "from_account",
            "to_account",
            "note",
            "source_file",
            "last_seen_at",
        ],
    )
    for tx in transactions:
        writer.writerow(
            [
                tx.transaction_id,
                tx.date.isoformat(),
                float(tx.amount),
                tx.currency,
                tx.type.value,
                tx.category,
                tx.subcategory or "",
                tx.account,
                tx.from_account,
                tx.to_account,
                tx.note or "",
                tx.source_file,
                tx.last_seen_at.isoformat(),
            ],
        )
    output.seek(0)
    return Response(
        content=output.read(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=transactions.csv"},
    )
