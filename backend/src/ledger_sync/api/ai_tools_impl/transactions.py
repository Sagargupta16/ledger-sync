"""Transaction-related AI tools: list_accounts, search_transactions."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ledger_sync.db.models import (
    AccountClassification,
    Transaction,
    TransactionType,
    User,
)

from .registry import (
    LIST_ENTITIES_MAX_LIMIT,
    SEARCH_TRANSACTIONS_DEFAULT_LIMIT,
    SEARCH_TRANSACTIONS_MAX_LIMIT,
    ToolSpec,
    apply_date_range,
    parse_date,
    register,
    to_decimal,
)


def _exec_list_accounts(user: User, db: Session, _args: dict[str, Any]) -> Any:
    """Return accounts with transaction counts and current balance.

    Balance = sum(Income into account) - sum(Expense from account)
    + sum(Transfers in) - sum(Transfers out). Treats amount as positive
    magnitude.

    Uses a fixed set of GROUP BY aggregates merged in Python rather than 5
    queries per account, so a user with N accounts costs O(1) round-trips (was
    5N+1 -- painful on Neon free-tier connection latency for the chat tool path).
    """
    base = (Transaction.user_id == user.id, Transaction.is_deleted.is_(False))

    # income & expense by primary account, in one grouped query.
    # to_decimal() returns a float (JSON-friendly magnitude), matching the
    # previous per-account computation.
    income: dict[str, float] = {}
    expense: dict[str, float] = {}
    for acc, ttype, total in db.execute(
        select(
            Transaction.account,
            Transaction.type,
            func.coalesce(func.sum(Transaction.amount), 0),
        )
        .where(*base, Transaction.type.in_((TransactionType.INCOME, TransactionType.EXPENSE)))
        .group_by(Transaction.account, Transaction.type)
    ).all():
        if not acc:
            continue
        (income if ttype == TransactionType.INCOME else expense)[acc] = to_decimal(total)

    # transfers in (by to_account) and out (by from_account)
    transfer_in: dict[str, float] = {
        to: to_decimal(total)
        for to, total in db.execute(
            select(Transaction.to_account, func.coalesce(func.sum(Transaction.amount), 0))
            .where(*base, Transaction.type == TransactionType.TRANSFER)
            .group_by(Transaction.to_account)
        ).all()
        if to
    }
    transfer_out: dict[str, float] = {
        fr: to_decimal(total)
        for fr, total in db.execute(
            select(Transaction.from_account, func.coalesce(func.sum(Transaction.amount), 0))
            .where(*base, Transaction.type == TransactionType.TRANSFER)
            .group_by(Transaction.from_account)
        ).all()
        if fr
    }

    # transaction count per account (account OR from_account OR to_account).
    # Counted per role then summed; a transfer touches both endpoints, matching
    # the previous OR-based count semantics.
    counts: dict[str, int] = {}
    for col in (Transaction.account, Transaction.from_account, Transaction.to_account):
        for name, n in db.execute(select(col, func.count()).where(*base).group_by(col)).all():
            if name:
                counts[name] = counts.get(name, 0) + int(n)

    classifications = {
        c.account_name: c.account_type.value
        for c in db.execute(
            select(AccountClassification).where(AccountClassification.user_id == user.id)
        ).scalars()
    }

    names = set(income) | set(expense) | set(transfer_in) | set(transfer_out) | set(counts)
    accounts: list[dict[str, Any]] = []
    for name in sorted(names):
        balance = (
            income.get(name, 0.0)
            - expense.get(name, 0.0)
            + transfer_in.get(name, 0.0)
            - transfer_out.get(name, 0.0)
        )
        accounts.append(
            {
                "name": name,
                "type": classifications.get(name, "unclassified"),
                "balance": balance,
                "transaction_count": counts.get(name, 0),
            }
        )

    # Cap results like every other list tool so the LLM can't pull an unbounded
    # row count into the prompt. Keep the largest accounts by |balance|.
    total = len(accounts)
    if total > LIST_ENTITIES_MAX_LIMIT:
        accounts.sort(key=lambda a: abs(a["balance"]), reverse=True)
        accounts = accounts[:LIST_ENTITIES_MAX_LIMIT]
    return {
        "accounts": accounts,
        "count": len(accounts),
        "total": total,
        "truncated": total > len(accounts),
    }


register(
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
    limit = min(
        int(args.get("limit", SEARCH_TRANSACTIONS_DEFAULT_LIMIT)),
        SEARCH_TRANSACTIONS_MAX_LIMIT,
    )
    start = parse_date(args.get("start_date"))
    end = parse_date(args.get("end_date"))
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

    # `stmt` now carries every filter (query/category/account/type/amount).
    stmt = apply_date_range(stmt, start, end)

    # Count from the SAME filtered statement so the total reflects the actual
    # query, not just user+date-range. Strip ordering before counting.
    total = db.execute(
        select(func.count()).select_from(stmt.order_by(None).subquery())
    ).scalar_one()

    rows = db.execute(stmt.order_by(Transaction.date.desc()).limit(limit)).scalars().all()

    return {
        "transactions": [
            {
                "date": t.date.date().isoformat(),
                "amount": to_decimal(t.amount),
                "type": t.type.value,
                "category": t.category,
                "subcategory": t.subcategory,
                "account": t.account,
                "note": t.note,
            }
            for t in rows
        ],
        "returned": len(rows),
        "total_matching_filters": total,
        "truncated": len(rows) >= limit,
    }


register(
    ToolSpec(
        name="search_transactions",
        description=(
            "Search individual transactions. Use for questions about specific "
            "purchases, merchants, dates, or amounts (e.g. 'when did I last go "
            "for a haircut', 'show payments to DMart', 'transactions over 10000 "
            "last week'). `query` matches note/category/subcategory/account. "
            f"All filters optional. Returns up to `limit` results "
            f"(default {SEARCH_TRANSACTIONS_DEFAULT_LIMIT}, "
            f"max {SEARCH_TRANSACTIONS_MAX_LIMIT})."
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
                "limit": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": SEARCH_TRANSACTIONS_MAX_LIMIT,
                    "default": SEARCH_TRANSACTIONS_DEFAULT_LIMIT,
                },
            },
            "required": [],
        },
        execute=_exec_search_transactions,
    )
)
