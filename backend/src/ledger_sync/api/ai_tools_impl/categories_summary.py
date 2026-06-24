"""Category, monthly summary, net worth, recurring, goals, recent months tools."""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ledger_sync.db.models import (
    FinancialGoal,
    MonthlySummary,
    NetWorthSnapshot,
    RecurringTransaction,
    Transaction,
    TransactionType,
    User,
)

from .registry import (
    LIST_CATEGORIES_DEFAULT_LIMIT,
    LIST_CATEGORIES_MAX_LIMIT,
    LIST_ENTITIES_MAX_LIMIT,
    LIST_RECENT_MONTHS_DEFAULT_LIMIT,
    LIST_RECENT_MONTHS_MAX_LIMIT,
    ToolSpec,
    apply_date_range,
    parse_date,
    register,
    to_decimal,
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
        "income": to_decimal(row.total_income),
        "expenses": to_decimal(row.total_expenses),
        "net_savings": to_decimal(row.net_savings),
        "savings_rate": row.savings_rate,
        "transaction_count": row.total_transactions,
    }


register(
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
    start = parse_date(args.get("start_date"))
    end = parse_date(args.get("end_date"))
    txn_type = args.get("type", "Expense")
    limit = min(
        int(args.get("limit", LIST_CATEGORIES_DEFAULT_LIMIT)),
        LIST_CATEGORIES_MAX_LIMIT,
    )

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
    stmt = apply_date_range(stmt, start, end)
    rows = db.execute(stmt).all()
    grand_total = sum(to_decimal(r.total) for r in rows)
    return {
        "categories": [
            {
                "category": r.category,
                "total": to_decimal(r.total),
                "count": int(r.row_count),
                "pct_of_total": (to_decimal(r.total) / grand_total * 100) if grand_total else 0,
            }
            for r in rows
        ],
        "grand_total": grand_total,
        "type": txn_type,
    }


register(
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
                "limit": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": LIST_CATEGORIES_MAX_LIMIT,
                    "default": LIST_CATEGORIES_DEFAULT_LIMIT,
                },
            },
        },
        execute=_exec_list_categories,
    )
)


def _exec_get_category_spending(user: User, db: Session, args: dict[str, Any]) -> Any:
    category = str(args.get("category", "")).strip()
    if not category:
        raise HTTPException(400, "category is required")
    start = parse_date(args.get("start_date"))
    end = parse_date(args.get("end_date"))
    stmt = select(
        func.coalesce(func.sum(Transaction.amount), 0).label("total"),
        func.count().label("row_count"),
    ).where(
        Transaction.user_id == user.id,
        Transaction.is_deleted.is_(False),
        Transaction.type == TransactionType.EXPENSE,
        Transaction.category.ilike(f"%{category}%"),
    )
    stmt = apply_date_range(stmt, start, end)
    row = db.execute(stmt).one()
    return {
        "category": category,
        "total": to_decimal(row.total),
        "count": int(row.row_count),
        "start_date": args.get("start_date"),
        "end_date": args.get("end_date"),
    }


register(
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
        "net_worth": to_decimal(snap.net_worth),
        "assets": {
            "total": to_decimal(snap.total_assets),
            "cash_and_bank": to_decimal(snap.cash_and_bank),
            "investments": to_decimal(snap.investments),
            "mutual_funds": to_decimal(snap.mutual_funds),
            "stocks": to_decimal(snap.stocks),
            "fixed_deposits": to_decimal(snap.fixed_deposits),
            "ppf_epf": to_decimal(snap.ppf_epf),
            "other": to_decimal(snap.other_assets),
        },
        "liabilities": {
            "total": to_decimal(snap.total_liabilities),
            "credit_cards": to_decimal(snap.credit_card_outstanding),
            "loans": to_decimal(snap.loans_payable),
            "other": to_decimal(snap.other_liabilities),
        },
    }


register(
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
    stmt = stmt.order_by(RecurringTransaction.expected_amount.desc()).limit(LIST_ENTITIES_MAX_LIMIT)
    rows = db.execute(stmt).scalars().all()
    return {
        "recurring": [
            {
                "name": r.pattern_name,
                "category": r.category,
                "account": r.account,
                "frequency": r.frequency.value if r.frequency else None,
                "expected_amount": to_decimal(r.expected_amount),
                "last_occurrence": (
                    r.last_occurrence.date().isoformat() if r.last_occurrence else None
                ),
                "active": r.is_active,
            }
            for r in rows
        ],
        "count": len(rows),
        "truncated": len(rows) >= LIST_ENTITIES_MAX_LIMIT,
    }


register(
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
    rows = (
        db.execute(
            select(FinancialGoal)
            .where(FinancialGoal.user_id == user.id)
            .limit(LIST_ENTITIES_MAX_LIMIT)
        )
        .scalars()
        .all()
    )
    return {
        "goals": [
            {
                "name": g.name,
                "type": g.goal_type,
                "target_amount": to_decimal(g.target_amount),
                "current_amount": to_decimal(g.current_amount),
                "progress_pct": g.progress_pct,
                "target_date": g.target_date.isoformat() if g.target_date else None,
                "status": g.status.value if g.status else None,
            }
            for g in rows
        ],
        "count": len(rows),
        "truncated": len(rows) >= LIST_ENTITIES_MAX_LIMIT,
    }


register(
    ToolSpec(
        name="list_goals",
        description="List the user's financial goals with progress.",
        schema={"type": "object", "properties": {}, "required": []},
        execute=_exec_list_goals,
    )
)


def _exec_list_recent_months(user: User, db: Session, args: dict[str, Any]) -> Any:
    limit = min(
        int(args.get("limit", LIST_RECENT_MONTHS_DEFAULT_LIMIT)),
        LIST_RECENT_MONTHS_MAX_LIMIT,
    )
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
                "income": to_decimal(r.total_income),
                "expenses": to_decimal(r.total_expenses),
                "net_savings": to_decimal(r.net_savings),
                "savings_rate": r.savings_rate,
            }
            for r in rows
        ],
        "count": len(rows),
    }


register(
    ToolSpec(
        name="list_recent_months",
        description="Return the most recent months' income/expense summaries.",
        schema={
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": LIST_RECENT_MONTHS_MAX_LIMIT,
                    "default": LIST_RECENT_MONTHS_DEFAULT_LIMIT,
                },
            },
        },
        execute=_exec_list_recent_months,
    )
)
