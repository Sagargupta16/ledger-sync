"""AI tool-calling registry.

Exposes read-only finance data to LLM tool calls. The LLM picks tools by
name and passes JSON args; we execute the tool against the current user's
data and return JSON.

Design principles:
- All tools are read-only. Mutations go through explicit user actions.
- Every tool is user-scoped via CurrentUser. A tool can never see another
  user's data regardless of what arguments the LLM passes.
- Date params are optional YYYY-MM-DD strings. When absent, sensible
  defaults apply (e.g. "last 3 months" for search_transactions).
- Results are capped to prevent a runaway LLM from exfiltrating the whole
  DB or blowing the token budget.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session

from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.db.models import (
    AccountClassification,
    FinancialGoal,
    MonthlySummary,
    NetWorthSnapshot,
    RecurringTransaction,
    Transaction,
    TransactionType,
    User,
)

router = APIRouter(prefix="/api/ai/tools", tags=["ai-tools"])

# --- Tool registry -----------------------------------------------------------

ToolExecutor = Callable[[User, Session, dict[str, Any]], Any]


@dataclass(frozen=True)
class ToolSpec:
    """A tool the LLM can call. `schema` is a JSON Schema for the params."""

    name: str
    description: str
    schema: dict[str, Any]
    execute: ToolExecutor


_REGISTRY: dict[str, ToolSpec] = {}


def _register(spec: ToolSpec) -> ToolSpec:
    _REGISTRY[spec.name] = spec
    return spec


def _parse_date(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.strptime(s, "%Y-%m-%d").replace(tzinfo=UTC)
    except ValueError as exc:
        raise HTTPException(400, f"Invalid date {s!r}, expected YYYY-MM-DD") from exc


def _apply_date_range(
    stmt: Select[Any], start: datetime | None, end: datetime | None
) -> Select[Any]:
    if start is not None:
        stmt = stmt.where(Transaction.date >= start)
    if end is not None:
        # end is inclusive: extend to end of day
        stmt = stmt.where(Transaction.date < end + timedelta(days=1))
    return stmt


def _decimal(v: Decimal | float | int | None) -> float:
    if v is None:
        return 0.0
    return float(v)


# --- Tool implementations ----------------------------------------------------


def _exec_list_accounts(user: User, db: Session, _args: dict[str, Any]) -> Any:
    """Return accounts with transaction counts and current balance.

    Balance = sum(Income into account) - sum(Expense from account)
    + sum(Transfers in) - sum(Transfers out). Treats amount as positive
    magnitude.
    """
    # Gather distinct account names from transactions (+ from/to for transfers)
    names: set[str] = set()
    q = (
        select(Transaction.account, Transaction.from_account, Transaction.to_account)
        .where(Transaction.user_id == user.id, Transaction.is_deleted.is_(False))
        .distinct()
    )
    for acc, fr, to in db.execute(q).all():
        if acc:
            names.add(acc)
        if fr:
            names.add(fr)
        if to:
            names.add(to)

    classifications = {
        c.account_name: c.account_type.value
        for c in db.execute(
            select(AccountClassification).where(AccountClassification.user_id == user.id)
        ).scalars()
    }

    accounts: list[dict[str, Any]] = []
    for name in sorted(names):
        income = db.execute(
            select(func.coalesce(func.sum(Transaction.amount), 0)).where(
                Transaction.user_id == user.id,
                Transaction.is_deleted.is_(False),
                Transaction.account == name,
                Transaction.type == TransactionType.INCOME,
            )
        ).scalar_one()
        expense = db.execute(
            select(func.coalesce(func.sum(Transaction.amount), 0)).where(
                Transaction.user_id == user.id,
                Transaction.is_deleted.is_(False),
                Transaction.account == name,
                Transaction.type == TransactionType.EXPENSE,
            )
        ).scalar_one()
        transfer_in = db.execute(
            select(func.coalesce(func.sum(Transaction.amount), 0)).where(
                Transaction.user_id == user.id,
                Transaction.is_deleted.is_(False),
                Transaction.to_account == name,
                Transaction.type == TransactionType.TRANSFER,
            )
        ).scalar_one()
        transfer_out = db.execute(
            select(func.coalesce(func.sum(Transaction.amount), 0)).where(
                Transaction.user_id == user.id,
                Transaction.is_deleted.is_(False),
                Transaction.from_account == name,
                Transaction.type == TransactionType.TRANSFER,
            )
        ).scalar_one()
        count = db.execute(
            select(func.count())
            .select_from(Transaction)
            .where(
                Transaction.user_id == user.id,
                Transaction.is_deleted.is_(False),
                or_(
                    Transaction.account == name,
                    Transaction.from_account == name,
                    Transaction.to_account == name,
                ),
            )
        ).scalar_one()
        balance = (
            _decimal(income) - _decimal(expense) + _decimal(transfer_in) - _decimal(transfer_out)
        )
        accounts.append(
            {
                "name": name,
                "type": classifications.get(name, "unclassified"),
                "balance": balance,
                "transaction_count": int(count),
            }
        )
    return {"accounts": accounts, "count": len(accounts)}


_register(
    ToolSpec(
        name="list_accounts",
        description=(
            "List all the user's bank and wallet accounts with current balance "
            "and transaction count. Use when the user asks 'how many accounts', "
            "'list my accounts', 'which account has the most money', etc."
        ),
        schema={"type": "object", "properties": {}, "required": []},
        execute=_exec_list_accounts,
    )
)


def _exec_search_transactions(user: User, db: Session, args: dict[str, Any]) -> Any:
    """Full-text-ish search over transactions.

    Matches `query` against note, category, subcategory, and account using
    case-insensitive LIKE. Optional filters narrow results further.
    """
    query = str(args.get("query", "")).strip()
    limit = min(int(args.get("limit", 20)), 100)
    start = _parse_date(args.get("start_date"))
    end = _parse_date(args.get("end_date"))
    category = args.get("category")
    account = args.get("account")
    txn_type = args.get("type")
    min_amount = args.get("min_amount")
    max_amount = args.get("max_amount")

    stmt = select(Transaction).where(
        Transaction.user_id == user.id,
        Transaction.is_deleted.is_(False),
    )

    if query:
        like = f"%{query}%"
        stmt = stmt.where(
            or_(
                Transaction.note.ilike(like),
                Transaction.category.ilike(like),
                Transaction.subcategory.ilike(like),
                Transaction.account.ilike(like),
            )
        )
    if category:
        stmt = stmt.where(Transaction.category.ilike(f"%{category}%"))
    if account:
        stmt = stmt.where(
            or_(
                Transaction.account.ilike(f"%{account}%"),
                Transaction.from_account.ilike(f"%{account}%"),
                Transaction.to_account.ilike(f"%{account}%"),
            )
        )
    if txn_type:
        try:
            stmt = stmt.where(Transaction.type == TransactionType(txn_type))
        except ValueError as exc:
            raise HTTPException(400, f"Invalid type {txn_type!r}") from exc
    if min_amount is not None:
        stmt = stmt.where(Transaction.amount >= Decimal(str(min_amount)))
    if max_amount is not None:
        stmt = stmt.where(Transaction.amount <= Decimal(str(max_amount)))

    stmt = _apply_date_range(stmt, start, end)
    stmt = stmt.order_by(Transaction.date.desc()).limit(limit)

    rows = db.execute(stmt).scalars().all()

    total = db.execute(
        select(func.count()).select_from(
            _apply_date_range(
                select(Transaction).where(
                    Transaction.user_id == user.id,
                    Transaction.is_deleted.is_(False),
                ),
                start,
                end,
            ).subquery()
        )
    ).scalar_one()

    return {
        "transactions": [
            {
                "date": t.date.date().isoformat(),
                "amount": _decimal(t.amount),
                "type": t.type.value,
                "category": t.category,
                "subcategory": t.subcategory,
                "account": t.account,
                "note": t.note,
            }
            for t in rows
        ],
        "returned": len(rows),
        "total_matching_date_range": int(total),
        "truncated": len(rows) >= limit,
    }


_register(
    ToolSpec(
        name="search_transactions",
        description=(
            "Search individual transactions. Use for questions about specific "
            "purchases, merchants, dates, or amounts (e.g. 'when did I last go "
            "for a haircut', 'show payments to DMart', 'transactions over 10000 "
            "last week'). `query` matches note/category/subcategory/account. "
            "All filters optional. Returns up to `limit` results (default 20, max 100)."
        ),
        schema={
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Text to search for."},
                "start_date": {"type": "string", "description": "YYYY-MM-DD inclusive."},
                "end_date": {"type": "string", "description": "YYYY-MM-DD inclusive."},
                "category": {"type": "string"},
                "account": {"type": "string"},
                "type": {
                    "type": "string",
                    "enum": ["Income", "Expense", "Transfer"],
                },
                "min_amount": {"type": "number"},
                "max_amount": {"type": "number"},
                "limit": {"type": "integer", "minimum": 1, "maximum": 100, "default": 20},
            },
            "required": [],
        },
        execute=_exec_search_transactions,
    )
)


def _exec_get_monthly_summary(user: User, db: Session, args: dict[str, Any]) -> Any:
    period = str(args.get("period", "")).strip()
    if not period:
        raise HTTPException(400, "period is required (YYYY-MM)")
    row = db.execute(
        select(MonthlySummary).where(
            MonthlySummary.user_id == user.id, MonthlySummary.period_key == period
        )
    ).scalar_one_or_none()
    if not row:
        return {"period": period, "found": False}
    return {
        "period": period,
        "found": True,
        "income": _decimal(row.total_income),
        "expenses": _decimal(row.total_expenses),
        "net_savings": _decimal(row.net_savings),
        "savings_rate": row.savings_rate,
        "transaction_count": row.total_transactions,
    }


_register(
    ToolSpec(
        name="get_monthly_summary",
        description="Get income, expenses, and savings for a single month (YYYY-MM).",
        schema={
            "type": "object",
            "properties": {"period": {"type": "string", "description": "Month in YYYY-MM."}},
            "required": ["period"],
        },
        execute=_exec_get_monthly_summary,
    )
)


def _exec_list_categories(user: User, db: Session, args: dict[str, Any]) -> Any:
    start = _parse_date(args.get("start_date"))
    end = _parse_date(args.get("end_date"))
    txn_type = args.get("type", "Expense")
    limit = min(int(args.get("limit", 15)), 50)

    stmt = (
        select(
            Transaction.category,
            func.sum(Transaction.amount).label("total"),
            func.count().label("row_count"),
        )
        .where(
            Transaction.user_id == user.id,
            Transaction.is_deleted.is_(False),
            Transaction.type == TransactionType(txn_type),
        )
        .group_by(Transaction.category)
        .order_by(func.sum(Transaction.amount).desc())
        .limit(limit)
    )
    stmt = _apply_date_range(stmt, start, end)
    rows = db.execute(stmt).all()
    grand_total = sum(_decimal(r.total) for r in rows)
    return {
        "categories": [
            {
                "category": r.category,
                "total": _decimal(r.total),
                "count": int(r.row_count),
                "pct_of_total": (_decimal(r.total) / grand_total * 100) if grand_total else 0,
            }
            for r in rows
        ],
        "grand_total": grand_total,
        "type": txn_type,
    }


_register(
    ToolSpec(
        name="list_categories",
        description=(
            "Rank spending (or income) by category for a date range. Use for "
            "'what did I spend the most on', 'top categories last month'."
        ),
        schema={
            "type": "object",
            "properties": {
                "start_date": {"type": "string"},
                "end_date": {"type": "string"},
                "type": {"type": "string", "enum": ["Income", "Expense"], "default": "Expense"},
                "limit": {"type": "integer", "minimum": 1, "maximum": 50, "default": 15},
            },
        },
        execute=_exec_list_categories,
    )
)


def _exec_get_category_spending(user: User, db: Session, args: dict[str, Any]) -> Any:
    category = str(args.get("category", "")).strip()
    if not category:
        raise HTTPException(400, "category is required")
    start = _parse_date(args.get("start_date"))
    end = _parse_date(args.get("end_date"))
    stmt = select(
        func.coalesce(func.sum(Transaction.amount), 0).label("total"),
        func.count().label("row_count"),
    ).where(
        Transaction.user_id == user.id,
        Transaction.is_deleted.is_(False),
        Transaction.type == TransactionType.EXPENSE,
        Transaction.category.ilike(f"%{category}%"),
    )
    stmt = _apply_date_range(stmt, start, end)
    row = db.execute(stmt).one()
    return {
        "category": category,
        "total": _decimal(row.total),
        "count": int(row.row_count),
        "start_date": args.get("start_date"),
        "end_date": args.get("end_date"),
    }


_register(
    ToolSpec(
        name="get_category_spending",
        description="Total spent in a category over a date range.",
        schema={
            "type": "object",
            "properties": {
                "category": {"type": "string"},
                "start_date": {"type": "string"},
                "end_date": {"type": "string"},
            },
            "required": ["category"],
        },
        execute=_exec_get_category_spending,
    )
)


def _exec_get_net_worth(user: User, db: Session, _args: dict[str, Any]) -> Any:
    snap = db.execute(
        select(NetWorthSnapshot)
        .where(NetWorthSnapshot.user_id == user.id)
        .order_by(NetWorthSnapshot.snapshot_date.desc())
        .limit(1)
    ).scalar_one_or_none()
    if not snap:
        return {"found": False}
    return {
        "found": True,
        "as_of": snap.snapshot_date.date().isoformat(),
        "net_worth": _decimal(snap.net_worth),
        "assets": {
            "total": _decimal(snap.total_assets),
            "cash_and_bank": _decimal(snap.cash_and_bank),
            "investments": _decimal(snap.investments),
            "mutual_funds": _decimal(snap.mutual_funds),
            "stocks": _decimal(snap.stocks),
            "fixed_deposits": _decimal(snap.fixed_deposits),
            "ppf_epf": _decimal(snap.ppf_epf),
            "other": _decimal(snap.other_assets),
        },
        "liabilities": {
            "total": _decimal(snap.total_liabilities),
            "credit_cards": _decimal(snap.credit_card_outstanding),
            "loans": _decimal(snap.loans_payable),
            "other": _decimal(snap.other_liabilities),
        },
    }


_register(
    ToolSpec(
        name="get_net_worth",
        description="Current net worth snapshot with asset/liability breakdown.",
        schema={"type": "object", "properties": {}, "required": []},
        execute=_exec_get_net_worth,
    )
)


def _exec_list_recurring(user: User, db: Session, args: dict[str, Any]) -> Any:
    active_only = bool(args.get("active_only", True))
    stmt = select(RecurringTransaction).where(RecurringTransaction.user_id == user.id)
    if active_only:
        stmt = stmt.where(RecurringTransaction.is_active.is_(True))
    stmt = stmt.order_by(RecurringTransaction.expected_amount.desc())
    rows = db.execute(stmt).scalars().all()
    return {
        "recurring": [
            {
                "name": r.pattern_name,
                "category": r.category,
                "account": r.account,
                "frequency": r.frequency.value if r.frequency else None,
                "expected_amount": _decimal(r.expected_amount),
                "last_occurrence": (
                    r.last_occurrence.date().isoformat() if r.last_occurrence else None
                ),
                "active": r.is_active,
            }
            for r in rows
        ],
        "count": len(rows),
    }


_register(
    ToolSpec(
        name="list_recurring",
        description="List recurring bills and subscriptions.",
        schema={
            "type": "object",
            "properties": {
                "active_only": {"type": "boolean", "default": True},
            },
        },
        execute=_exec_list_recurring,
    )
)


def _exec_list_goals(user: User, db: Session, _args: dict[str, Any]) -> Any:
    rows = db.execute(select(FinancialGoal).where(FinancialGoal.user_id == user.id)).scalars().all()
    return {
        "goals": [
            {
                "name": g.name,
                "type": g.goal_type,
                "target_amount": _decimal(g.target_amount),
                "current_amount": _decimal(g.current_amount),
                "progress_pct": g.progress_pct,
                "target_date": g.target_date.isoformat() if g.target_date else None,
                "status": g.status.value if g.status else None,
            }
            for g in rows
        ],
        "count": len(rows),
    }


_register(
    ToolSpec(
        name="list_goals",
        description="List the user's financial goals with progress.",
        schema={"type": "object", "properties": {}, "required": []},
        execute=_exec_list_goals,
    )
)


def _exec_list_recent_months(user: User, db: Session, args: dict[str, Any]) -> Any:
    limit = min(int(args.get("limit", 6)), 24)
    rows = (
        db.execute(
            select(MonthlySummary)
            .where(MonthlySummary.user_id == user.id)
            .order_by(MonthlySummary.period_key.desc())
            .limit(limit)
        )
        .scalars()
        .all()
    )
    return {
        "months": [
            {
                "period": r.period_key,
                "income": _decimal(r.total_income),
                "expenses": _decimal(r.total_expenses),
                "net_savings": _decimal(r.net_savings),
                "savings_rate": r.savings_rate,
            }
            for r in rows
        ],
        "count": len(rows),
    }


_register(
    ToolSpec(
        name="list_recent_months",
        description="Return the most recent months' income/expense summaries.",
        schema={
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "minimum": 1, "maximum": 24, "default": 6},
            },
        },
        execute=_exec_list_recent_months,
    )
)


# --- HTTP endpoints ----------------------------------------------------------


class ToolExecuteRequest(BaseModel):
    name: str = Field(min_length=1)
    arguments: dict[str, Any] = Field(default_factory=dict)


def tool_specs() -> list[dict[str, Any]]:
    """Return provider-neutral tool descriptors (used by manifest + tests)."""
    return [
        {"name": t.name, "description": t.description, "parameters": t.schema}
        for t in _REGISTRY.values()
    ]


@router.get("")
def list_tools(_current_user: CurrentUser) -> dict[str, Any]:
    """List available tool schemas. Auth required so anonymous browsers
    can't enumerate what tools the app supports."""
    return {"tools": tool_specs()}


@router.post("/execute")
def execute_tool(
    current_user: CurrentUser,
    request: ToolExecuteRequest,
    session: DatabaseSession,
) -> dict[str, Any]:
    """Execute a registered tool against the current user's data."""
    spec = _REGISTRY.get(request.name)
    if spec is None:
        raise HTTPException(404, f"Unknown tool: {request.name}")
    try:
        result = spec.execute(current_user, session, request.arguments)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        # Surface the reason so the LLM can retry with better args instead
        # of just getting a 500.
        raise HTTPException(400, f"Tool {request.name} failed: {exc}") from exc
    return {"name": request.name, "result": result}
