"""Category, monthly summary, net worth, recurring, goals, recent months tools."""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from ledger_sync.core.analytics.recurring import DISMISSED_PATTERN_KIND, effective_pattern_kind
from ledger_sync.db.models import (
    FinancialGoal,
    MonthlySummary,
    NetWorthSnapshot,
    RecurrenceFrequency,
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
    ledger_scope,
    matching_categories,
    parse_date,
    register,
    to_decimal,
    without_capital_losses,
)
from .schemas import (
    CategorySpendingArguments,
    ListCategoriesArguments,
    MonthlySummaryArguments,
    RecentMonthsArguments,
    RecurringArguments,
    ToolArguments,
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
    # ``expenses`` excludes classified realised losses and ``net_savings`` still
    # nets them off, so publish the loss too (as /monthly-aggregation does);
    # without it income - expenses - net_savings had no visible explanation.
    return {
        "period": period,
        "found": True,
        "income": to_decimal(row.total_income),
        "expenses": to_decimal(row.total_expenses),
        "capital_losses": to_decimal(row.capital_losses),
        "net_savings": to_decimal(row.net_savings),
        "savings_rate": row.savings_rate,
        "transaction_count": row.total_transactions,
    }


register(
    ToolSpec(
        name="get_monthly_summary",
        description="Get income, expenses, and savings for a single month (YYYY-MM).",
        arguments_model=MonthlySummaryArguments,
        execute=_exec_get_monthly_summary,
    )
)


def _exec_list_categories(user: User, db: Session, args: dict[str, Any]) -> Any:
    start = parse_date(args.get("start_date"))
    end = parse_date(args.get("end_date"))
    txn_type = args.get("type", "Expense")
    limit = max(
        1,
        min(
            int(args.get("limit", LIST_CATEGORIES_DEFAULT_LIMIT)),
            LIST_CATEGORIES_MAX_LIMIT,
        ),
    )

    tx_type = TransactionType(txn_type)

    def _scoped(stmt: Select[Any]) -> Select[Any]:
        # Same population as /api/calculations/top-categories: excluded
        # accounts dropped and, for spending, classified realised losses too.
        stmt = ledger_scope(user, stmt).where(Transaction.type == tx_type)
        if tx_type == TransactionType.EXPENSE:
            stmt = without_capital_losses(stmt, user)
        return apply_date_range(stmt, start, end)

    stmt = (
        _scoped(
            select(
                Transaction.category,
                func.sum(Transaction.amount).label("total"),
                func.count().label("row_count"),
            )
        )
        .group_by(Transaction.category)
        .order_by(func.sum(Transaction.amount).desc())
        .limit(limit)
    )
    rows = db.execute(stmt).all()
    # The denominator is every matching category, not just the LIMITed top-N,
    # so each share is of the real total rather than summing to 100% of a slice.
    grand_total = to_decimal(db.execute(_scoped(select(func.sum(Transaction.amount)))).scalar_one())
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
        arguments_model=ListCategoriesArguments,
        execute=_exec_list_categories,
    )
)


def _exec_get_category_spending(user: User, db: Session, args: dict[str, Any]) -> Any:
    category = str(args.get("category", "")).strip()
    if not category:
        raise HTTPException(400, "category is required")
    start = parse_date(args.get("start_date"))
    end = parse_date(args.get("end_date"))
    names, exact = matching_categories(db, user, category, TransactionType.EXPENSE)
    stmt = ledger_scope(
        user,
        select(
            func.coalesce(func.sum(Transaction.amount), 0).label("total"),
            func.count().label("row_count"),
        ),
    ).where(
        Transaction.type == TransactionType.EXPENSE,
        Transaction.category.in_(names),
    )
    # Spending, as /category-breakdown counts it: classified losses excluded.
    stmt = apply_date_range(without_capital_losses(stmt, user), start, end)
    row = db.execute(stmt).one()
    return {
        "category": category,
        "match": "exact" if exact else "substring",
        "matched_categories": sorted(names)[:LIST_CATEGORIES_MAX_LIMIT],
        "total": to_decimal(row.total),
        "count": int(row.row_count),
        "start_date": args.get("start_date"),
        "end_date": args.get("end_date"),
    }


register(
    ToolSpec(
        name="get_category_spending",
        description=(
            "Total spent in a category over a date range. An exact category name "
            "(case-insensitive) is used on its own; a name matching no category "
            "sums every category containing it, listed in `matched_categories`."
        ),
        arguments_model=CategorySpendingArguments,
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
        arguments_model=ToolArguments,
        execute=_exec_get_net_worth,
    )
)


# Occurrences per year: the table the dashboard converts recurring amounts with
# (frontend ``lib/recurrenceFrequency.ts`` PERIODS_PER_YEAR). Unknown -> monthly.
_PERIODS_PER_YEAR = {
    RecurrenceFrequency.DAILY: 365,
    RecurrenceFrequency.WEEKLY: 52,
    RecurrenceFrequency.BIWEEKLY: 26,
    RecurrenceFrequency.MONTHLY: 12,
    RecurrenceFrequency.BIMONTHLY: 6,
    RecurrenceFrequency.QUARTERLY: 4,
    RecurrenceFrequency.SEMIANNUAL: 2,
    RecurrenceFrequency.YEARLY: 1,
}


def _monthly_equivalent(record: RecurringTransaction) -> float:
    periods = _PERIODS_PER_YEAR.get(record.frequency, 12)
    return abs(to_decimal(record.expected_amount)) * periods / 12


def _exec_list_recurring(user: User, db: Session, args: dict[str, Any]) -> Any:
    active_only = bool(args.get("active_only", True))
    include_habits = bool(args.get("include_habits", False))
    # "dismissed" is the tombstone for a detected pattern the user deleted: it
    # stays stored so re-detection does not resurrect it, but is never listed.
    stmt = select(RecurringTransaction).where(
        RecurringTransaction.user_id == user.id,
        RecurringTransaction.pattern_kind != DISMISSED_PATTERN_KIND,
    )
    if active_only:
        stmt = stmt.where(RecurringTransaction.is_active.is_(True))
    if not include_habits:
        # An effective commitment is always stored as one; this only narrows the read.
        stmt = stmt.where(RecurringTransaction.pattern_kind == "commitment")
    stmt = stmt.order_by(RecurringTransaction.expected_amount.desc())
    # The kind the REST list and the dashboard show: old unconfirmed
    # detections of periodic shopping read as habits, not bills.
    rows: list[tuple[RecurringTransaction, str]] = []
    for record in db.execute(stmt).scalars():
        kind = effective_pattern_kind(record)
        if include_habits or kind == "commitment":
            rows.append((record, kind))
    # Same population as the dashboard's fixed-cost total: active commitments.
    monthly_expense_total = sum(
        _monthly_equivalent(r)
        for r, kind in rows
        if kind == "commitment" and r.is_active and r.transaction_type == TransactionType.EXPENSE
    )
    listed = rows[:LIST_ENTITIES_MAX_LIMIT]
    return {
        "recurring": [
            {
                "name": r.pattern_name,
                "category": r.category,
                "account": r.account,
                "type": r.transaction_type.value if r.transaction_type else None,
                "pattern_kind": kind,
                "frequency": r.frequency.value if r.frequency else None,
                "expected_amount": to_decimal(r.expected_amount),
                "monthly_equivalent": _monthly_equivalent(r),
                "last_occurrence": (
                    r.last_occurrence.date().isoformat() if r.last_occurrence else None
                ),
                "active": r.is_active,
            }
            for r, kind in listed
        ],
        "count": len(listed),
        "truncated": len(rows) > len(listed),
        "monthly_expense_total": monthly_expense_total,
    }


register(
    ToolSpec(
        name="list_recurring",
        description=(
            "List recurring commitments: bills, subscriptions, EMIs, insurance, "
            "and recurring income such as salary (`type` says which). Set "
            "`include_habits` to also list repeated discretionary purchases "
            "(`pattern_kind` = habit). `monthly_expense_total` is the monthly equivalent "
            "of active expense commitments, as the dashboard counts fixed costs."
        ),
        arguments_model=RecurringArguments,
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
        arguments_model=ToolArguments,
        execute=_exec_list_goals,
    )
)


def _exec_list_recent_months(user: User, db: Session, args: dict[str, Any]) -> Any:
    limit = max(
        1,
        min(
            int(args.get("limit", LIST_RECENT_MONTHS_DEFAULT_LIMIT)),
            LIST_RECENT_MONTHS_MAX_LIMIT,
        ),
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
                "capital_losses": to_decimal(r.capital_losses),
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
        arguments_model=RecentMonthsArguments,
        execute=_exec_list_recent_months,
    )
)
