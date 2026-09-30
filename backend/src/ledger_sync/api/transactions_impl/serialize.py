"""Response shaping, tag lookup and the streamed CSV export."""

from __future__ import annotations

import csv
import io
import json
from collections.abc import Iterator
from typing import Any

from fastapi import HTTPException
from sqlalchemy import Row, and_, or_
from sqlalchemy.orm import Session

from ledger_sync.api.transactions_impl.filters import TxQuery, _apply_sorting, sort_column_for
from ledger_sync.db.models import Transaction, TransactionTag
from ledger_sync.schemas.transactions import TransactionResponse

# The CSV export is unpaginated (the upload validator alone accepts 100,000
# rows per file), so it streams in chunks of this many rows. One bind parameter
# per row for the chunk's tag lookup stays far under SQLite's variable cap
# (32,766) and PostgreSQL's (65,535).
EXPORT_CHUNK_ROWS = 1000

_EXPORT_HEADER = [
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
]


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


# Exactly the columns ``_to_transaction_response`` and the CSV export read, for
# the unpaginated paths that should not hydrate an ORM object per row.
_RESPONSE_COLUMNS = (
    Transaction.transaction_id,
    Transaction.date,
    Transaction.amount,
    Transaction.currency,
    Transaction.type,
    Transaction.category,
    Transaction.subcategory,
    Transaction.account,
    Transaction.from_account,
    Transaction.to_account,
    Transaction.note,
    Transaction.source_file,
    Transaction.last_seen_at,
)


def _row_to_response_dict(row: Row[Any]) -> dict[str, Any]:
    """``_to_transaction_response`` for a ``_RESPONSE_COLUMNS`` row, as a plain dict."""
    return {
        "id": row.transaction_id,
        "date": row.date.isoformat(),
        "amount": float(row.amount),
        "currency": row.currency,
        "type": row.type.value,
        "category": row.category,
        "subcategory": row.subcategory or "",
        "account": row.account,
        "from_account": row.from_account,
        "to_account": row.to_account,
        "note": row.note or "",
        "source_file": row.source_file,
        "last_seen_at": row.last_seen_at.isoformat(),
        "is_transfer": row.type.value == "Transfer",
        "tags": [],
    }


def capped_response_dicts(query: TxQuery, cap: int) -> list[dict[str, Any]]:
    """Date-desc response dicts for *query*, or 413 when more than *cap* rows match."""
    # Fetch one row past the cap: the sentinel proves the limit was exceeded
    # without paying for a COUNT(*) on every normal request. Only the response
    # columns are selected: no ORM identity-map entry per row.
    rows = (
        _apply_sorting(query, "date", "desc").with_entities(*_RESPONSE_COLUMNS).limit(cap + 1).all()
    )

    if len(rows) > cap:
        total = query.count()
        raise HTTPException(
            status_code=413,
            detail=(
                f"{total} transactions match this request, above the "
                f"{cap}-row limit of /api/transactions/all. "
                "Narrow start_date/end_date, or page through /api/transactions."
            ),
        )

    # ``response_model`` validates and serializes these dicts exactly as it did
    # the TransactionResponse objects built from ORM rows.
    return [_row_to_response_dict(row) for row in rows]


def _export_pages(
    db: Session, query: TxQuery, sort_by: str, sort_order: str
) -> Iterator[list[Row[Any]]]:
    """Keyset pages of *query* in ``_apply_sorting`` order, one short read each.

    Each page is its own ``LIMIT`` query resumed after the previous page's last
    ``(sort column, transaction_id)``, and the read transaction ends before the
    page is handed on. No transaction stays open while a slow client downloads,
    so a stream longer than PostgreSQL's idle-in-transaction timeout (60 s on
    the hosted database) is not cut off mid-file.
    """
    column = sort_column_for(sort_by)
    ordered = _apply_sorting(query, sort_by, sort_order).with_entities(*_RESPONSE_COLUMNS)
    after: tuple[Any, str] | None = None
    while True:
        page_query = ordered
        if after is not None:
            value, transaction_id = after
            if sort_order == "desc":
                resume = or_(
                    column < value,
                    and_(column == value, Transaction.transaction_id < transaction_id),
                )
            else:
                resume = or_(
                    column > value,
                    and_(column == value, Transaction.transaction_id > transaction_id),
                )
            page_query = page_query.filter(resume)
        page = page_query.limit(EXPORT_CHUNK_ROWS).all()
        if not page:
            db.commit()
            return
        yield page
        if len(page) < EXPORT_CHUNK_ROWS:
            return
        last = page[-1]
        after = (getattr(last, column.key), last.transaction_id)


def _export_csv_chunks(
    db: Session, user_id: int, query: TxQuery, sort_by: str, sort_order: str
) -> Iterator[str]:
    """Yield the export CSV one bounded chunk at a time.

    Rows arrive in ``EXPORT_CHUNK_ROWS`` pages and each page fetches only its
    own tags, so memory stays flat however large the ledger is, and the tag
    ``IN (...)`` list stays far below SQLite's and PostgreSQL's bind limits.
    Both reads finish, and their transaction commits, before the chunk is
    yielded to the client.
    """
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(_EXPORT_HEADER)
    db.commit()  # End the request's authentication read before the first send.
    yield output.getvalue()
    for chunk in _export_pages(db, query, sort_by, sort_order):
        tags_map = _tags_for_transactions(db, user_id, [row.transaction_id for row in chunk])
        db.commit()
        output = io.StringIO()
        writer = csv.writer(output)
        for row in chunk:
            writer.writerow(
                [
                    row.transaction_id,
                    row.date.isoformat(),
                    float(row.amount),
                    row.currency,
                    row.type.value,
                    row.category,
                    row.subcategory or "",
                    row.account,
                    row.from_account,
                    row.to_account,
                    row.note or "",
                    row.source_file,
                    row.last_seen_at.isoformat(),
                    # Same JSON array the API serves for this field
                    # (``TransactionResponse.tags``), so the column round-trips
                    # losslessly. A delimiter-joined string would not: tags are
                    # free strings, so any separator can legitimately appear
                    # inside a tag. Untagged rows carry "[]" rather than an empty
                    # cell so a reader can json.loads every row unconditionally.
                    json.dumps(tags_map.get(row.transaction_id, [])),
                ],
            )
        yield output.getvalue()
