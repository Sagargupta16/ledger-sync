"""Transaction API endpoints for listing, searching, creating, and exporting transactions."""

import csv
import io
import json
from datetime import UTC, datetime
from decimal import Decimal
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel
from sqlalchemy import case, delete, exists, func, literal, or_
from sqlalchemy.orm import Query as SAQuery
from sqlalchemy.orm import Session

from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.core.query_helpers import (
    apply_excluded_accounts_filter,
    excluded_accounts_for,
    inclusive_end,
)
from ledger_sync.db.models import Transaction, TransactionTag, TransactionType, User
from ledger_sync.ingest.hash_id import TransactionHasher
from ledger_sync.schemas.transactions import (
    TagFacet,
    TransactionCreateRequest,
    TransactionFacetsResponse,
    TransactionResponse,
    TransactionsListResponse,
    TransactionTagsUpdateRequest,
)

_TxQuery = SAQuery[Transaction]

# Query description constants
START_DATE_DESC = "Start date (inclusive)"
END_DATE_DESC = "End date (inclusive)"

# Hard safety cap for the unpaginated /api/transactions/all response.
#
# Sizing, measured 2026-07-26 by serialising the maintainer's live ledger into
# the ``TransactionResponse`` shape (6,961 non-deleted rows -> 2.86 MB of JSON,
# 394 KB after gzip, i.e. ~431 B raw / ~58 B gzipped per row):
#   * 25,000 rows ~= 10.3 MB raw / ~1.4 MB gzipped. The response leaves the
#     Vercel function already gzipped, and Vercel caps a function response body
#     at 4.5 MB (https://vercel.com/docs/functions/limitations#request-body-size),
#     so this keeps ~3x headroom on that limit.
#   * It is ~3.6x the current real ledger and covers ~20 years at 100
#     transactions/month, so no existing caller is affected.
#   * The upload validator accepts 100,000 rows per file with no cross-file
#     total, so without a cap this endpoint scales to a ~41 MB response --
#     an outage, not a slow page.
#
# Exceeding the cap raises 413 instead of truncating. A truncated JSON array is
# indistinguishable from a complete one, and 14 frontend call sites feed it into
# totals, net worth and tax numbers: a silently short ledger produces confidently
# wrong money. Callers past the cap must narrow start_date/end_date or page
# through /api/transactions.
MAX_ALL_TRANSACTIONS = 25_000


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
    tag: Annotated[str | None, Query(max_length=100, description="Filter by exact tag")] = None


def _apply_search_filters(
    tx_query: _TxQuery,
    filters: SearchFilters,
) -> _TxQuery:
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


def _apply_date_and_amount_filters(
    tx_query: _TxQuery,
    filters: SearchFilters,
) -> _TxQuery:
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
    tx_query: _TxQuery,
    filters: SearchFilters,
) -> _TxQuery:
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
    tx_query: _TxQuery,
    sort_by: str,
    sort_order: str,
) -> _TxQuery:
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


def _apply_tag_filter(tx_query: _TxQuery, user_id: int, tag: str | None) -> _TxQuery:
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


def _tags_for_transactions(
    db: Session,
    user_id: int,
    transaction_ids: list[str],
) -> dict[str, list[str]]:
    """Batch-fetch tags for a page of transactions in one query.

    Returns a ``{transaction_id: [tags...]}`` map with each tag list
    sorted alphabetically. Missing ids simply have no entry.
    """
    if not transaction_ids:
        return {}
    rows = (
        db.query(TransactionTag.transaction_id, TransactionTag.tag)
        .filter(
            TransactionTag.user_id == user_id,
            TransactionTag.transaction_id.in_(transaction_ids),
        )
        .all()
    )
    tags_map: dict[str, list[str]] = {}
    for txn_id, tag in rows:
        tags_map.setdefault(txn_id, []).append(tag)
    for tag_list in tags_map.values():
        tag_list.sort()
    return tags_map


def _all_tags_for_user(db: Session, user_id: int) -> dict[str, list[str]]:
    """Batch-fetch every tag the user owns, keyed by transaction id.

    Same shape and alphabetical ordering as ``_tags_for_transactions``, but
    without an ``IN (...)`` list. The CSV export is unpaginated -- the upload
    validator alone accepts 100,000 rows per file -- and binding one parameter
    per exported row blows past SQLite's variable cap (32,766) and
    PostgreSQL's (65,535). One user-scoped scan of ``transaction_tags`` costs
    less than the ledger it annotates.
    """
    rows = (
        db.query(TransactionTag.transaction_id, TransactionTag.tag)
        .filter(TransactionTag.user_id == user_id)
        .all()
    )
    tags_map: dict[str, list[str]] = {}
    for txn_id, tag in rows:
        tags_map.setdefault(txn_id, []).append(tag)
    for tag_list in tags_map.values():
        tag_list.sort()
    return tags_map


def _to_transaction_response(
    tx: Transaction,
    tags: list[str] | None = None,
) -> TransactionResponse:
    """Convert a Transaction model to a TransactionResponse."""
    return TransactionResponse(
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
        tags=tags or [],
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
    # Build query - filter by user and date range
    query = _base_transaction_query(db, current_user)
    query = _apply_date_range(query, start_date, end_date)

    # Get total count before pagination
    total = query.count()

    # Apply sorting and pagination
    transactions = query.order_by(Transaction.date.desc()).offset(offset).limit(limit).all()

    tags_map = _tags_for_transactions(
        db, current_user.id, [tx.transaction_id for tx in transactions]
    )

    return TransactionsListResponse(
        data=[_to_transaction_response(tx, tags_map.get(tx.transaction_id)) for tx in transactions],
        total=total,
        limit=limit,
        offset=offset,
        has_more=offset + limit < total,
    )


@router.get(
    "/api/transactions/all",
    responses={
        413: {"description": f"Result set exceeds {MAX_ALL_TRANSACTIONS} rows"},
    },
)
async def get_all_transactions(
    current_user: CurrentUser,
    db: DatabaseSession,
    start_date: Annotated[datetime | None, Query(description=START_DATE_DESC)] = None,
    end_date: Annotated[datetime | None, Query(description=END_DATE_DESC)] = None,
) -> list[TransactionResponse]:
    """Return every non-deleted transaction in a single JSON array.

    Designed for the frontend analytics layer which needs the full dataset
    for client-side aggregation. No pagination overhead -- one request, one
    response.

    Capped at ``MAX_ALL_TRANSACTIONS`` rows (see that constant for the sizing
    rationale). The cap **rejects** rather than truncates: a shortened JSON
    array looks exactly like a complete one, and every caller feeds it into
    money totals. Over the cap the endpoint returns 413 with the real row count
    and a pointer to narrow the date range or page ``/api/transactions``.

    No response headers are added. An ``X-Total-Count`` set to the number of
    rows in the array duplicates ``len(body)``, and its name promises the
    unfiltered total, which it is not; a caller wanting the real total has
    ``/api/transactions`` (``total`` in the body). Nothing consumed either
    header, and cross-origin JS could not read them anyway -- the CORS layer
    sets no ``expose_headers``.
    """
    query = _base_transaction_query(db, current_user)
    query = _apply_date_range(query, start_date, end_date)

    # Fetch one row past the cap: the sentinel proves the limit was exceeded
    # without paying for a COUNT(*) on every normal request.
    transactions = query.order_by(Transaction.date.desc()).limit(MAX_ALL_TRANSACTIONS + 1).all()

    if len(transactions) > MAX_ALL_TRANSACTIONS:
        total = query.count()
        raise HTTPException(
            status_code=413,
            detail=(
                f"{total} transactions match this request, above the "
                f"{MAX_ALL_TRANSACTIONS}-row limit of /api/transactions/all. "
                "Narrow start_date/end_date, or page through /api/transactions."
            ),
        )

    return [_to_transaction_response(tx) for tx in transactions]


@router.get("/api/transactions/facets")
async def get_transaction_facets(
    current_user: CurrentUser,
    db: DatabaseSession,
) -> TransactionFacetsResponse:
    """Return dropdown options and per-type counts for the Transactions page.

    The page used to fetch every transaction three times over just to derive
    the category/account dropdowns and the Income/Expense/Transfer counts.
    This computes all of that with ``DISTINCT`` / ``GROUP BY`` so the browser
    receives a few hundred bytes instead of the whole ledger.
    """
    base = _base_transaction_query(db, current_user)

    # Categories are split by whether the label is ever used on a non-transfer
    # row. Transfers carry a routing label in `category` ("Transfer: Bank: HDFC
    # -> Stocks: Groww"), which is not a spending category at all: it is a
    # per-account-pair string, so it grows with accounts^2 and swamps the real
    # list. On the reference ledger that is 118 routing labels against 17 real
    # categories, i.e. the dropdown was 87% noise. A label used by BOTH a
    # transfer and a real row counts as real, so nothing legitimate is hidden.
    category_rows = (
        base.with_entities(
            Transaction.category,
            func.min(case((Transaction.type == TransactionType.TRANSFER, 1), else_=0)).label(
                "transfer_only"
            ),
        )
        .group_by(Transaction.category)
        .all()
    )
    categories = [row[0] for row in category_rows if row[0] and not row.transfer_only]
    transfer_categories = [row[0] for row in category_rows if row[0] and row.transfer_only]

    accounts = [
        row[0] for row in base.with_entities(Transaction.account).distinct().all() if row[0]
    ]

    count_rows = base.with_entities(Transaction.type, func.count()).group_by(Transaction.type).all()
    counts: dict[TransactionType, int] = {row[0]: row[1] for row in count_rows}

    income = counts.get(TransactionType.INCOME, 0)
    expense = counts.get(TransactionType.EXPENSE, 0)
    transfer = counts.get(TransactionType.TRANSFER, 0)

    # Tag facets: distinct tags with live-transaction counts. Joins to
    # transactions so soft-deleted rows drop out, and honours the same
    # excluded-accounts preference as the other facets.
    tag_query = (
        db.query(TransactionTag.tag, func.count())
        .join(Transaction, Transaction.transaction_id == TransactionTag.transaction_id)
        .filter(
            TransactionTag.user_id == current_user.id,
            Transaction.is_deleted.is_(False),
        )
    )
    tag_query = apply_excluded_accounts_filter(tag_query, excluded_accounts_for(current_user))
    tag_rows = tag_query.group_by(TransactionTag.tag).all()
    tag_facets = [
        TagFacet(name=name, count=count)
        for name, count in sorted(tag_rows, key=lambda r: (-r[1], r[0]))
    ]

    return TransactionFacetsResponse(
        categories=sorted(categories, key=lambda s: s.lower()),
        transfer_categories=sorted(transfer_categories, key=lambda s: s.lower()),
        accounts=sorted(accounts, key=lambda s: s.lower()),
        tags=tag_facets,
        income_count=income,
        expense_count=expense,
        transfer_count=transfer,
        total_count=income + expense + transfer,
    )


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
    tx_query = _base_transaction_query(db, current_user)

    # Apply all search filters
    tx_query = _apply_search_filters(tx_query, filters)
    tx_query = _apply_tag_filter(tx_query, current_user.id, filters.tag)

    # Get total count before pagination
    total = tx_query.count()

    # Apply sorting and pagination
    tx_query = _apply_sorting(tx_query, sort_by, sort_order)
    transactions = tx_query.offset(offset).limit(limit).all()

    tags_map = _tags_for_transactions(
        db, current_user.id, [tx.transaction_id for tx in transactions]
    )

    return {
        "data": [
            _to_transaction_response(tx, tags_map.get(tx.transaction_id)).model_dump()
            for tx in transactions
        ],
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
    filters: Annotated[SearchFilters, Depends()],
) -> Response:
    """Export the current user's non-deleted transactions as CSV.

    Takes the same ``SearchFilters`` dependency as
    ``/api/transactions/search`` and applies the same helpers in the same
    order, so the file matches the table the user is looking at. It
    previously declared only ``start_date``/``end_date``: every other filter
    (type, category, account, tag, amount range, free text) was accepted by
    the HTTP layer and then dropped, so filtering to one type and clicking
    Export silently downloaded the entire ledger -- measured on the
    maintainer's data as 6,961 exported rows against 726 shown.

    ``start_date``/``end_date`` are unchanged: ``SearchFilters`` already
    carries both, and ``_apply_date_and_amount_filters`` applies exactly the
    bounds ``_apply_date_range`` did (``>= start``, ``<= inclusive_end(end)``).
    """
    query = _base_transaction_query(db, current_user)
    query = _apply_search_filters(query, filters)
    query = _apply_tag_filter(query, current_user.id, filters.tag)
    transactions = query.all()

    tags_map = _all_tags_for_user(db, current_user.id)

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
            "tags",
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
                # Same JSON array the API serves for this field
                # (``TransactionResponse.tags``), so the column round-trips
                # losslessly. A delimiter-joined string would not: tags are
                # free strings, so any separator can legitimately appear
                # inside a tag. Untagged rows carry "[]" rather than an empty
                # cell so a reader can json.loads every row unconditionally.
                json.dumps(tags_map.get(tx.transaction_id, [])),
            ],
        )
    output.seek(0)
    return Response(
        content=output.read(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=transactions.csv"},
    )


# --- Quick-Add Transaction Endpoint ---

# Shared hasher instance (stateless, safe to reuse)
_hasher = TransactionHasher()


@router.post(
    "/api/transactions",
    status_code=201,
    responses={
        201: {"description": "Transaction created successfully"},
        400: {"description": "Invalid transaction data"},
        409: {"description": "Duplicate transaction already exists"},
    },
)
async def create_transaction(
    current_user: CurrentUser,
    db: DatabaseSession,
    body: TransactionCreateRequest,
) -> TransactionResponse:
    """Manually create a single transaction.

    Generates a deterministic transaction ID using the same hashing logic
    as the file-import pipeline, and sets ``source_file`` to
    ``"manual_entry"``.

    Args:
        current_user: Authenticated user
        db: Database session
        body: Transaction data

    Returns:
        The newly created transaction

    Raises:
        HTTPException: If the transaction type is invalid or a duplicate exists

    """
    # Map string type to enum
    tx_type = _TRANSACTION_TYPE_MAP.get(body.type.lower())
    if tx_type is None:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid transaction type: {body.type}. "
            "Expected one of: Income, Expense, Transfer.",
        )

    now = datetime.now(UTC)
    amount = Decimal(str(round(body.amount, 2)))

    # Generate deterministic transaction ID (same logic as ingest pipeline)
    transaction_id = _hasher.generate_transaction_id(
        date=body.date,
        amount=amount,
        account=body.account,
        note=body.note,
        category=body.category,
        subcategory=body.subcategory,
        tx_type=body.type,
        user_id=current_user.id,
    )

    # Check for duplicate
    existing = db.get(Transaction, transaction_id)
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail="A transaction with identical fields already exists.",
        )

    transaction = Transaction(
        transaction_id=transaction_id,
        user_id=current_user.id,
        date=body.date,
        amount=amount,
        currency="INR",
        type=tx_type,
        category=body.category,
        subcategory=body.subcategory,
        account=body.account,
        from_account=body.from_account,
        to_account=body.to_account,
        note=body.note,
        source_file="manual_entry",
        last_seen_at=now,
        created_at=now,
        updated_at=now,
        is_deleted=False,
    )

    db.add(transaction)
    db.commit()
    db.refresh(transaction)

    return _to_transaction_response(transaction)


# --- Transaction Tags Endpoint ---


@router.put(
    "/api/transactions/{transaction_id}/tags",
    responses={
        404: {"description": "Transaction not found"},
        422: {"description": "Validation error"},
    },
)
async def set_transaction_tags(
    transaction_id: str,
    payload: TransactionTagsUpdateRequest,
    current_user: CurrentUser,
    db: DatabaseSession,
) -> dict[str, Any]:
    """Replace the full tag list of a transaction.

    Replace-all semantics: an empty list clears every tag. Tags are
    trimmed, empties dropped, exact duplicates removed (order preserved).
    Tags are case-sensitive and do NOT feed the dedup hash, so setting
    them never changes the transaction_id.

    Args:
        transaction_id: 64-char transaction id
        payload: Full replacement tag list
        current_user: Authenticated user
        db: Database session

    Returns:
        The normalized stored tag list, in stored order

    Raises:
        HTTPException: 404 when the transaction doesn't exist for this
            user (or is soft-deleted); 422 on tag length/count violations

    """
    transaction = (
        db.query(Transaction)
        .filter(
            Transaction.transaction_id == transaction_id,
            Transaction.user_id == current_user.id,
            Transaction.is_deleted.is_(False),
        )
        .first()
    )
    if transaction is None:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # Normalize: trim, drop empties, reject overlong, dedupe preserving order.
    tags: list[str] = []
    for raw in payload.tags:
        tag = raw.strip()
        if not tag:
            continue
        if len(tag) > 50:
            raise HTTPException(
                status_code=422,
                detail=f"Tag exceeds 50 characters: {tag[:50]}...",
            )
        if tag not in tags:
            tags.append(tag)
    if len(tags) > 10:
        raise HTTPException(status_code=422, detail="A transaction can have at most 10 tags")

    db.execute(
        delete(TransactionTag).where(
            TransactionTag.user_id == current_user.id,
            TransactionTag.transaction_id == transaction_id,
        )
    )
    for tag in tags:
        db.add(
            TransactionTag(
                user_id=current_user.id,
                transaction_id=transaction_id,
                tag=tag,
            )
        )
    db.commit()

    return {"transaction_id": transaction_id, "tags": tags}
