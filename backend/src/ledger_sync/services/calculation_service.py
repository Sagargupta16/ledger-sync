"""Bounded SQL reads for category history, income analysis, balances and insights."""

import calendar
import re
from collections import defaultdict
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import ColumnElement, and_, case, func
from sqlalchemy.orm import Query, Session

from ledger_sync.core.expense_class import capital_loss_sql_filter
from ledger_sync.core.query_helpers import (
    build_transaction_query,
    capital_loss_keys_for,
    fmt_date,
    fmt_year_month,
)
from ledger_sync.db.models import Transaction, TransactionType, User

MAX_HISTORY_MONTHS = 120
INCOME_ROLLING_MONTHS = 3
UNKNOWN_ACCOUNT = "Unknown"

#: ``abs(amount)`` typed as the amount column so both dialects return Decimal.
_MAGNITUDE = func.abs(Transaction.amount, type_=Transaction.amount.type)

#: THE cashback rule, shared by Quick Insights and Income Analysis: an income
#: row whose subcategory says cashback. Refunds, deposit returns and expense
#: reimbursements are money coming back, not a reward, so they are not cashback
#: even though they sit in the same non-taxable bucket.
_IS_CASHBACK = func.lower(func.coalesce(Transaction.subcategory, "")).like("%cashback%")


def _is_shared_cashback() -> ColumnElement[bool]:
    """A transfer passing cashback on to someone else; it nets off the cashback."""
    return and_(
        Transaction.type == TransactionType.TRANSFER,
        func.lower(func.coalesce(Transaction.to_account, "")).like("%cashback shared%"),
    )


def _amount_sum(expression: Any) -> Any:
    """``SUM`` typed as the amount column (exact Decimal on SQLite and PostgreSQL)."""
    return func.sum(expression, type_=Transaction.amount.type)


def parse_month_keys(months: str) -> list[str]:
    """Validate calendar keys, retaining order and duplicate-slot semantics."""
    keys = [key.strip() for key in months.split(",") if key.strip()]
    if len(keys) > MAX_HISTORY_MONTHS:
        raise ValueError(f"At most {MAX_HISTORY_MONTHS} month keys are allowed.")
    for key in keys:
        # ASCII so \d stays [0-9]: a Unicode digit would pass int() but never
        # match a stored YYYY-MM key.
        if re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", key, re.ASCII) is None or key.startswith("0000"):
            raise ValueError("Month keys must be valid YYYY-MM calendar months.")
    return keys


def category_monthly_history(
    db: Session, user: User, month_keys: list[str], tx_type: TransactionType
) -> dict[str, list[float]]:
    """Fetch only requested category/month sums, without hydrating transactions."""
    if not month_keys:
        return {}
    first_year, first_month = map(int, min(month_keys).split("-"))
    last_year, last_month = map(int, max(month_keys).split("-"))
    # Stored transaction dates are naive local calendar values.
    start = datetime(first_year, first_month, 1, tzinfo=UTC).replace(tzinfo=None)
    end = datetime(
        last_year,
        last_month,
        calendar.monthrange(last_year, last_month)[1],
        23,
        59,
        59,
        999999,
        tzinfo=UTC,
    ).replace(tzinfo=None)
    month = fmt_year_month(Transaction.date)
    rows = (
        build_transaction_query(db, user, start, end)
        .filter(
            Transaction.type == tx_type,
            Transaction.category != "",
            month.in_(set(month_keys)),
        )
        .with_entities(
            Transaction.category,
            month,
            func.sum(func.abs(Transaction.amount), type_=Transaction.amount.type),
        )
        .group_by(Transaction.category, month)
        .all()
    )
    index = {key: position for position, key in enumerate(month_keys)}
    result: dict[str, list[float]] = {}
    for category, key, amount in rows:
        result.setdefault(category, [0.0] * len(month_keys))[index[key]] = float(amount)
    return result


def income_analysis(
    db: Session,
    user: User,
    *,
    start_date: datetime | None,
    end_date: datetime | None,
    cashback_categories: list[str],
    category: str | None,
) -> dict[str, Any]:
    """Aggregate income before transfer; retain the existing response calculations.

    ``cashbacks_total`` is THE cashback figure Quick Insights reports: income
    rows whose subcategory says cashback, minus "cashback shared" transfers, in
    the same window and category filter. It used to be the sum of the whole
    client-sent non-taxable list, so refunds, deposit returns and expense
    reimbursements were shown as "Cashbacks Earned". That broader sum is kept,
    under its honest name, as the additive ``non_taxable_total``.

    Group by the original category/subcategory strings so Python's exact
    case-insensitive non-taxable matching remains consistent across SQL dialects.
    """
    base = build_transaction_query(db, user, start_date, end_date)
    if category:
        base = base.filter(Transaction.category == category)
    query = base.filter(Transaction.type == TransactionType.INCOME)
    month = fmt_year_month(Transaction.date)
    rows = (
        query.with_entities(
            Transaction.category,
            Transaction.subcategory,
            month,
            func.sum(func.abs(Transaction.amount), type_=Transaction.amount.type),
        )
        .group_by(Transaction.category, Transaction.subcategory, month)
        .all()
    )
    wanted = {value.lower() for value in cashback_categories}
    by_category: dict[str, Decimal] = defaultdict(Decimal)
    by_month: dict[str, Decimal] = defaultdict(Decimal)
    total = Decimal(0)
    non_taxable = Decimal(0)
    for cat, subcat, month_key, amount in rows:
        total += amount
        by_category[cat or "Other Income"] += amount
        by_month[month_key] += amount
        if f"{cat or ''}::{subcat or ''}".lower() in wanted:
            non_taxable += amount
    cashback_income, shared = base.with_entities(
        _amount_sum(
            case(
                (and_(Transaction.type == TransactionType.INCOME, _IS_CASHBACK), _MAGNITUDE),
                else_=0,
            )
        ),
        _amount_sum(case((_is_shared_cashback(), _MAGNITUDE), else_=0)),
    ).one()
    cashbacks = (cashback_income or Decimal(0)) - (shared or Decimal(0))

    monthly_data: list[dict[str, Any]] = []
    sorted_months = [(key, float(amount)) for key, amount in sorted(by_month.items())]
    for index, (month_key, amount) in enumerate(sorted_months):
        average = None
        if index + 1 >= INCOME_ROLLING_MONTHS:
            window = sorted_months[index + 1 - INCOME_ROLLING_MONTHS : index + 1]
            average = sum(value for _, value in window) / INCOME_ROLLING_MONTHS
        monthly_data.append(
            {
                "month": month_key,
                "income": amount,
                "income_avg_3m": average,
            }
        )
    non_zero = [amount for _, amount in sorted_months if amount > 0]
    growth = ((non_zero[-1] - non_zero[0]) / non_zero[0] * 100) if len(non_zero) >= 2 else 0.0
    return {
        "total_income": float(total),
        "category_breakdown": {key: float(amount) for key, amount in by_category.items()},
        "monthly_data": monthly_data,
        "cashbacks_total": float(cashbacks),
        "non_taxable_total": float(non_taxable),
        "peak_income": max((amount for _, amount in sorted_months), default=0.0),
        "growth_rate": growth,
    }


def _add_balance(
    balances: dict[str, dict[str, Any]],
    account: str | None,
    amount: Decimal,
    count: int,
    last: datetime,
) -> None:
    """Fold one grouped aggregate into its account entry ("Unknown" when blank)."""
    entry = balances.setdefault(
        account or UNKNOWN_ACCOUNT,
        {"balance": Decimal(0), "transactions": 0, "last_transaction": None},
    )
    entry["balance"] += amount
    entry["transactions"] += count
    if entry["last_transaction"] is None or last > entry["last_transaction"]:
        entry["last_transaction"] = last


def account_balances(
    db: Session,
    user: User,
    start_date: datetime | None,
    end_date: datetime | None,
) -> dict[str, dict[str, Any]]:
    """Per-account balance, row count and latest date from three GROUP BY reads.

    Income credits and expenses debit ``account``; a transfer debits
    ``from_account`` and credits ``to_account``, counting once on each side.
    Sums stay exact Decimal until the single float conversion at the end.
    """
    base = build_transaction_query(db, user, start_date, end_date)
    balances: dict[str, dict[str, Any]] = {}
    regular = (
        base.filter(Transaction.type != TransactionType.TRANSFER)
        .with_entities(
            Transaction.account,
            Transaction.type,
            _amount_sum(_MAGNITUDE),
            func.count(),
            func.max(Transaction.date),
        )
        .group_by(Transaction.account, Transaction.type)
        .order_by(Transaction.account, Transaction.type)
        .all()
    )
    for account, tx_type, total, count, last in regular:
        signed = total if tx_type == TransactionType.INCOME else Decimal(0) - total
        _add_balance(balances, account, signed, count, last)

    transfers = base.filter(Transaction.type == TransactionType.TRANSFER)
    for column, sign in ((Transaction.from_account, -1), (Transaction.to_account, 1)):
        rows = (
            transfers.with_entities(
                column, _amount_sum(_MAGNITUDE), func.count(), func.max(Transaction.date)
            )
            .group_by(column)
            .order_by(column)
            .all()
        )
        for account, total, count, last in rows:
            _add_balance(balances, account, total if sign > 0 else Decimal(0) - total, count, last)

    for entry in balances.values():
        entry["balance"] = float(entry["balance"])
    return balances


def _median_expense(expenses: Query[Transaction], count: int) -> float:
    """Median absolute expense, reading only the one or two middle amounts."""
    if count == 0:
        return 0.0
    middle = [
        float(value)
        for (value,) in expenses.with_entities(_MAGNITUDE)
        .order_by(_MAGNITUDE)
        .offset((count - 1) // 2)
        .limit(2 - count % 2)
        .all()
    ]
    return (middle[0] + middle[1]) / 2 if len(middle) == 2 else middle[0]


def _expense_days(expenses: Query[Transaction]) -> dict[str, Any]:
    """Expense count/total plus JS-weekday (Sun=0) and month buckets from daily sums."""
    day = fmt_date(Transaction.date)
    by_weekday: dict[int, Decimal] = dict.fromkeys(range(7), Decimal(0))
    by_month: dict[str, Decimal] = defaultdict(Decimal)
    total = Decimal(0)
    count = 0
    for day_key, amount, rows in (
        expenses.with_entities(day, _amount_sum(_MAGNITUDE), func.count())
        .group_by(day)
        .order_by(day)
        .all()
    ):
        total += amount
        count += rows
        # Python weekday() is Monday-zero; JS getDay() is Sunday-zero.
        by_weekday[(date.fromisoformat(day_key).weekday() + 1) % 7] += amount
        by_month[day_key[:7]] += amount
    return {"total": total, "count": count, "by_weekday": by_weekday, "by_month": by_month}


def _income_sources(base: Query[Transaction]) -> dict[str, Any]:
    """Income by category plus the substring-matched cashback total and count."""
    by_category: dict[str, Decimal] = defaultdict(Decimal)
    cashback = Decimal(0)
    cashback_count = 0
    for category, amount, matched, matched_count in (
        base.filter(Transaction.type == TransactionType.INCOME)
        .with_entities(
            Transaction.category,
            _amount_sum(_MAGNITUDE),
            _amount_sum(case((_IS_CASHBACK, _MAGNITUDE), else_=0)),
            func.sum(case((_IS_CASHBACK, 1), else_=0)),
        )
        .group_by(Transaction.category)
        .order_by(Transaction.category)
        .all()
    ):
        by_category[category or "Other"] += amount
        cashback += matched
        cashback_count += int(matched_count)
    return {"by_category": by_category, "cashback": cashback, "cashback_count": cashback_count}


def _top(totals: dict[str, Decimal]) -> tuple[str, Decimal] | None:
    return max(totals.items(), key=lambda kv: kv[1]) if totals else None


def quick_insights(
    db: Session,
    user: User,
    start_date: datetime | None,
    end_date: datetime | None,
) -> dict[str, Any]:
    """Dashboard Quick Insights from SQL aggregates, without loading the ledger.

    Same response shape as the client-side ``quickInsightsData.ts``: cashback is
    an Income subcategory SUBSTRING match minus transfers whose ``to_account``
    contains "cashback shared". A sum over no rows stays the integer 0.

    Every spending figure -- total, count, average, median, biggest, weekend and
    weekday split, peak weekday and most expensive month -- skips the rows the
    user classified as realised capital losses, the same rule ``/totals``
    applies, so the Dashboard band and the totals card agree. A loss bought
    nothing; counting it made a trading loss the "biggest expense".
    """
    base = build_transaction_query(db, user, start_date, end_date)
    is_transfer = Transaction.type == TransactionType.TRANSFER
    shared = _is_shared_cashback()
    min_date, max_date, transfer_total, transfer_count, shared_total, shared_count = (
        base.with_entities(
            func.min(Transaction.date),
            func.max(Transaction.date),
            _amount_sum(case((is_transfer, _MAGNITUDE), else_=0)),
            func.sum(case((is_transfer, 1), else_=0)),
            _amount_sum(case((shared, _MAGNITUDE), else_=0)),
            func.sum(case((shared, 1), else_=0)),
        ).one()
    )
    transfer_count = int(transfer_count or 0)
    expenses = base.filter(Transaction.type == TransactionType.EXPENSE)
    not_a_loss = capital_loss_sql_filter(capital_loss_keys_for(user))
    if not_a_loss is not None:
        expenses = expenses.filter(not_a_loss)
    days = _expense_days(expenses)
    income = _income_sources(base)
    count: int = days["count"]
    by_weekday: dict[int, Decimal] = days["by_weekday"]
    total_spending = float(days["total"]) if count else 0
    weekend = by_weekday[0] + by_weekday[6]
    peak_day = max(by_weekday, key=lambda d: by_weekday[d]) if count else 0
    biggest = (
        expenses.with_entities(_MAGNITUDE, Transaction.category).order_by(_MAGNITUDE.desc()).first()
    )
    has_cashback = income["cashback_count"] or shared_count
    net_cashback = float(income["cashback"] - (shared_total or Decimal(0))) if has_cashback else 0
    top_income = _top(income["by_category"])
    top_month = _top(days["by_month"])
    return {
        "min_date": min_date.date().isoformat() if min_date else None,
        "max_date": max_date.date().isoformat() if max_date else None,
        "net_cashback": net_cashback,
        "cashback_count": income["cashback_count"],
        "median_expense": _median_expense(expenses, count),
        "biggest_expense": {
            "amount": float(biggest[0]) if biggest else 0.0,
            "category": (biggest[1] or "") if biggest else "",
        },
        "avg_expense": (total_spending / count) if count else 0.0,
        "total_spending": total_spending,
        "expense_count": count,
        "weekend_spending": float(weekend),
        "weekday_spending": float(days["total"] - weekend),
        "peak_day": peak_day,
        "peak_day_total": float(by_weekday[peak_day]),
        "total_transfers": float(transfer_total) if transfer_count else 0,
        "transfer_count": transfer_count,
        "top_income_source": (
            {"category": top_income[0], "amount": float(top_income[1])} if top_income else None
        ),
        "most_expensive_month": (
            {"period": top_month[0], "amount": float(top_month[1])} if top_month else None
        ),
    }
