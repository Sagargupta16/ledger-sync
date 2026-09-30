"""Transaction API endpoints for listing, searching, creating, and exporting transactions.

Routes only. Filters/sorting live in ``transactions_impl.filters``, response
shaping and the CSV stream in ``transactions_impl.serialize``, facets in
``transactions_impl.facets`` and the two writes in ``transactions_impl.writes``.
"""

from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Response
from fastapi.responses import StreamingResponse

from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.api.transaction_pagination import (
    MAX_CURSOR_LENGTH,
    TransactionsPageResponse,
    transaction_page,
)
from ledger_sync.api.transactions_impl.facets import transaction_facets
from ledger_sync.api.transactions_impl.filters import (
    END_DATE_DESC,
    START_DATE_DESC,
    SearchFilters,
    _apply_date_range,
    _apply_search_filters,
    _apply_sorting,
    _apply_tag_filter,
    _base_transaction_query,
    _transaction_cursor_context,
)
from ledger_sync.api.transactions_impl.serialize import (
    _export_csv_chunks,
    _tags_for_transactions,
    _to_transaction_response,
    capped_response_dicts,
)
from ledger_sync.api.transactions_impl.writes import (
    create_manual_transaction,
    replace_transaction_tags,
)
from ledger_sync.schemas.transactions import (
    TransactionCreateRequest,
    TransactionFacetsResponse,
    TransactionResponse,
    TransactionTagsUpdateRequest,
)

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
    response_model=list[TransactionResponse],
    responses={
        413: {"description": f"Result set exceeds {MAX_ALL_TRANSACTIONS} rows"},
    },
)
def get_all_transactions(
    current_user: CurrentUser,
    db: DatabaseSession,
    start_date: Annotated[datetime | None, Query(description=START_DATE_DESC)] = None,
    end_date: Annotated[datetime | None, Query(description=END_DATE_DESC)] = None,
) -> list[dict[str, Any]]:
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
    # The cap is read here, at call time, so it stays one module-level knob.
    return capped_response_dicts(query, MAX_ALL_TRANSACTIONS)


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
    return transaction_facets(db, current_user)


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

    The body streams in ``EXPORT_CHUNK_ROWS`` keyset pages, each read in its
    own short transaction (see ``_export_csv_chunks``).
    """
    query = _base_transaction_query(db, current_user)
    query = _apply_search_filters(query, filters)
    query = _apply_tag_filter(query, current_user.id, filters.tag)
    return StreamingResponse(
        _export_csv_chunks(db, current_user.id, query, sort_by, sort_order),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=transactions.csv"},
    )


# --- Quick-Add Transaction Endpoint ---


@router.post(
    "/api/transactions",
    status_code=201,
    responses={
        201: {"description": "Transaction created successfully"},
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
        HTTPException: 409 if a transaction with identical fields exists

    """
    return create_manual_transaction(db, current_user, body)


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
    tags = replace_transaction_tags(db, current_user, transaction_id, payload.tags)
    return {"transaction_id": transaction_id, "tags": tags}
