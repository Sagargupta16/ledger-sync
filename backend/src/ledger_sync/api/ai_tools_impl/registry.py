"""Tool registry, helpers, and shared limit constants for ai_tools.

The registry is module-level so tool modules can register themselves at
import time. The thin facade in api/ai_tools.py imports each tool module
to trigger registration, then re-exports the registry.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from fastapi import HTTPException
from sqlalchemy import Select
from sqlalchemy.orm import Session

from ledger_sync.core.expense_class import capital_loss_sql_filter
from ledger_sync.core.query_helpers import (
    capital_loss_keys_for,
    excluded_accounts_criteria,
    excluded_accounts_for,
    inclusive_end,
)
from ledger_sync.db.models import Transaction, User

from .schemas import ToolArguments

# --- Central tool limit defaults --------------------------------------------

SEARCH_TRANSACTIONS_DEFAULT_LIMIT = 20
SEARCH_TRANSACTIONS_MAX_LIMIT = 100

LIST_CATEGORIES_DEFAULT_LIMIT = 15
LIST_CATEGORIES_MAX_LIMIT = 50

LIST_RECENT_MONTHS_DEFAULT_LIMIT = 6
LIST_RECENT_MONTHS_MAX_LIMIT = 24

# Cap for curated/grouped lists (recurring, goals, budgets). These tables are
# small by nature, but the cap enforces the tool invariant that no tool can
# dump an unbounded row count into the LLM prompt.
LIST_ENTITIES_MAX_LIMIT = 100

# --- Tool registry -----------------------------------------------------------

ToolExecutor = Callable[[User, Session, dict[str, Any]], Any]


@dataclass(frozen=True)
class ToolSpec:
    """A tool whose advertised and enforced argument schemas have one source."""

    name: str
    description: str
    arguments_model: type[ToolArguments]
    execute: ToolExecutor

    @property
    def schema(self) -> dict[str, Any]:
        return self.arguments_model.model_json_schema()

    def validate_arguments(self, arguments: dict[str, Any]) -> dict[str, Any]:
        return self.arguments_model.model_validate(arguments).model_dump(exclude_none=True)


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
    """Inclusive ``[start, end]`` day window, same end rule as the REST endpoints."""
    if start is not None:
        stmt = stmt.where(Transaction.date >= start)
    if end is not None:
        stmt = stmt.where(Transaction.date <= inclusive_end(end))
    return stmt


def ledger_scope(user: User, stmt: Select[Any]) -> Select[Any]:
    """Live rows for *user*, minus their excluded accounts.

    The REST reads (``build_transaction_query``, the transactions endpoints)
    all drop excluded accounts; a tool that did not answered the chat with
    balances and totals the rest of the app deliberately hides.
    """
    return stmt.where(
        Transaction.user_id == user.id,
        Transaction.is_deleted.is_(False),
        *excluded_accounts_criteria(excluded_accounts_for(user)),
    )


def without_capital_losses(stmt: Select[Any], user: User) -> Select[Any]:
    """Drop the user's classified realised losses from an EXPENSE statement.

    Same rule ``/category-breakdown`` applies: a realised loss is a negative
    investment return, not a spending category. No-op when nothing is classified.
    """
    not_a_loss = capital_loss_sql_filter(capital_loss_keys_for(user))
    return stmt if not_a_loss is None else stmt.where(not_a_loss)


def to_decimal(v: Decimal | float | None) -> float:
    if v is None:
        return 0.0
    return float(v)
