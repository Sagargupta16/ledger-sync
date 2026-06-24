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
            to_decimal(income)
            - to_decimal(expense)
            + to_decimal(transfer_in)
            - to_decimal(transfer_out)
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
