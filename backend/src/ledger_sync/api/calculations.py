"""Calculation API endpoints - All financial calculations.

Routes only: each body delegates to ``api/calculations_impl`` (SQL aggregates)
or ``services/calculation_service`` (bounded reads).
"""

from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Query

from ledger_sync.api.calculations_helpers import (
    _compute_account_statistics,
    _resolve_transaction_type,
)
from ledger_sync.api.calculations_impl import aggregates, categories
from ledger_sync.api.calculations_impl.insights import financial_insights
from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.db.models import TransactionType
from ledger_sync.services.calculation_service import (
    account_balances,
    category_monthly_history,
    income_analysis,
    parse_month_keys,
    quick_insights,
)

router = APIRouter(prefix="/api/calculations", tags=["calculations"])

# Annotated type aliases for common query parameters
OptionalStartDate = Annotated[datetime | None, Query()]
OptionalEndDate = Annotated[datetime | None, Query()]
OptionalTransactionType = Annotated[
    str | None, Query(description="Filter by type: Income or Expense")
]

INVALID_TRANSACTION_TYPE_RESPONSE: dict[int | str, dict[str, Any]] = {
    422: {"description": "transaction_type is not 'income' or 'expense'"},
}


@router.get("/categories/master")
def get_master_categories(
    current_user: CurrentUser,
    db: DatabaseSession,
) -> dict[str, Any]:
    """Get all unique categories and subcategories organized by transaction type.

    Returns a hierarchical structure of all categories used in the system,
    grouped by Income/Expense type, with subcategories under each category.

    Returns:
        {
            "income": {
                "Salary": ["Basic", "Bonus", "Allowances"],
                "Investment Returns": ["Dividends", "Interest"],
                ...
            },
            "expense": {
                "Groceries": ["Vegetables", "Dairy"],
                "Rent": ["Housing"],
                ...
            }
        }

    """
    return categories.master_categories(db, current_user)


@router.get("/totals")
def get_totals(
    current_user: CurrentUser,
    db: DatabaseSession,
    start_date: OptionalStartDate = None,
    end_date: OptionalEndDate = None,
) -> dict[str, Any]:
    """Calculate total income, expenses, and net savings.

    Fast path: when no date filters are provided, reads from pre-computed
    monthly_summaries table instead of scanning all raw transactions.

    A realised investment loss the user classified is held apart from
    ``total_expenses`` (see ``core.expense_class``) and is reported as its own
    ``capital_losses`` figure, so the money is republished rather than dropped.
    It still lowers ``net_savings`` and therefore ``savings_rate``, because the
    cash really left and net worth really fell -- see ``_totals_payload`` for why
    the rate is NOT redefined as a consumption ratio under its existing name.
    """
    return aggregates.totals(db, current_user, start_date, end_date)


@router.get("/monthly-aggregation")
def get_monthly_aggregation(
    current_user: CurrentUser,
    db: DatabaseSession,
    start_date: OptionalStartDate = None,
    end_date: OptionalEndDate = None,
) -> dict[str, Any]:
    """Calculate monthly income and expense aggregation.

    Fast path: reads directly from monthly_summaries when no date filter.
    """
    return aggregates.monthly_aggregation(db, current_user, start_date, end_date)


@router.get("/yearly-aggregation")
def get_yearly_aggregation(
    current_user: CurrentUser,
    db: DatabaseSession,
    start_date: OptionalStartDate = None,
    end_date: OptionalEndDate = None,
) -> dict[str, Any]:
    """Calculate yearly income and expense aggregation."""
    return aggregates.yearly_aggregation(db, current_user, start_date, end_date)


@router.get("/category-breakdown", responses=INVALID_TRANSACTION_TYPE_RESPONSE)
def get_category_breakdown(
    current_user: CurrentUser,
    db: DatabaseSession,
    start_date: OptionalStartDate = None,
    end_date: OptionalEndDate = None,
    transaction_type: OptionalTransactionType = None,
) -> dict[str, Any]:
    """Calculate spending/income breakdown by category and subcategory.

    Fast path: reads from category_trends when no date filter.

    ``transaction_type`` defaults to EXPENSE rather than "no filter", matching
    ``/category-monthly-history`` and ``/category-daily-series``. Omitting it
    used to mean "every type", which mixed TRANSFERS into a spending breakdown
    -- and transfers are the majority of rupee volume on a real ledger, so the
    top "categories" became self-transfers and every percentage was computed
    against a grand total that double-counted money moving between the user's
    own accounts. There is no legitimate caller wanting income, expenses and
    transfers summed into one category ranking.

    The two paths also disagreed on this. The fast path reads CategoryTrend,
    which ``trends.py`` builds only from non-transfer rows, so an unfiltered
    call returned transfer-free numbers there and transfer-polluted numbers from
    the date-filtered fallback below -- the same request answered two different
    ways depending on whether a date was supplied.
    """
    tx_type = _resolve_transaction_type(transaction_type) or TransactionType.EXPENSE
    return categories.category_breakdown(db, current_user, start_date, end_date, tx_type)


@router.get("/account-balances")
def get_account_balances(
    current_user: CurrentUser,
    db: DatabaseSession,
    start_date: OptionalStartDate = None,
    end_date: OptionalEndDate = None,
) -> dict[str, Any]:
    """Calculate current balance for each account including transfers.

    Aggregated in SQL (income/expense by ``account``, transfers by
    ``from_account`` and ``to_account``) instead of hydrating every row.
    """
    return _compute_account_statistics(account_balances(db, current_user, start_date, end_date))


@router.get("/insights")
def get_financial_insights(
    current_user: CurrentUser,
    db: DatabaseSession,
    start_date: OptionalStartDate = None,
    end_date: OptionalEndDate = None,
) -> dict[str, Any]:
    """Calculate comprehensive financial insights.

    Classified realised capital losses are not spending here, as on ``/totals``;
    ``savings_rate`` still nets them off. Reads five projected columns rather
    than hydrating every transaction.
    """
    return financial_insights(db, current_user, start_date, end_date)


@router.get(
    "/category-monthly-history",
    responses={422: {"description": "Invalid month keys or transaction_type"}},
)
def get_category_monthly_history(
    current_user: CurrentUser,
    db: DatabaseSession,
    months: Annotated[
        str, Query(max_length=2400, description="Up to 120 comma-separated YYYY-MM keys")
    ],
    transaction_type: OptionalTransactionType = None,
) -> dict[str, list[float]]:
    """Per-category spend aligned to a caller-supplied list of month keys.

    Powers the CategoryBreakdown sparkline (trailing 12 calendar months). The
    client passes the exact month keys it wants (computed with its local
    calendar), so buckets line up regardless of server timezone. Returns
    ``{ category_name: [m0, m1, ...] }`` (absolute sums, 0 for empty months).
    """
    try:
        month_keys = parse_month_keys(months)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    tx_type = _resolve_transaction_type(transaction_type) or TransactionType.EXPENSE
    return category_monthly_history(db, current_user, month_keys, tx_type)


@router.get("/data-date-range")
def get_data_date_range(
    current_user: CurrentUser,
    db: DatabaseSession,
) -> dict[str, str | None]:
    """Min/max transaction date (YYYY-MM-DD) for the user's active rows.

    Powers the analytics time-filter's navigation bounds without shipping the
    full ledger just to find the first/last date. Excluded-accounts and
    soft-delete filters are applied (same base query as analytics).
    """
    return aggregates.data_date_range(db, current_user)


@router.get("/income-facets")
def get_income_facets(
    current_user: CurrentUser,
    db: DatabaseSession,
) -> dict[str, list[dict[str, Any]]]:
    """Every ``(category, subcategory)`` income bucket with its row count and sum.

    Powers the Settings income-classification audit, which reconciles the four
    saved ``*_income_categories`` preference lists against what the ledger
    actually carries. Those lists are EXACT-MATCH key sets and a stored
    non-empty list is honoured verbatim, so a bucket missing from all four is
    silently unclassified and a saved key matching no row silently sums zero.
    Answering "which buckets exist, and how much money is in each?" needs the
    counts and totals, which ``/categories/master`` (distinct names only) does
    not carry.

    Reads raw transactions rather than the ``category_trends`` rollup: the
    rollup can lag a fresh import, and a bucket missing from it would read as
    "already classified" -- exactly the silent gap this endpoint exists to
    close. Aggregated in SQL, so the response is a few rows either way.
    """
    return categories.income_facets(db, current_user)


@router.get("/income-analysis")
def get_income_analysis(
    current_user: CurrentUser,
    db: DatabaseSession,
    start_date: OptionalStartDate = None,
    end_date: OptionalEndDate = None,
    cashback_categories: Annotated[
        list[str] | None,
        Query(description="Non-taxable 'Category::Subcategory' keys for cashback matching"),
    ] = None,
    category: Annotated[
        str | None, Query(description="Deep-link: restrict to one category")
    ] = None,
) -> dict[str, Any]:
    """Income page stats: total, by-category, monthly trend (+3mo avg), cashback.

    The cashback classification list is the user's
    ``non_taxable_income_categories`` preference, forwarded by the client so the
    backend reproduces the same matching without owning a second preference
    source. ``category`` mirrors the page's ``?category=`` deep-link filter.
    Replaces the full-ledger fetch on the Income Analysis page.
    """
    return income_analysis(
        db,
        current_user,
        start_date=start_date,
        end_date=end_date,
        cashback_categories=cashback_categories or [],
        category=category,
    )


@router.get("/category-daily-series", responses=INVALID_TRANSACTION_TYPE_RESPONSE)
def get_category_daily_series(
    current_user: CurrentUser,
    db: DatabaseSession,
    start_date: OptionalStartDate = None,
    end_date: OptionalEndDate = None,
    transaction_type: OptionalTransactionType = None,
    category: Annotated[str | None, Query(description="Restrict to one category")] = None,
) -> dict[str, Any]:
    """Daily per-(category, subcategory) sums for time-series charts.

    Powers MultiCategoryTimeAnalysis (all categories -> client picks top N) and
    EnhancedSubcategoryAnalysis (single ``category`` -> subcategory breakdown).
    The client keeps its own day/week/month bucketing + cumulative logic; this
    just ships daily aggregates (date, category, subcategory, amount) instead of
    the full ledger. Absolute amounts; expense by default.
    """
    tx_type = _resolve_transaction_type(transaction_type) or TransactionType.EXPENSE
    return categories.category_daily_series(
        db, current_user, start_date, end_date, tx_type, category
    )


@router.get("/quick-insights")
def get_quick_insights(
    current_user: CurrentUser,
    db: DatabaseSession,
    start_date: OptionalStartDate = None,
    end_date: OptionalEndDate = None,
) -> dict[str, Any]:
    """Raw-transaction-derived Quick Insights stats, date-range aware.

    Net cashback, median/biggest/avg expense, weekend split, peak weekday,
    transfers, top income source, and most-expensive month -- the values the
    Dashboard band previously computed client-side over the full ledger.
    Income/expense totals and category breakdown stay on their existing
    rollup-backed endpoints (``/totals``, ``/category-breakdown``). Computed
    from SQL aggregates; the median reads only the middle amounts.
    """
    return quick_insights(db, current_user, start_date, end_date)


@router.get("/daily-net-worth")
def get_daily_net_worth(
    current_user: CurrentUser,
    db: DatabaseSession,
    start_date: OptionalStartDate = None,
    end_date: OptionalEndDate = None,
) -> dict[str, Any]:
    """Calculate daily income and expense data for net worth trends.

    The cumulative ``net_worth`` series is seeded with the user's
    pre-window opening balance (``SUM(income) - SUM(expense)`` for
    transactions strictly before ``start_date``) so a date-filtered
    chart doesn't reset to zero on day one of the window. With no
    ``start_date`` the opening balance is zero and the series starts
    from the first transaction as before.

    Transfers are deliberately excluded from the cashflow model here so
    movements between user-owned accounts (e.g. SIPs, EMI prepayments)
    don't double-count or vanish.

    Unlike ``/totals`` and the aggregation endpoints, this one does NOT split
    classified realised losses out of ``expense``: the series is cumulative net
    worth, and a realised loss genuinely destroyed that cash. Excluding it would
    make the curve drift permanently above the user's real balances. The split
    only matters where a figure claims to measure consumption.
    """
    return aggregates.daily_net_worth(db, current_user, start_date, end_date)


@router.get("/top-categories", responses=INVALID_TRANSACTION_TYPE_RESPONSE)
def get_top_categories(
    current_user: CurrentUser,
    db: DatabaseSession,
    start_date: OptionalStartDate = None,
    end_date: OptionalEndDate = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 10,
    transaction_type: OptionalTransactionType = None,
) -> list[dict[str, Any]]:
    """Get top N categories by amount.

    Defaults to EXPENSE for the same reason as ``/category-breakdown``: with no
    type filter this ranked transfers alongside spending, and since transfers
    dominate rupee volume the "top categories" were the user's own account
    moves, with every ``percentage`` divided by a transfer-inflated grand total.
    """
    tx_type = _resolve_transaction_type(transaction_type) or TransactionType.EXPENSE
    return categories.top_categories(
        db, current_user, start_date, end_date, limit=limit, tx_type=tx_type
    )
