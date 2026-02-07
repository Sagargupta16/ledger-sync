"""Transaction API endpoints for listing, searching, and exporting transactions."""

import csv
import io
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ledger_sync.api.deps import CurrentUser
from ledger_sync.db.models import Transaction, TransactionType
from ledger_sync.db.session import get_session
from ledger_sync.schemas.transactions import (
    TransactionResponse,
    TransactionsListResponse,
)

# Query description constants
START_DATE_DESC = "Start date (inclusive)"
END_DATE_DESC = "End date (inclusive)"

router = APIRouter(prefix="", tags=["transactions"])


@router.get("/api/transactions", response_model=TransactionsListResponse)
async def get_transactions(
    current_user: CurrentUser,
    db: Session = Depends(get_session),
    start_date: datetime | None = Query(None, description=START_DATE_DESC),
    end_date: datetime | None = Query(None, description=END_DATE_DESC),
    limit: int = Query(100, ge=1, le=1000, description="Maximum results to return"),
    offset: int = Query(0, ge=0, description="Number of results to skip"),
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


@router.get("/api/transactions/all", response_model=list[TransactionResponse])
async def get_all_transactions(
    current_user: CurrentUser,
    db: Session = Depends(get_session),
    start_date: datetime | None = Query(None, description=START_DATE_DESC),
    end_date: datetime | None = Query(None, description=END_DATE_DESC),
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
    db: Session = Depends(get_session),
    query: str | None = Query(None, description="Search in notes, category, account"),
    category: str | None = Query(None, description="Filter by category"),
    subcategory: str | None = Query(None, description="Filter by subcategory"),
    account: str | None = Query(None, description="Filter by account"),
    type: str | None = Query(None, description="Filter by type (Income/Expense/Transfer)"),
    min_amount: float | None = Query(None, description="Minimum amount"),
    max_amount: float | None = Query(None, description="Maximum amount"),
    start_date: datetime | None = Query(None, description=START_DATE_DESC),
    end_date: datetime | None = Query(None, description=END_DATE_DESC),
    limit: int = Query(100, ge=1, le=1000, description="Maximum results to return"),
    offset: int = Query(0, ge=0, description="Number of results to skip"),
    sort_by: str = Query(
        "date",
        pattern="^(date|amount|category|account)$",
        description="Sort field",
    ),
    sort_order: str = Query("desc", pattern="^(asc|desc)$", description="Sort order"),
) -> dict[str, Any]:
    """Search and filter transactions with pagination.

    Args:
        current_user: Authenticated user
        db: Database session
        query: Text search in notes, category, account (case-insensitive)
        category: Filter by exact category match
        subcategory: Filter by exact subcategory match
        account: Filter by exact account match
        type: Filter by transaction type
        min_amount: Minimum transaction amount
        max_amount: Maximum transaction amount
        start_date: Filter transactions from this date onwards
        end_date: Filter transactions up to this date
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

    # Apply date filters
    if start_date:
        tx_query = tx_query.filter(Transaction.date >= start_date)
    if end_date:
        tx_query = tx_query.filter(Transaction.date <= end_date)

    # Apply amount filters
    if min_amount is not None:
        tx_query = tx_query.filter(Transaction.amount >= min_amount)
    if max_amount is not None:
        tx_query = tx_query.filter(Transaction.amount <= max_amount)

    # Apply category filter
    if category:
        tx_query = tx_query.filter(Transaction.category == category)

    # Apply subcategory filter
    if subcategory:
        tx_query = tx_query.filter(Transaction.subcategory == subcategory)

    # Apply account filter (for transactions: account, for transfers: from_account or to_account)
    if account:
        tx_query = tx_query.filter(
            (Transaction.account == account)
            | (Transaction.from_account == account)
            | (Transaction.to_account == account),
        )

    # Apply type filter
    if type:
        type_lower = type.lower()

        if type_lower == "income":
            tx_query = tx_query.filter(Transaction.type == TransactionType.INCOME)
        elif type_lower == "expense":
            tx_query = tx_query.filter(Transaction.type == TransactionType.EXPENSE)
        elif type_lower == "transfer":
            tx_query = tx_query.filter(Transaction.type == TransactionType.TRANSFER)

    # Apply text search filter at DB level
    if query:
        search_term = f"%{query}%"
        tx_query = tx_query.filter(
            or_(
                Transaction.note.ilike(search_term),
                Transaction.category.ilike(search_term),
                Transaction.account.ilike(search_term),
                Transaction.subcategory.ilike(search_term),
            )
        )

    # Get total count before pagination
    total = tx_query.count()

    # Apply sorting
    sort_column = getattr(Transaction, sort_by, Transaction.date)
    if sort_order == "desc":
        tx_query = tx_query.order_by(sort_column.desc())
    else:
        tx_query = tx_query.order_by(sort_column.asc())

    # Apply pagination
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
    db: Session = Depends(get_session),
    start_date: datetime | None = Query(None, description=START_DATE_DESC),
    end_date: datetime | None = Query(None, description=END_DATE_DESC),
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
