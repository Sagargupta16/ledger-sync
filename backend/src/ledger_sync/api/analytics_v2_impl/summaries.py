"""V2 endpoints: monthly, daily, investment holdings, category trends, transfer flows."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Query
from sqlalchemy import desc, func, or_
from sqlalchemy.orm import Session

from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.core.analytics.merchant_extract import PLACEHOLDER_NOTES
from ledger_sync.core.expense_class import (
    KEY_SEPARATOR,
    capital_loss_keys,
    is_capital_loss,
    looks_like_capital_loss,
)
from ledger_sync.core.ledger_clock import ledger_today_iso
from ledger_sync.core.query_helpers import fmt_date
from ledger_sync.db.models import (
    CategoryTrend,
    CohortSpending,
    DailySummary,
    ImportLog,
    InvestmentHolding,
    MonthlySummary,
    Transaction,
    TransactionType,
    TransferFlow,
    UserPreferences,
)

router = APIRouter()

# The catch-all bucket the categoriser falls back to. Counted as
# uncategorised because it carries no analytical meaning.
CATCH_ALL_CATEGORY = "Miscellaneous"


@router.get("/monthly-summaries")
def get_monthly_summaries(
    current_user: CurrentUser,
    db: DatabaseSession,
    start_period: Annotated[str | None, Query(description="Start period (YYYY-MM)")] = None,
    end_period: Annotated[str | None, Query(description="End period (YYYY-MM)")] = None,
    limit: Annotated[int, Query(ge=1, le=600, description="Number of months to return")] = 120,
) -> dict[str, Any]:
    """Get pre-calculated monthly summaries.

    Returns comprehensive monthly data including:
    - Income breakdown (salary, investment, other)
    - Expense breakdown (essential vs discretionary)
    - Savings metrics
    - Month-over-month changes

    Earning-start-date is deliberately NOT applied here. This endpoint
    returns factual monthly aggregates; view-window cropping belongs on
    the frontend chart layer, not in the data source.
    """
    query = (
        db.query(MonthlySummary)
        .filter(MonthlySummary.user_id == current_user.id)
        .order_by(desc(MonthlySummary.period_key))
    )

    if start_period:
        query = query.filter(MonthlySummary.period_key >= start_period)
    if end_period:
        query = query.filter(MonthlySummary.period_key <= end_period)

    summaries = query.limit(limit).all()

    return {
        "data": [
            {
                "period": s.period_key,
                "year": s.year,
                "month": s.month,
                "income": {
                    "total": float(s.total_income),
                    "salary": float(s.salary_income),
                    "investment": float(s.investment_income),
                    "other": float(s.other_income),
                    "count": s.income_count,
                    "change_pct": s.income_change_pct,
                },
                "expenses": {
                    "total": float(s.total_expenses),
                    "essential": float(s.essential_expenses),
                    "discretionary": float(s.discretionary_expenses),
                    "count": s.expense_count,
                    "change_pct": s.expense_change_pct,
                },
                # Realised investment losses the user classified. Reported
                # alongside expenses rather than inside them: the money left but
                # nothing was consumed, so it is out of "total" above and out of
                # ``expense_ratio`` (the consumption share), while ``savings.net``
                # and ``savings.rate`` -- which is net over income, same
                # definition it always had -- both still net it off.
                "capital_losses": float(s.capital_losses),
                "transfers": {
                    "out": float(s.total_transfers_out),
                    "in": float(s.total_transfers_in),
                    "net_investment": float(s.net_investment_flow),
                    "count": s.transfer_count,
                },
                "savings": {
                    "net": float(s.net_savings),
                    "rate": s.savings_rate,
                },
                "expense_ratio": s.expense_ratio,
                "total_transactions": s.total_transactions,
                "last_calculated": (s.last_calculated.isoformat() if s.last_calculated else None),
            }
            for s in summaries
        ],
        "count": len(summaries),
    }


@router.get("/daily-summaries")
def get_daily_summaries(
    current_user: CurrentUser,
    db: DatabaseSession,
    start_date: Annotated[str | None, Query(description="Start date (YYYY-MM-DD)")] = None,
    end_date: Annotated[str | None, Query(description="End date (YYYY-MM-DD)")] = None,
    limit: Annotated[int, Query(ge=1, le=3000, description="Max days to return")] = 1500,
) -> dict[str, Any]:
    """Get pre-calculated daily summaries.

    Used by YearInReview heatmap and daily trend charts.
    Returns daily income/expense/net totals with transaction counts.

    Earning-start-date is deliberately NOT applied here. View-window
    cropping belongs on the frontend chart layer.
    """
    query = db.query(DailySummary).filter(DailySummary.user_id == current_user.id)

    if start_date:
        query = query.filter(DailySummary.date >= start_date)
    if end_date:
        query = query.filter(DailySummary.date <= end_date)

    # Order desc + limit to get most recent days, then reverse for chronological output
    days = query.order_by(DailySummary.date.desc()).limit(limit).all()
    days.reverse()

    return {
        "data": [
            {
                "date": d.date,
                "income": float(d.total_income),
                "expense": float(d.total_expenses),
                "net": float(d.net),
                "income_count": d.income_count,
                "expense_count": d.expense_count,
                "transfer_count": d.transfer_count,
                "total_transactions": d.total_transactions,
                "top_category": d.top_category,
            }
            for d in days
        ],
        "count": len(days),
    }


# Python weekday() is Mon=0..Sun=6; the frontend chart orders Sun..Sat (JS
# getDay). Map at the API boundary so the client renders rows directly.
_PY_WEEKDAY_TO_JS = {0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 0}


@router.get("/cohort-spending")
def get_cohort_spending(
    current_user: CurrentUser,
    db: DatabaseSession,
) -> dict[str, Any]:
    """Get pre-calculated average-spend cohorts.

    Three dimensions, each with an occurrence-correct divisor baked into
    ``avg`` (see ``CohortSpending``):
    - ``day_of_week``: bucket 0=Sun..6=Sat (mapped from Python's Mon=0)
    - ``day_of_month``: bucket 1..31
    - ``month_of_year``: bucket 1..12

    Replaces the client-side bucketing that pulled every transaction; also
    removes the timezone bug class (dates are extracted server-side from the
    stored naive local date).
    """
    rows = db.query(CohortSpending).filter(CohortSpending.user_id == current_user.id).all()

    result: dict[str, list[dict[str, Any]]] = {
        "day_of_week": [],
        "day_of_month": [],
        "month_of_year": [],
    }
    for r in rows:
        bucket = _PY_WEEKDAY_TO_JS[r.bucket] if r.dimension == "day_of_week" else r.bucket
        result.setdefault(r.dimension, []).append(
            {
                "bucket": bucket,
                "total": float(r.total_amount),
                "occurrences": r.occurrences,
                "avg": float(r.avg_amount),
            }
        )

    for buckets in result.values():
        buckets.sort(key=lambda b: b["bucket"])

    return {"data": result}


def _last_import(db: Session, user_id: int) -> dict[str, Any]:
    """Most recent import for *user_id*, plus how stale it is in days.

    ``imported_at`` is stored naive (the column is a plain ``DateTime`` on both
    SQLite and Postgres) with UTC values, so ``now`` is stripped of its tzinfo
    before subtracting -- mixing aware and naive raises.
    """
    log = (
        db.query(ImportLog)
        .filter(ImportLog.user_id == user_id)
        .order_by(desc(ImportLog.imported_at))
        .first()
    )
    if log is None:
        return {
            "last_import_at": None,
            "days_stale": None,
            "last_import_file_name": None,
            "rows_processed": None,
            "rows_inserted": None,
            "rows_updated": None,
            "rows_skipped": None,
        }

    imported_at = log.imported_at
    reference = datetime.now(UTC)
    if imported_at.tzinfo is None:
        reference = reference.replace(tzinfo=None)
    days_stale = max(0, (reference - imported_at).days)

    return {
        "last_import_at": imported_at.isoformat(),
        "days_stale": days_stale,
        "last_import_file_name": log.file_name,
        "rows_processed": log.rows_processed,
        "rows_inserted": log.rows_inserted,
        "rows_updated": log.rows_updated,
        "rows_skipped": log.rows_skipped,
    }


def _rollup_freshness(db: Session, user_id: int) -> dict[str, Any]:
    """Whether the pre-aggregated tables kept up with the last import.

    Every analytics page reads rollups, not raw transactions, so a refresh that
    failed after a successful import leaves the whole workspace quietly serving
    the previous import's numbers. That is exactly what happened on this
    ledger: the 2026-07-26 import committed 508 inserts and 373 deletes, the
    post-upload refresh did not land, and every rollup table stayed stamped
    2026-07-04 -- July expenses displayed 74,523.22 against a true 107,651.65,
    understated by 33,128.43 (44%), for 22 days with nothing on screen to say so.

    ``upload.py`` deliberately does not fail an upload when the refresh blows up
    (the raw rows are already committed, and a Neon statement timeout must not
    reject good data), and the frontend's explicit ``/refresh`` pass can miss the
    same way. Neither leaves a mark the user can see. Comparing the newest
    ``last_calculated`` against the newest ``imported_at`` turns that silent
    divergence into a fact the client can render and act on.

    Both columns are naive UTC audit timestamps, so they compare directly.
    """
    rollups_at = (
        db.query(func.max(MonthlySummary.last_calculated))
        .filter(MonthlySummary.user_id == user_id)
        .scalar()
    )
    imported_at = (
        db.query(func.max(ImportLog.imported_at)).filter(ImportLog.user_id == user_id).scalar()
    )

    # Stale means "an import happened that the rollups have not absorbed". No
    # import at all is not stale -- there is nothing to be behind. Rollups
    # missing entirely while an import exists IS stale: that is the first-run
    # failure, and it reads as an empty workspace rather than a wrong one.
    if imported_at is None:
        stale = False
    else:
        stale = rollups_at is None or rollups_at < imported_at

    return {
        "rollups_calculated_at": rollups_at.isoformat() if rollups_at else None,
        "rollups_stale": stale,
    }


def _ledger_quality(db: Session, user_id: int) -> dict[str, Any]:
    """Row counts, date span, and the three data-quality counts.

    Dates go through ``fmt_date`` so the min/max compare and the
    future-dated test are plain ``YYYY-MM-DD`` string operations -- correct on
    both SQLite (``strftime``) and Postgres (``to_char``), and immune to the
    driver returning a naive vs aware datetime.

    Placeholder notes reuse ``PLACEHOLDER_NOTES``, the same canonical set
    merchant extraction refuses to turn into a merchant, matched on the
    lowercased and trimmed note. A single case-sensitive literal reported
    "unknown", "N/A", "-" and "misc" as clean data.
    """
    base = db.query(Transaction).filter(
        Transaction.user_id == user_id,
        Transaction.is_deleted.is_(False),
    )
    day = fmt_date(Transaction.date)
    # IST, via the central ledger clock: "after today" has to be judged in the
    # user's wall clock, and the rule lives in one place rather than being
    # restated per endpoint.
    today = ledger_today_iso()

    count, earliest, latest = base.with_entities(
        func.count(),
        func.min(day),
        func.max(day),
    ).one()

    future_dated_count = base.filter(day > today).count()
    placeholder_note_count = base.filter(
        func.lower(func.trim(Transaction.note)).in_(sorted(PLACEHOLDER_NOTES))
    ).count()
    uncategorized_count = base.filter(
        or_(
            Transaction.category.is_(None),
            func.trim(Transaction.category) == "",
            Transaction.category == CATCH_ALL_CATEGORY,
        )
    ).count()

    return {
        "transaction_count": count,
        "earliest_date": earliest,
        "latest_date": latest,
        "future_dated_count": future_dated_count,
        "placeholder_note_count": placeholder_note_count,
        "uncategorized_count": uncategorized_count,
    }


def _unclassified_capital_losses(db: Session, user_id: int) -> dict[str, Any]:
    """Surface EXPENSE taxonomies that read like realised investment losses.

    THIS IS THE WHOLE POINT OF THE DETECTION LAYER. A realised trading loss has
    to be booked as an ``EXPENSE`` for a cashbook's cash column to balance, but
    it bought nothing, so summing it as spending inflates expense totals, the
    essential/discretionary split, the 50/30/20 Wants share and the anomaly
    baseline simultaneously. Measured on one real ledger: 216,985.85 across 4
    rows, 5.43% of live expenses, dragging one month's savings rate from -68.4%
    to -180.1%.

    The fix is NOT to reclassify. The rows are typed ``EXPENSE`` in the user's
    own ledger and only they can say a given row is a loss, so this reports
    candidates and the user decides via ``PUT
    /api/preferences/capital-loss-categories``. Anything already classified is
    filtered out, so the signal empties as they work through it.

    Aggregation happens in SQL over the DISTINCT taxonomy pairs, not per row, so
    the regex pass is bounded by the size of the user's taxonomy (tens) rather
    than their ledger (thousands).
    """
    rows = (
        db.query(
            Transaction.category,
            Transaction.subcategory,
            func.count().label("txn_count"),
            func.coalesce(func.sum(Transaction.amount), 0).label("total"),
        )
        .filter(
            Transaction.user_id == user_id,
            Transaction.is_deleted.is_(False),
            Transaction.type == TransactionType.EXPENSE,
        )
        .group_by(Transaction.category, Transaction.subcategory)
        .all()
    )

    prefs = (
        db.query(UserPreferences.capital_loss_categories)
        .filter(UserPreferences.user_id == user_id)
        .scalar()
    )
    already_classified = capital_loss_keys(prefs)

    candidates = [
        {
            "category": row.category,
            "subcategory": row.subcategory,
            # The exact key PUT /api/preferences/capital-loss-categories
            # expects, so the client never has to build it and cannot drift
            # from the separator the backend parses.
            "key": f"{row.category or ''}{KEY_SEPARATOR}{row.subcategory or ''}",
            "transaction_count": int(row.txn_count or 0),
            "total_amount": float(row.total or 0),
        }
        for row in rows
        if looks_like_capital_loss(row.category, row.subcategory)
        and not is_capital_loss(row.category, row.subcategory, already_classified)
    ]
    candidates.sort(key=lambda c: float(c["total_amount"]), reverse=True)

    return {
        "capital_loss_candidates": candidates,
        "capital_loss_candidate_count": sum(int(c["transaction_count"]) for c in candidates),
        "capital_loss_candidate_amount": sum(float(c["total_amount"]) for c in candidates),
    }


@router.get("/data-health")
def get_data_health(
    current_user: CurrentUser,
    db: DatabaseSession,
) -> dict[str, Any]:
    """Report freshness and quality of the user's imported ledger.

    Answers the questions a finance workspace should not make its user guess
    at: when did I last import, is that stale, and how much of what I imported
    is unusable?

    * Freshness -- ``last_import_at`` / ``days_stale`` and the row stats of the
      most recent ``import_logs`` entry, plus ``rollups_calculated_at`` /
      ``rollups_stale``: a successful import whose analytics refresh did not
      land leaves every page serving the PREVIOUS import's numbers, and that is
      otherwise invisible (see ``_rollup_freshness``).
    * Coverage -- ``transaction_count`` plus the ``earliest_date`` /
      ``latest_date`` span.
    * Quality -- ``future_dated_count`` (dated after today in IST, which skews
      any "current month" total), ``placeholder_note_count`` (the note is one of
      the canonical placeholders -- "Unknown", "N/A", "-", "misc" -- so
      merchant/recurring detection has nothing to match), and
      ``uncategorized_count`` (no category, or the ``Miscellaneous`` catch-all).
    * Misclassification -- ``capital_loss_candidates``: EXPENSE taxonomies that
      read like realised investment losses and are therefore being summed as
      spending. Reported, never auto-applied, because only the user can confirm
      it and confirming moves their historical expense totals.

    Excluded-accounts is deliberately NOT applied: this is a diagnostic about
    what was imported, and hiding rows the user has excluded from analytics
    would understate the real quality problem.
    """
    return {
        **_last_import(db, current_user.id),
        **_rollup_freshness(db, current_user.id),
        **_ledger_quality(db, current_user.id),
        **_unclassified_capital_losses(db, current_user.id),
    }


@router.get("/investment-holdings")
def get_investment_holdings(
    current_user: CurrentUser,
    db: DatabaseSession,
    active_only: Annotated[bool, Query(description="Only active holdings")] = True,
) -> dict[str, Any]:
    """Get auto-populated investment holdings derived from transaction data.

    Holdings are computed from transfer flows to/from investment accounts
    as defined in user preferences (investment_account_mappings).
    """
    query = (
        db.query(InvestmentHolding)
        .filter(InvestmentHolding.user_id == current_user.id)
        .order_by(desc(InvestmentHolding.invested_amount))
    )

    if active_only:
        query = query.filter(InvestmentHolding.is_active.is_(True))

    holdings = query.all()

    total_invested = sum(float(h.invested_amount) for h in holdings)
    total_current = sum(float(h.current_value) for h in holdings)

    return {
        "data": [
            {
                "id": h.id,
                "account": h.account,
                "investment_type": h.investment_type,
                "instrument_name": h.instrument_name,
                "invested_amount": float(h.invested_amount),
                "current_value": float(h.current_value),
                "realized_gains": float(h.realized_gains),
                "unrealized_gains": float(h.unrealized_gains),
                "is_active": h.is_active,
                "last_updated": h.last_updated.isoformat() if h.last_updated else None,
            }
            for h in holdings
        ],
        "count": len(holdings),
        "summary": {
            "total_invested": total_invested,
            "total_current_value": total_current,
            "total_gains": total_current - total_invested,
        },
    }


@router.get("/category-trends")
def get_category_trends(
    current_user: CurrentUser,
    db: DatabaseSession,
    category: Annotated[str | None, Query(description="Filter by category")] = None,
    transaction_type: Annotated[
        str | None, Query(description="Filter by type (Income/Expense)")
    ] = None,
    start_period: Annotated[str | None, Query(description="Start period (YYYY-MM)")] = None,
    end_period: Annotated[str | None, Query(description="End period (YYYY-MM)")] = None,
    limit: Annotated[int, Query(ge=1, le=5000)] = 1000,
) -> dict[str, Any]:
    """Get category-level trends over time.

    Useful for:
    - Time series charts per category
    - Category growth/decline analysis
    - Spending pattern identification

    Earning-start-date is deliberately NOT applied here. View-window
    cropping belongs on the frontend chart layer.
    """
    query = (
        db.query(CategoryTrend)
        .filter(CategoryTrend.user_id == current_user.id)
        .order_by(
            desc(CategoryTrend.period_key),
            desc(CategoryTrend.total_amount),
        )
    )

    if category:
        query = query.filter(CategoryTrend.category == category)
    if transaction_type:
        try:
            tx_type: TransactionType | str = TransactionType(transaction_type)
        except ValueError:
            tx_type = transaction_type
        query = query.filter(CategoryTrend.transaction_type == tx_type)
    if start_period:
        query = query.filter(CategoryTrend.period_key >= start_period)
    if end_period:
        query = query.filter(CategoryTrend.period_key <= end_period)

    trends = query.limit(limit).all()

    return {
        "data": [
            {
                "period": t.period_key,
                "category": t.category,
                "subcategory": t.subcategory,
                "type": t.transaction_type.value if t.transaction_type else None,
                "total": float(t.total_amount),
                "count": t.transaction_count,
                "avg": float(t.avg_transaction),
                "max": float(t.max_transaction),
                "min": float(t.min_transaction),
                "pct_of_monthly": t.pct_of_monthly_total,
                "mom_change": float(t.mom_change),
                "mom_change_pct": t.mom_change_pct,
            }
            for t in trends
        ],
        "count": len(trends),
    }


@router.get("/transfer-flows")
def get_transfer_flows(
    current_user: CurrentUser,
    db: DatabaseSession,
    min_amount: Annotated[float | None, Query(description="Minimum total amount")] = None,
    min_count: Annotated[int | None, Query(description="Minimum transaction count")] = None,
) -> dict[str, Any]:
    """Get aggregated transfer flows between accounts.

    Perfect for:
    - Sankey diagram visualization
    - Money flow analysis
    - Account relationship mapping
    """
    query = (
        db.query(TransferFlow)
        .filter(TransferFlow.user_id == current_user.id)
        .order_by(desc(TransferFlow.total_amount))
    )

    if min_amount:
        query = query.filter(TransferFlow.total_amount >= min_amount)
    if min_count:
        query = query.filter(TransferFlow.transaction_count >= min_count)

    flows = query.all()

    return {
        "data": [
            {
                "from": f.from_account,
                "to": f.to_account,
                "total": float(f.total_amount),
                "count": f.transaction_count,
                "avg": float(f.avg_transfer),
                "last_date": (f.last_transfer_date.isoformat() if f.last_transfer_date else None),
                "last_amount": (float(f.last_transfer_amount) if f.last_transfer_amount else None),
                "from_type": f.from_account_type,
                "to_type": f.to_account_type,
            }
            for f in flows
        ],
        "count": len(flows),
        # Summary for Sankey
        "summary": {
            "total_flow": sum(float(f.total_amount) for f in flows),
            "unique_accounts": len({f.from_account for f in flows} | {f.to_account for f in flows}),
        },
    }
