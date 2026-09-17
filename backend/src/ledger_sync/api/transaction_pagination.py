"""Bounded, signed date cursors and count-aware transaction pagination."""

import base64
import hashlib
import hmac
import json
import re
from datetime import datetime
from typing import Any, Literal

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import tuple_
from sqlalchemy.orm import Query

from ledger_sync.config.settings import settings
from ledger_sync.db.models import Transaction
from ledger_sync.schemas.transactions import TransactionsListResponse

MAX_CURSOR_LENGTH = 1024
_CURSOR_DOMAIN = b"ledger-sync:transaction-page:v1:"


class TransactionsPageResponse(TransactionsListResponse):
    """Existing offset response with an optional date-pagination continuation."""

    next_cursor: str | None = None


class _DateCursor(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    version: Literal[1] = 1
    context: str = Field(pattern=r"^[0-9a-f]{64}$")
    date: datetime
    transaction_id: str = Field(min_length=1, max_length=64)
    offset: int = Field(ge=0, le=2**63 - 1)

    @field_validator("date")
    @classmethod
    def naive_ledger_date(cls, value: datetime) -> datetime:
        """Seek with the same naive wall-clock values stored in Transaction.date."""
        if value.tzinfo is not None:
            raise ValueError("Cursor date must be a naive ledger timestamp")
        return value


def cursor_context(values: dict[str, Any]) -> str:
    """Bind a cursor to canonical effective filters without embedding their text."""
    encoded = json.dumps(values, sort_keys=True, separators=(",", ":"), allow_nan=False)
    return hashlib.sha256(encoded.encode()).hexdigest()


def _signature(payload: str) -> str:
    return hmac.new(
        settings.jwt_secret_key.encode(),
        _CURSOR_DOMAIN + payload.encode("ascii"),
        hashlib.sha256,
    ).hexdigest()


def _encode_cursor(transaction: Transaction, context: str, offset: int) -> str:
    cursor = _DateCursor(
        context=context,
        date=transaction.date,
        transaction_id=transaction.transaction_id,
        offset=offset,
    )
    payload = base64.urlsafe_b64encode(cursor.model_dump_json().encode()).decode().rstrip("=")
    return f"{payload}.{_signature(payload)}"


def _decode_cursor(token: str, context: str) -> _DateCursor:
    try:
        if len(token) > MAX_CURSOR_LENGTH or not re.fullmatch(
            r"[A-Za-z0-9_-]+\.[0-9a-f]{64}", token
        ):
            raise ValueError("Invalid cursor encoding")
        payload, signature = token.split(".")
        if not hmac.compare_digest(_signature(payload), signature):
            raise ValueError("Invalid cursor signature")
        decoded = base64.b64decode(
            payload + "=" * (-len(payload) % 4), altchars=b"-_", validate=True
        )
        cursor = _DateCursor.model_validate_json(decoded)
        if not hmac.compare_digest(cursor.context, context):
            raise ValueError("Cursor context changed")
        return cursor
    except ValueError as exc:
        raise HTTPException(
            status_code=422, detail="Invalid cursor for these transaction filters"
        ) from exc


def transaction_page(
    query: Query[Transaction],
    *,
    limit: int,
    offset: int,
    cursor: str | None,
    context: str | None,
    sort_order: str = "desc",
) -> tuple[list[Transaction], int, int, bool, str | None]:
    """Fetch a page, counting only when its exact total cannot be inferred.

    ``query`` includes the full filter and deterministic order. Date cursors
    seek by (date, transaction_id); their offset records traversal progress,
    not the current rank after intervening ledger mutations. Totals are always
    current full-filter counts. Cursors are continuations, not snapshots:
    editing a row's date or filters can move it across the boundary.
    """
    page_query = query
    if cursor is not None:
        if context is None or offset:
            raise HTTPException(
                status_code=422,
                detail="A cursor requires date sorting and offset=0",
            )
        boundary = _decode_cursor(cursor, context)
        position = tuple_(Transaction.date, Transaction.transaction_id)
        anchor = (boundary.date, boundary.transaction_id)
        page_query = page_query.filter(
            position < anchor if sort_order == "desc" else position > anchor
        )
        offset = boundary.offset
    else:
        page_query = page_query.offset(offset)

    rows = page_query.limit(limit + 1).all()
    has_more = len(rows) > limit
    transactions = rows[:limit]
    if cursor is None and not has_more and (transactions or offset == 0):
        total = offset + len(transactions)
    else:
        # Never count the seek predicate or reuse a count signed before a mutation.
        total = query.order_by(None).count()
    next_cursor = (
        _encode_cursor(transactions[-1], context, offset + len(transactions))
        if has_more and context is not None
        else None
    )
    return transactions, total, offset, has_more, next_cursor
