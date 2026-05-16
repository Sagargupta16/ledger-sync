"""Tool registry, helpers, and shared limit constants for ai_tools.

The registry is module-level so tool modules can register themselves at
import time. The thin facade in api/ai_tools.py imports each tool module
to trigger registration, then re-exports the registry.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

from fastapi import HTTPException
from sqlalchemy import Select
from sqlalchemy.orm import Session

from ledger_sync.db.models import Transaction, User

# --- Central tool limit defaults --------------------------------------------

SEARCH_TRANSACTIONS_DEFAULT_LIMIT = 20
SEARCH_TRANSACTIONS_MAX_LIMIT = 100

LIST_CATEGORIES_DEFAULT_LIMIT = 15
LIST_CATEGORIES_MAX_LIMIT = 50

LIST_RECENT_MONTHS_DEFAULT_LIMIT = 6
LIST_RECENT_MONTHS_MAX_LIMIT = 24

# --- Tool registry -----------------------------------------------------------

ToolExecutor = Callable[[User, Session, dict[str, Any]], Any]


@dataclass(frozen=True)
class ToolSpec:
    """A tool the LLM can call. `schema` is a JSON Schema for the params."""

    name: str
    description: str
    schema: dict[str, Any]
    execute: ToolExecutor


REGISTRY: dict[str, ToolSpec] = {}


def register(spec: ToolSpec) -> ToolSpec:
    REGISTRY[spec.name] = spec
    return spec


def parse_date(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.strptime(s, "%Y-%m-%d").replace(tzinfo=UTC)
    except ValueError as exc:
        raise HTTPException(400, f"Invalid date {s!r}, expected YYYY-MM-DD") from exc


def apply_date_range(
    stmt: Select[Any], start: datetime | None, end: datetime | None
) -> Select[Any]:
    if start is not None:
        stmt = stmt.where(Transaction.date >= start)
    if end is not None:
        stmt = stmt.where(Transaction.date < end + timedelta(days=1))
    return stmt


def to_decimal(v: Decimal | float | int | None) -> float:
    if v is None:
        return 0.0
    return float(v)
