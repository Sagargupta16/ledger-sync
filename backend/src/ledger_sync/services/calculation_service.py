"""Bounded SQL reads for category history and income analysis."""

import calendar
import re
from collections import defaultdict
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from ledger_sync.core.query_helpers import build_transaction_query, fmt_year_month
from ledger_sync.db.models import Transaction, TransactionType, User

MAX_HISTORY_MONTHS = 120
INCOME_ROLLING_MONTHS = 3


def parse_month_keys(months: str) -> list[str]:
    """Validate calendar keys, retaining order and duplicate-slot semantics."""
    keys = [key.strip() for key in months.split(",") if key.strip()]
    if len(keys) > MAX_HISTORY_MONTHS:
        raise ValueError(f"At most {MAX_HISTORY_MONTHS} month keys are allowed.")
    for key in keys:
        if re.fullmatch(r"[0-9]{4}-(0[1-9]|1[0-2])", key) is None or key.startswith("0000"):
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

    Group by the original category/subcategory strings so Python's exact
    case-insensitive cashback matching remains consistent across SQL dialects.
    """
    query = build_transaction_query(db, user, start_date, end_date).filter(
        Transaction.type == TransactionType.INCOME
    )
    if category:
        query = query.filter(Transaction.category == category)
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
    cashbacks = Decimal(0)
    for cat, subcat, month_key, amount in rows:
        total += amount
        by_category[cat or "Other Income"] += amount
        by_month[month_key] += amount
        if f"{cat or ''}::{subcat or ''}".lower() in wanted:
            cashbacks += amount

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
        "peak_income": max((amount for _, amount in sorted_months), default=0.0),
        "growth_rate": growth,
    }
