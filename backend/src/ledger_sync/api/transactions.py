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
from ledger_sync.api.transaction_pagination import (
    MAX_CURSOR_LENGTH,
    TransactionsPageResponse,
    cursor_context,
    transaction_page,
)
from ledger_sync.core.analytics.refresh import lock_analytics_user, mark_ledger_changed
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
    TransactionTagsUpdateRequest,
)
from ledger_sync.services.ledger_dimensions import sync_transaction_dimensions

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
        return tx_query.order_by(sort_column.desc(), Transaction.transaction_id.desc())
    return tx_query.order_by(sort_column.asc(), Transaction.transaction_id.asc())


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
def get_transactions(
    current_user: CurrentUser,
    db: DatabaseSession,
    start_date: Annotated[datetime | None, Query(description=START_DATE_DESC)] = None,
    end_date: Annotated[datetime | None, Query(description=END_DATE_DESC)] = None,
    limit: Annotated[int, Query(ge=1, le=1000, description="Maximum results to return")] = 100,
    offset: Annotated[int, Query(ge=0, description="Number of results to skip")] = 0,
    cursor: Annotated[
        str | None,
        Query(
            min_length=1,
            max_length=MAX_CURSOR_LENGTH,
            description="Signed next_cursor; omit offset",
        ),
    ] = None,
) -> TransactionsPageResponse:
    """Get all non-deleted transactions (including transfers) with pagination.

    For date/ID keyset traversal, pass the returned ``next_cursor`` and omit
    ``offset``. Keep the same date filters. ``total`` remains an exact current
    count; cursor offsets track rows traversed, not ranks after ledger edits.
    Cursors do not freeze the ledger across requests.

    Args:
        current_user: Authenticated user
        db: Database session
        start_date: Optional start date filter (inclusive)
        end_date: Optional end date filter (inclusive)
        limit: Maximum number of results to return
        offset: Number of results to skip (for pagination)
        cursor: Optional continuation returned by an earlier date-sorted page

    Returns:
        Paginated list of transactions in JSON format

    """
    # Build query - filter by user and date range
    query = _base_transaction_query(db, current_user)
    query = _apply_date_range(query, start_date, end_date)

    transactions, total, page_offset, has_more, next_cursor = transaction_page(
        _apply_sorting(query, "date", "desc"),
        limit=limit,
        offset=offset,
        cursor=cursor,
        context=_transaction_cursor_context(
            current_user, SearchFilters(start_date=start_date, end_date=end_date), "desc"
        ),
    )

    tags_map = _tags_for_transactions(
        db, current_user.id, [tx.transaction_id for tx in transactions]
    )

    return TransactionsPageResponse(
        data=[_to_transaction_response(tx, tags_map.get(tx.transaction_id)) for tx in transactions],
        total=total,
        limit=limit,
        offset=page_offset,
        has_more=has_more,
        next_cursor=next_cursor,
    )


@router.get(
    "/api/transactions/all",
    responses={
        413: {"description": f"Result set exceeds {MAX_ALL_TRANSACTIONS} rows"},
    },
)
def get_all_transactions(
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
    transactions = _apply_sorting(query, "date", "desc").limit(MAX_ALL_TRANSACTIONS + 1).all()

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
def get_transaction_facets(
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
def search_transactions(
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
    cursor: Annotated[
        str | None,
        Query(
            min_length=1,
            max_length=MAX_CURSOR_LENGTH,
            description="Signed next_cursor for date sort; omit offset",
        ),
    ] = None,
) -> dict[str, Any]:
    """Search and filter transactions with pagination.

    ``next_cursor`` is available for date sorting in either direction. Pass
    it with the same filters and sort direction, omitting ``offset``. Other
    sorts retain offset pagination. A cursor is not a ledger snapshot:
    editing sort/filter fields can move rows across its boundary.

    Args:
        current_user: Authenticated user
        db: Database session
        filters: Search filter parameters (query, category, subcategory, etc.)
        limit: Maximum number of results to return
        offset: Number of results to skip (for pagination)
        sort_by: Field to sort by
        sort_order: Sort direction (asc/desc)
        cursor: Optional continuation returned by an earlier date-sorted page

    Returns:
        Dictionary with filtered transactions, total count, and pagination info

    """
    # Start with base query - filter by user
    tx_query = _base_transaction_query(db, current_user)

    # Apply all search filters
    tx_query = _apply_search_filters(tx_query, filters)
    tx_query = _apply_tag_filter(tx_query, current_user.id, filters.tag)

    transactions, total, page_offset, has_more, next_cursor = transaction_page(
        _apply_sorting(tx_query, sort_by, sort_order),
        limit=limit,
        offset=offset,
        cursor=cursor,
        context=(
            _transaction_cursor_context(current_user, filters, sort_order)
            if sort_by == "date"
            else None
        ),
        sort_order=sort_order,
    )

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
        "offset": page_offset,
        "has_more": has_more,
        "next_cursor": next_cursor,
    }


# --- CSV Export Endpoint ---
@router.get("/api/transactions/export")
def export_transactions(
    current_user: CurrentUser,
    db: DatabaseSession,
    filters: Annotated[SearchFilters, Depends()],
    sort_by: Annotated[str, Query(pattern="^(date|amount|category|account)$")] = "date",
    sort_order: Annotated[str, Query(pattern="^(asc|desc)$")] = "desc",
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
    transactions = _apply_sorting(query, sort_by, sort_order).all()

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


def _manual_duplicate_exists(
    db: Session, fingerprint: str, identity_fields: dict[str, Any], *, legacy_account: str
) -> bool:
    """Recognize legacy manual rows without trusting ambiguous v1 field boundaries."""
    # The former manual API hashed the display account even for transfers.
    legacy_id = _hasher.generate_transaction_id(
        **{**identity_fields, "account": legacy_account}, version=1
    )
    candidates = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == identity_fields["user_id"],
            or_(
                Transaction.transaction_id == fingerprint,
                Transaction.source_fingerprint == fingerprint,
                (Transaction.transaction_id == legacy_id)
                & Transaction.source_fingerprint.is_(None),
            ),
        )
        .all()
    )
    # Two primary-key candidates and one user-unique fingerprint at most.
    for candidate in candidates:
        if candidate.transaction_id == fingerprint or candidate.source_fingerprint == fingerprint:
            return True
        candidate_fingerprint = _hasher.generate_transaction_id(
            # The matching legacy ID already binds the original submitted date
            # encoding; storage may have discarded its timezone.
            date=identity_fields["date"],
            amount=candidate.amount,
            account=(
                candidate.from_account or candidate.account
                if candidate.type == TransactionType.TRANSFER
                else candidate.account
            ),
            note=candidate.note,
            category=candidate.category,
            subcategory=candidate.subcategory,
            tx_type=candidate.type.value,
            user_id=candidate.user_id,
            to_account=candidate.to_account if candidate.type == TransactionType.TRANSFER else None,
            currency=candidate.currency,
        )
        if candidate_fingerprint == fingerprint:
            return True
    return False


@router.post(
    "/api/transactions",
    status_code=201,
    responses={
        201: {"description": "Transaction created successfully"},
        400: {"description": "Invalid transaction data"},
        409: {"description": "Duplicate transaction already exists"},
    },
)
def create_transaction(
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
    identity_fields: dict[str, Any] = {
        "date": body.date,
        "amount": amount,
        "account": (
            body.from_account or body.account
            if tx_type == TransactionType.TRANSFER
            else body.account
        ),
        "note": body.note,
        "category": body.category,
        "subcategory": body.subcategory,
        "tx_type": body.type,
        "user_id": current_user.id,
        "to_account": body.to_account if tx_type == TransactionType.TRANSFER else None,
        "currency": "INR",
    }
    transaction_id = _hasher.generate_transaction_id(**identity_fields)

    # Serialize with imports and refresh before reading or changing this ledger.
    lock_analytics_user(db, current_user.id)
    if _manual_duplicate_exists(db, transaction_id, identity_fields, legacy_account=body.account):
        raise HTTPException(
            status_code=409,
            detail="A transaction with identical fields already exists.",
        )

    transaction = Transaction(
        transaction_id=transaction_id,
        source_fingerprint=transaction_id,
        fingerprint_version=2,
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

    sync_transaction_dimensions(db, transaction)
    db.add(transaction)
    # DateTime stores the submitted wall-clock day without a timezone.
    mark_ledger_changed(db, current_user.id, [transaction.date.date()])
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
def set_transaction_tags(
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
