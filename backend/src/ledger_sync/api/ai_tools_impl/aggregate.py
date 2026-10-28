"""aggregate_transactions: one flexible read for any slice of the ledger.

The fixed summary tools answer the common questions; this one answers the rest,
such as "insurance premiums per month for three years" or "spend by account per
quarter, split by category". Rows are the user's live ledger minus excluded
accounts (``ledger_scope``), and Expense rows in a classified capital-loss
taxonomy are left out, as every spending total in the app does. Periods with no
rows come back as zero, so a chart never skips a month.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ledger_sync.core.expense_class import capital_loss_sql_filter
from ledger_sync.core.ledger_clock import ledger_today
from ledger_sync.core.query_helpers import capital_loss_keys_for, fmt_year_month
from ledger_sync.db.models import Transaction, TransactionType, User, UserPreferences

from .registry import (
    ToolSpec,
    apply_date_range,
    ledger_scope,
    matching_categories,
    parse_date,
    register,
)
from .schemas import AggregateArguments

TIME_GRAINS = ("month", "quarter", "fiscal_year", "year")
OTHER = "Other"
_COLUMNS = {
    "category": Transaction.category,
    "subcategory": Transaction.subcategory,
    "account": Transaction.account,
    "type": Transaction.type,
}


def _label(value: Any) -> str:
    if isinstance(value, TransactionType):
        return value.value
    return str(value) if value else "(none)"


def _filtered(
    user: User, db: Session, args: dict[str, Any], select_stmt: Any
) -> tuple[Any, list[str]]:
    """The scoped statement with every filter applied, and the categories matched."""
    stmt = ledger_scope(user, select_stmt)
    kind = TransactionType(args["type"]) if args.get("type") else None
    if kind is not None:
        stmt = stmt.where(Transaction.type == kind)
    matched: list[str] = []
    for name in args.get("categories", []):
        matched.extend(matching_categories(db, user, name, kind)[0])
    if args.get("categories"):
        stmt = stmt.where(Transaction.category.in_(sorted(set(matched))))
    if args.get("subcategories"):
        wanted = [name.casefold() for name in args["subcategories"]]
        stmt = stmt.where(func.lower(Transaction.subcategory).in_(wanted))
    if args.get("accounts"):
        wanted = [name.casefold() for name in args["accounts"]]
        stmt = stmt.where(func.lower(Transaction.account).in_(wanted))
    if args.get("note_contains"):
        stmt = stmt.where(Transaction.note.icontains(args["note_contains"], autoescape=True))
    losses = capital_loss_sql_filter(capital_loss_keys_for(user))
    if losses is not None:
        stmt = stmt.where(or_(Transaction.type != TransactionType.EXPENSE, losses))
    start, end = parse_date(args.get("start_date")), parse_date(args.get("end_date"))
    return apply_date_range(stmt, start, end), sorted(set(matched))


def _measure(args: dict[str, Any]) -> Any:
    return (
        func.count()
        if args["measure"] == "count"
        else func.coalesce(func.sum(Transaction.amount), 0)
    )


def _period(month_key: str, grain: str, fy_start: int) -> str:
    year, month = int(month_key[:4]), int(month_key[5:7])
    if grain == "month":
        return month_key
    if grain == "year":
        return str(year)
    if grain == "quarter":
        return f"{year}-Q{(month - 1) // 3 + 1}"
    start_year = year if month >= fy_start else year - 1
    return f"FY{start_year}" if fy_start == 1 else f"FY{start_year}-{(start_year + 1) % 100:02d}"


def _months(first: str, last: str) -> list[str]:
    year, month = int(first[:4]), int(first[5:7])
    keys = []
    while f"{year:04d}-{month:02d}" <= last:
        keys.append(f"{year:04d}-{month:02d}")
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    return keys


def _time_series(user: User, db: Session, args: dict[str, Any]) -> dict[str, Any]:
    month = fmt_year_month(Transaction.date)
    split = _COLUMNS.get(args.get("split_by") or "")
    columns = [month, *([split] if split is not None else []), _measure(args), func.count()]
    stmt, matched = _filtered(user, db, args, select(*columns))
    stmt = stmt.group_by(month, *([split] if split is not None else []))
    raw = db.execute(stmt).all()
    fy_start = (
        db.scalar(
            select(UserPreferences.fiscal_year_start_month).where(
                UserPreferences.user_id == user.id
            )
        )
        or 4
    )
    today = ledger_today().strftime("%Y-%m")
    present = [row[0] for row in raw]
    first = (args.get("start_date") or (min(present) if present else today))[:7]
    last = min((args.get("end_date") or today)[:7], today)
    periods: dict[str, dict[str, float]] = {}
    for key in _months(first, last) if first <= last else []:
        periods.setdefault(_period(key, args["group_by"], fy_start), {})
    totals: dict[str, float] = defaultdict(float)
    transactions = 0
    for row in raw:
        series = _label(row[1]) if split is not None else "value"
        value, count = float(row[-2]), int(row[-1])
        bucket = periods.setdefault(_period(row[0], args["group_by"], fy_start), {})
        bucket[series] = bucket.get(series, 0.0) + value
        totals[series] += value
        transactions += count
    keep = sorted(totals, key=lambda name: -abs(totals[name]))[: args["series_limit"]]
    keys = sorted(periods)
    shown = keys[-args["limit"] :]
    rows = []
    for key in shown:
        bucket = periods[key]
        if split is None:
            rows.append({"period": key, "value": round(bucket.get("value", 0.0), 2)})
            continue
        values = {name: round(bucket.get(name, 0.0), 2) for name in keep}
        other = sum(v for name, v in bucket.items() if name not in keep)
        if len(totals) > len(keep):
            values[OTHER] = round(float(other), 2)
        rows.append(
            {"period": key, "values": values, "total": round(float(sum(bucket.values())), 2)}
        )
    result: dict[str, Any] = {
        "rows": rows,
        "transactions": transactions,
        "matched_categories": matched,
    }
    if split is not None:
        result["series"] = keep + ([OTHER] if len(totals) > len(keep) else [])
    if len(keys) > len(shown):
        result["earlier_periods_left_out"] = len(keys) - len(shown)
    return result


def _ranking(user: User, db: Session, args: dict[str, Any]) -> dict[str, Any]:
    column = _COLUMNS[args["group_by"]]
    value = _measure(args)
    stmt, matched = _filtered(user, db, args, select(column, value, func.count()))
    raw = db.execute(stmt.group_by(column).order_by(value.desc())).all()
    top = raw[: args["limit"]]
    result: dict[str, Any] = {
        "rows": [{"key": _label(row[0]), "value": round(float(row[1]), 2)} for row in top],
        "transactions": sum(int(row[2]) for row in raw),
        "matched_categories": matched,
    }
    if len(raw) > len(top):
        result["other"] = {
            "groups": len(raw) - len(top),
            "value": round(sum(float(r[1]) for r in raw[len(top) :]), 2),
        }
    return result


def _exec_aggregate(user: User, db: Session, args: dict[str, Any]) -> Any:
    body = (
        _time_series(user, db, args)
        if args["group_by"] in TIME_GRAINS
        else _ranking(user, db, args)
    )
    return {
        "group_by": args["group_by"],
        "split_by": args.get("split_by"),
        "measure": args["measure"],
        "start_date": args.get("start_date"),
        "end_date": args.get("end_date"),
        "today": ledger_today().isoformat(),
        **body,
        "note": "INR. Excluded accounts and classified capital-loss expenses are left out.",
    }


register(
    ToolSpec(
        name="aggregate_transactions",
        description=(
            "Sum or count the user's transactions grouped by month, quarter, fiscal_year or "
            "year (optionally split into series by category, account or type), or ranked by "
            "category, subcategory, account or type. Filter by type, categories (exact name, "
            "else substring), subcategories, accounts, note text and dates. Use it for any "
            "breakdown or history the other tools do not give, such as a category per month "
            "over several years. Periods with no rows are zero."
        ),
        arguments_model=AggregateArguments,
        execute=_exec_aggregate,
    )
)
