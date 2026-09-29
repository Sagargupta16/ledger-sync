"""Period aggregates for the calculations router: totals, month/year/day series."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import case, func
from sqlalchemy.orm import Session

from ledger_sync.core.query_helpers import (
    build_transaction_query,
    capital_loss_keys_for,
    capital_loss_sum_col,
    expense_sum_col,
    fmt_date,
    fmt_month,
    fmt_year,
    fmt_year_month,
    income_sum_col,
)
from ledger_sync.db.models import MonthlySummary, Transaction, TransactionType, User


def _totals_payload(
    *,
    total_income: float,
    total_expenses: float,
    capital_losses: float,
    transaction_count: int,
) -> dict[str, Any]:
    """Shape the ``/totals`` response identically on the fast and fallback paths.

    ``savings_rate`` is ``net_savings / total_income``, unchanged from before the
    capital-loss split, so the rate and the net on the same payload always agree.
    Redefining the rate to ``(income - expenses) / income`` while ``net_savings``
    kept netting the loss off would publish two different "savings" answers under
    one response, and would step a historical series upward the moment a user
    classified a category, with no rename to signal it.

    ``expense_ratio`` on ``/api/analytics/v2/monthly-summaries`` is the number
    that answers "what share of income did I CONSUME"; it is named for that and
    excludes the loss because ``total_expenses`` does.
    """
    net_savings = total_income - total_expenses - capital_losses
    return {
        "total_income": total_income,
        "total_expenses": total_expenses,
        "capital_losses": capital_losses,
        "net_savings": net_savings,
        "savings_rate": (net_savings / total_income * 100) if total_income > 0 else 0,
        "transaction_count": transaction_count,
    }


def totals(
    db: Session, user: User, start_date: datetime | None, end_date: datetime | None
) -> dict[str, Any]:
    """``/totals``: monthly_summaries fast path when unfiltered, else raw SQL."""
    # Fast path: aggregate from monthly_summaries when no date filter
    if start_date is None and end_date is None:
        summaries = (
            db.query(
                func.coalesce(func.sum(MonthlySummary.total_income), 0).label("total_income"),
                func.coalesce(func.sum(MonthlySummary.total_expenses), 0).label("total_expenses"),
                func.coalesce(func.sum(MonthlySummary.capital_losses), 0).label("capital_losses"),
                func.coalesce(func.sum(MonthlySummary.total_transactions), 0).label("tx_count"),
            )
            .filter(MonthlySummary.user_id == user.id)
            .one()
        )
        if summaries.tx_count > 0:
            return _totals_payload(
                total_income=float(summaries.total_income),
                total_expenses=float(summaries.total_expenses),
                capital_losses=float(summaries.capital_losses),
                transaction_count=summaries.tx_count,
            )

    # Fallback: compute from raw transactions with date filters
    loss_keys = capital_loss_keys_for(user)
    base = build_transaction_query(db, user, start_date, end_date).subquery()

    row = db.query(
        income_sum_col(base),
        expense_sum_col(base, loss_keys=loss_keys),
        # expense_sum_col dropped these rows; report them under their own name
        # rather than losing the amount entirely.
        capital_loss_sum_col(base, loss_keys=loss_keys),
        func.count().label("transaction_count"),
    ).one()

    return _totals_payload(
        total_income=float(row.total_income),
        total_expenses=float(row.total_expenses),
        capital_losses=float(row.capital_losses),
        transaction_count=row.transaction_count,
    )


def monthly_aggregation(
    db: Session, user: User, start_date: datetime | None, end_date: datetime | None
) -> dict[str, Any]:
    """``/monthly-aggregation``: per ``YYYY-MM`` income, expense and loss sums."""
    # Fast path: read from pre-computed monthly_summaries
    if start_date is None and end_date is None:
        summaries = (
            db.query(MonthlySummary)
            .filter(MonthlySummary.user_id == user.id)
            .order_by(MonthlySummary.period_key)
            .all()
        )
        if summaries:
            return {
                s.period_key: {
                    "income": float(s.total_income),
                    "expense": float(s.total_expenses),
                    "capital_losses": float(s.capital_losses),
                    "net_savings": float(s.net_savings),
                    "transactions": s.total_transactions,
                    "income_count": s.income_count,
                    "expense_count": s.expense_count,
                }
                for s in summaries
            }

    # Fallback: compute from raw transactions with date filters
    loss_keys = capital_loss_keys_for(user)
    base = build_transaction_query(db, user, start_date, end_date).subquery()
    month_col = fmt_year_month(base.c.date).label("month")
    income_count_col = func.sum(case((base.c.type == TransactionType.INCOME, 1), else_=0)).label(
        "income_count"
    )
    expense_count_col = func.sum(case((base.c.type == TransactionType.EXPENSE, 1), else_=0)).label(
        "expense_count"
    )

    rows = (
        db.query(
            month_col,
            income_sum_col(base, label="income"),
            expense_sum_col(base, label="expense", loss_keys=loss_keys),
            # Classified realised losses are excluded from "expense" above, so
            # report them under their own name rather than dropping the amount.
            capital_loss_sum_col(base, loss_keys=loss_keys),
            func.count().label("transactions"),
            income_count_col,
            expense_count_col,
        )
        .group_by(month_col)
        .all()
    )

    monthly_data: dict[str, dict[str, float]] = {}
    for row in rows:
        income = float(row.income)
        expense = float(row.expense)
        capital_losses = float(row.capital_losses)
        monthly_data[row.month] = {
            "income": income,
            "expense": expense,
            "capital_losses": capital_losses,
            "net_savings": income - expense - capital_losses,
            "transactions": row.transactions,
            "income_count": int(row.income_count or 0),
            "expense_count": int(row.expense_count or 0),
        }

    return monthly_data


def yearly_aggregation(
    db: Session, user: User, start_date: datetime | None, end_date: datetime | None
) -> dict[str, Any]:
    """``/yearly-aggregation``: per-year sums plus the months each year contains."""
    loss_keys = capital_loss_keys_for(user)
    base = build_transaction_query(db, user, start_date, end_date).subquery()
    year_col = fmt_year(base.c.date).label("year")

    rows = (
        db.query(
            year_col,
            income_sum_col(base, label="income"),
            expense_sum_col(base, label="expense", loss_keys=loss_keys),
            capital_loss_sum_col(base, loss_keys=loss_keys),
            func.count().label("transactions"),
        )
        .group_by(year_col)
        .all()
    )

    # Fetch distinct months per year for the "months" list
    month_detail_rows = (
        db.query(
            fmt_year(base.c.date).label("year"),
            fmt_month(base.c.date).label("month"),
        )
        .distinct()
        .all()
    )

    year_months: dict[str, list[int]] = {}
    for yr, mn in month_detail_rows:
        year_months.setdefault(yr, []).append(int(mn))

    yearly_data: dict[str, dict[str, Any]] = {}
    for row in rows:
        income = float(row.income)
        expense = float(row.expense)
        capital_losses = float(row.capital_losses)
        yearly_data[row.year] = {
            "income": income,
            "expense": expense,
            "capital_losses": capital_losses,
            "net_savings": income - expense - capital_losses,
            "transactions": row.transactions,
            "months": sorted(year_months.get(row.year, [])),
        }

    return yearly_data


def data_date_range(db: Session, user: User) -> dict[str, str | None]:
    """Min/max active transaction date as ``YYYY-MM-DD`` (``None`` when empty)."""
    base = build_transaction_query(db, user).subquery()
    row = db.query(
        func.min(base.c.date).label("min_date"),
        func.max(base.c.date).label("max_date"),
    ).one()
    return {
        "min_date": row.min_date.strftime("%Y-%m-%d") if row.min_date else None,
        "max_date": row.max_date.strftime("%Y-%m-%d") if row.max_date else None,
    }


def daily_net_worth(
    db: Session, user: User, start_date: datetime | None, end_date: datetime | None
) -> dict[str, Any]:
    """``/daily-net-worth``: daily cashflow plus a cumulative series seeded with
    the pre-window opening balance. Losses stay in ``expense`` here on purpose.
    """
    # Opening balance = cashflow before the window start. Computed only
    # when a start_date is supplied; otherwise it's zero and the series
    # behaves identically to the pre-fix implementation.
    opening_balance = 0.0
    if start_date is not None:
        opening_base = (
            build_transaction_query(db, user, start_date=None, end_date=None)
            .filter(Transaction.date < start_date)
            .subquery()
        )
        opening_row = db.query(
            income_sum_col(opening_base, label="income"),
            expense_sum_col(opening_base, label="expense"),
        ).one()
        opening_balance = float(opening_row.income) - float(opening_row.expense)

    base = build_transaction_query(db, user, start_date, end_date).subquery()
    date_col = fmt_date(base.c.date).label("date_key")

    rows = (
        db.query(
            date_col,
            income_sum_col(base, label="income"),
            expense_sum_col(base, label="expense"),
        )
        .group_by(date_col)
        .order_by(date_col)
        .all()
    )

    daily_data: dict[str, dict[str, float]] = {}
    cumulative_net_worth = opening_balance
    cumulative_data = []

    for row in rows:
        income = float(row.income)
        expense = float(row.expense)
        daily_data[row.date_key] = {
            "income": income,
            "expense": expense,
            "date": row.date_key,
        }
        cumulative_net_worth += income - expense
        cumulative_data.append(
            {
                "date": row.date_key,
                "net_worth": cumulative_net_worth,
                "income": income,
                "expense": expense,
            },
        )

    return {
        "daily_data": daily_data,
        "cumulative_data": cumulative_data,
        # Surfaced so frontends can render a "starting balance" annotation
        # or use it to align the chart's y-axis.
        "opening_balance": opening_balance,
    }
