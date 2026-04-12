"""Analytics V2 API endpoints - Enhanced analytics from stored aggregations.

This module provides fast analytics endpoints that read from pre-calculated
aggregation tables rather than computing on-the-fly.

All aggregation tables are scoped to user_id for multi-user safety.
"""

from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import desc

from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.db.models import (
    Anomaly,
    AnomalyType,
    Budget,
    CategoryTrend,
    DailySummary,
    FinancialGoal,
    FYSummary,
    InvestmentHolding,
    MerchantIntelligence,
    MonthlySummary,
    NetWorthSnapshot,
    RecurrenceFrequency,
    RecurringTransaction,
    TransactionType,
    TransferFlow,
    User,
)

_FREQUENCY_DAYS = {
    "daily": 1,
    "weekly": 7,
    "biweekly": 14,
    "monthly": 30,
    "bimonthly": 61,
    "quarterly": 91,
    "semiannual": 182,
    "yearly": 365,
}


def _compute_next_expected(
    last_occurrence: datetime | None,
    frequency: str | None,
    expected_day: int | None,
) -> str | None:
    """Estimate the next expected date from last occurrence + frequency."""
    if not last_occurrence or not frequency:
        return None
    freq = frequency.lower()
    if freq == "monthly" and expected_day:
        month = last_occurrence.month
        year = last_occurrence.year
        while True:
            month += 1
            if month > 12:
                month = 1
                year += 1
            day = min(expected_day, 28)
            candidate = last_occurrence.replace(year=year, month=month, day=day)
            if candidate > last_occurrence:
                return candidate.isoformat()
    days = _FREQUENCY_DAYS.get(freq)
    if days:
        return (last_occurrence + timedelta(days=days)).isoformat()
    return None


router = APIRouter(prefix="/api/analytics/v2", tags=["analytics-v2"])


class CreateBudgetRequest(BaseModel):
    category: str
    monthly_limit: float
    subcategory: str | None = None
    alert_threshold: float = 80.0


class CreateGoalRequest(BaseModel):
    name: str
    target_amount: float
    goal_type: str = "savings"
    notes: str | None = None
    target_date: str | None = None


class ReviewAnomalyRequest(BaseModel):
    dismiss: bool = False
    notes: str | None = None


def _get_earning_start_period(user: User) -> str | None:
    """Return the earning start date as a YYYY-MM period key, or None."""
    prefs = user.preferences
    if prefs is None:
        return None
    if not prefs.use_earning_start_date or not prefs.earning_start_date:
        return None
    # earning_start_date is YYYY-MM-DD; take first 7 chars for YYYY-MM
    return prefs.earning_start_date[:7]


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
    """
    # Clamp start_period to earning start date if enabled
    earning_period = _get_earning_start_period(current_user)
    if earning_period:
        start_period = max(start_period, earning_period) if start_period else earning_period

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
    """
    earning_period = _get_earning_start_period(current_user)
    earning_date = f"{earning_period}-01" if earning_period else None

    query = db.query(DailySummary).filter(DailySummary.user_id == current_user.id)

    effective_start = start_date
    if earning_date:
        effective_start = max(effective_start, earning_date) if effective_start else earning_date
    if effective_start:
        query = query.filter(DailySummary.date >= effective_start)
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
    """
    # Clamp start_period to earning start date if enabled
    earning_period = _get_earning_start_period(current_user)
    if earning_period:
        start_period = max(start_period, earning_period) if start_period else earning_period

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


@router.get("/recurring-transactions")
def get_recurring_transactions(
    current_user: CurrentUser,
    db: DatabaseSession,
    active_only: Annotated[bool, Query(description="Only show active recurring patterns")] = True,
    min_confidence: Annotated[
        float, Query(ge=0, le=100, description="Minimum confidence score")
    ] = 50,
) -> dict[str, Any]:
    """Get detected recurring transaction patterns.

    Includes:
    - Subscriptions (OTT, software)
    - Bills (rent, utilities)
    - Salary/income patterns
    - Regular investments
    """
    query = (
        db.query(RecurringTransaction)
        .filter(RecurringTransaction.user_id == current_user.id)
        .order_by(
            desc(RecurringTransaction.confidence_score),
            desc(RecurringTransaction.expected_amount),
        )
    )

    if active_only:
        query = query.filter(RecurringTransaction.is_active.is_(True))
    if min_confidence:
        query = query.filter(RecurringTransaction.confidence_score >= min_confidence)

    recurring = query.all()

    return {
        "data": [
            {
                "id": r.id,
                "name": r.pattern_name,
                "category": r.category,
                "subcategory": r.subcategory,
                "account": r.account,
                "type": r.transaction_type.value if r.transaction_type else None,
                "frequency": r.frequency.value if r.frequency else None,
                "expected_amount": float(r.expected_amount),
                "variance": float(r.amount_variance),
                "expected_day": r.expected_day,
                "confidence": r.confidence_score,
                "occurrences": r.occurrences_detected,
                "last_occurrence": (r.last_occurrence.isoformat() if r.last_occurrence else None),
                "next_expected": _compute_next_expected(
                    r.last_occurrence,
                    r.frequency.value if r.frequency else None,
                    r.expected_day,
                ),
                "times_missed": r.times_missed,
                "is_active": r.is_active,
                "is_confirmed": r.is_user_confirmed,
            }
            for r in recurring
        ],
        "count": len(recurring),
        "summary": {
            "total_monthly_recurring": sum(
                float(r.expected_amount)
                for r in recurring
                if r.frequency and r.frequency.value == "monthly"
            ),
        },
    }


class RecurringTransactionUpdate(BaseModel):
    """Partial update for a recurring transaction."""

    pattern_name: str | None = None
    frequency: str | None = None
    expected_amount: float | None = None
    is_confirmed: bool | None = None
    is_active: bool | None = None


_VALID_FREQUENCIES = {
    "daily",
    "weekly",
    "biweekly",
    "monthly",
    "bimonthly",
    "quarterly",
    "semiannual",
    "yearly",
}


@router.patch(
    "/recurring-transactions/{item_id}",
    responses={
        404: {"description": "Recurring transaction not found"},
        422: {"description": "Invalid frequency value"},
    },
)
def update_recurring_transaction(
    item_id: int,
    body: RecurringTransactionUpdate,
    current_user: CurrentUser,
    db: DatabaseSession,
) -> dict[str, Any]:
    """Update a detected recurring transaction (name, frequency, amount, status)."""
    record = (
        db.query(RecurringTransaction)
        .filter(
            RecurringTransaction.id == item_id,
            RecurringTransaction.user_id == current_user.id,
        )
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="Recurring transaction not found")

    if body.pattern_name is not None:
        record.pattern_name = body.pattern_name
    if body.frequency is not None:
        freq = body.frequency.lower()
        if freq not in _VALID_FREQUENCIES:
            raise HTTPException(status_code=422, detail=f"Invalid frequency: {body.frequency}")
        record.frequency = RecurrenceFrequency(freq)
    if body.expected_amount is not None:
        from decimal import Decimal

        record.expected_amount = Decimal(str(body.expected_amount))
    if body.is_confirmed is not None:
        record.is_user_confirmed = body.is_confirmed
    if body.is_active is not None:
        record.is_active = body.is_active
    record.last_updated = datetime.now(UTC)
    db.commit()

    return {"status": "ok", "id": item_id}


class RecurringTransactionCreate(BaseModel):
    """Create a user-defined recurring transaction."""

    name: str
    type: str  # "Income" or "Expense"
    frequency: str
    amount: float
    category: str | None = None
    expected_day: int | None = None


@router.post(
    "/recurring-transactions",
    responses={
        422: {"description": "Invalid frequency or transaction type"},
    },
)
def create_recurring_transaction(
    body: RecurringTransactionCreate,
    current_user: CurrentUser,
    db: DatabaseSession,
) -> dict[str, Any]:
    """Create a new recurring transaction manually."""
    from decimal import Decimal

    freq = body.frequency.lower()
    if freq not in _VALID_FREQUENCIES:
        raise HTTPException(status_code=422, detail=f"Invalid frequency: {body.frequency}")

    txn_type = body.type.upper()
    if txn_type not in ("INCOME", "EXPENSE"):
        raise HTTPException(status_code=422, detail="Type must be Income or Expense")

    record = RecurringTransaction(
        user_id=current_user.id,
        pattern_name=body.name.strip(),
        category=body.category or ("Income" if txn_type == "INCOME" else "Expense"),
        subcategory=None,
        account="Manual",
        transaction_type=TransactionType(txn_type.capitalize()),
        frequency=RecurrenceFrequency(freq),
        expected_amount=Decimal(str(body.amount)),
        amount_variance=Decimal("0"),
        expected_day=body.expected_day,
        confidence_score=100,
        occurrences_detected=0,
        is_active=True,
        is_user_confirmed=True,
        first_detected=datetime.now(UTC),
        last_updated=datetime.now(UTC),
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return {"status": "ok", "id": record.id}


@router.delete(
    "/recurring-transactions/{item_id}",
    responses={
        404: {"description": "Recurring transaction not found"},
    },
)
def delete_recurring_transaction(
    item_id: int,
    current_user: CurrentUser,
    db: DatabaseSession,
) -> dict[str, Any]:
    """Delete a recurring transaction."""
    record = (
        db.query(RecurringTransaction)
        .filter(
            RecurringTransaction.id == item_id,
            RecurringTransaction.user_id == current_user.id,
        )
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="Recurring transaction not found")
    db.delete(record)
    db.commit()
    return {"status": "ok", "id": item_id}


@router.get("/merchant-intelligence")
def get_merchant_intelligence(
    current_user: CurrentUser,
    db: DatabaseSession,
    min_transactions: Annotated[int, Query(ge=1, description="Minimum transaction count")] = 3,
    recurring_only: Annotated[bool, Query(description="Only show recurring merchants")] = False,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> dict[str, Any]:
    """Get merchant/vendor intelligence.

    Shows:
    - Top merchants by spend
    - Transaction patterns per merchant
    - Recurring merchant detection
    """
    query = (
        db.query(MerchantIntelligence)
        .filter(MerchantIntelligence.user_id == current_user.id)
        .order_by(desc(MerchantIntelligence.total_spent))
    )

    if min_transactions:
        query = query.filter(MerchantIntelligence.transaction_count >= min_transactions)
    if recurring_only:
        query = query.filter(MerchantIntelligence.is_recurring.is_(True))

    merchants = query.limit(limit).all()

    return {
        "data": [
            {
                "merchant": m.merchant_name,
                "category": m.primary_category,
                "subcategory": m.primary_subcategory,
                "total_spent": float(m.total_spent),
                "transaction_count": m.transaction_count,
                "avg_transaction": float(m.avg_transaction),
                "first_transaction": (
                    m.first_transaction.isoformat() if m.first_transaction else None
                ),
                "last_transaction": (
                    m.last_transaction.isoformat() if m.last_transaction else None
                ),
                "months_active": m.months_active,
                "avg_days_between": m.avg_days_between,
                "is_recurring": m.is_recurring,
            }
            for m in merchants
        ],
        "count": len(merchants),
    }


@router.get("/net-worth")
def get_net_worth_history(
    current_user: CurrentUser,
    db: DatabaseSession,
    limit: Annotated[int, Query(ge=1, le=600, description="Number of snapshots")] = 120,
) -> dict[str, Any]:
    """Get net worth history and current snapshot.

    Returns:
    - Asset breakdown (cash, investments, etc.)
    - Liability breakdown
    - Net worth over time

    """
    snapshots = (
        db.query(NetWorthSnapshot)
        .filter(NetWorthSnapshot.user_id == current_user.id)
        .order_by(desc(NetWorthSnapshot.snapshot_date))
        .limit(limit)
        .all()
    )

    if not snapshots:
        return {"data": [], "current": None, "count": 0}

    current = snapshots[0]

    return {
        "data": [
            {
                "date": s.snapshot_date.isoformat(),
                "assets": {
                    "cash_and_bank": float(s.cash_and_bank),
                    "investments": float(s.investments),
                    "mutual_funds": float(s.mutual_funds),
                    "stocks": float(s.stocks),
                    "fixed_deposits": float(s.fixed_deposits),
                    "ppf_epf": float(s.ppf_epf),
                    "other": float(s.other_assets),
                    "total": float(s.total_assets),
                },
                "liabilities": {
                    "credit_cards": float(s.credit_card_outstanding),
                    "loans": float(s.loans_payable),
                    "other": float(s.other_liabilities),
                    "total": float(s.total_liabilities),
                },
                "net_worth": float(s.net_worth),
                "change": float(s.net_worth_change),
                "change_pct": s.net_worth_change_pct,
            }
            for s in snapshots
        ],
        "current": {
            "net_worth": float(current.net_worth),
            "total_assets": float(current.total_assets),
            "total_liabilities": float(current.total_liabilities),
            "as_of": current.snapshot_date.isoformat(),
        },
        "count": len(snapshots),
    }


@router.get("/fy-summaries")
def get_fy_summaries(
    current_user: CurrentUser,
    db: DatabaseSession,
) -> dict[str, Any]:
    """Get fiscal year summaries (April - March).

    Perfect for:
    - Annual tax planning
    - Year-over-year comparison
    - Financial year analysis (India FY)
    """
    summaries = (
        db.query(FYSummary)
        .filter(FYSummary.user_id == current_user.id)
        .order_by(desc(FYSummary.fiscal_year))
        .all()
    )

    return {
        "data": [
            {
                "fiscal_year": s.fiscal_year,
                "period": f"{s.start_date.strftime('%b %Y')} - {s.end_date.strftime('%b %Y')}",
                "income": {
                    "total": float(s.total_income),
                    "salary": float(s.salary_income),
                    "bonus": float(s.bonus_income),
                    "investment": float(s.investment_income),
                    "other": float(s.other_income),
                },
                "expenses": {
                    "total": float(s.total_expenses),
                    "tax_paid": float(s.tax_paid),
                },
                "investments_made": float(s.investments_made),
                "savings": {
                    "net": float(s.net_savings),
                    "rate": s.savings_rate,
                },
                "yoy": {
                    "income": s.yoy_income_change,
                    "expenses": s.yoy_expense_change,
                    "savings": s.yoy_savings_change,
                },
                "is_complete": s.is_complete,
            }
            for s in summaries
        ],
        "count": len(summaries),
    }


@router.get("/anomalies")
def get_anomalies(
    current_user: CurrentUser,
    db: DatabaseSession,
    anomaly_type: Annotated[
        str | None,
        Query(
            alias="type",
            description="Filter by anomaly type "
            "(high_expense/unusual_category/large_transfer/budget_exceeded)",
        ),
    ] = None,
    severity: Annotated[
        str | None, Query(description="Filter by severity (low/medium/high/critical)")
    ] = None,
    include_reviewed: Annotated[
        bool, Query(description="Include reviewed/dismissed anomalies")
    ] = False,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> dict[str, Any]:
    """Get detected anomalies and unusual patterns.

    Types:
    - High expense months
    - Unusual category spending
    - Large transfers
    - Budget exceeded
    """
    query = (
        db.query(Anomaly)
        .filter(Anomaly.user_id == current_user.id)
        .order_by(desc(Anomaly.detected_at))
    )

    if anomaly_type:
        try:
            at: AnomalyType | str = AnomalyType(anomaly_type)
        except ValueError:
            at = anomaly_type
        query = query.filter(Anomaly.anomaly_type == at)
    if severity:
        query = query.filter(Anomaly.severity == severity)
    if not include_reviewed:
        query = query.filter(Anomaly.is_reviewed.is_(False))
        query = query.filter(Anomaly.is_dismissed.is_(False))

    anomalies = query.limit(limit).all()

    return {
        "data": [
            {
                "id": a.id,
                "anomaly_type": a.anomaly_type.value if a.anomaly_type else None,
                "severity": a.severity,
                "description": a.description,
                "transaction_id": a.transaction_id,
                "period_key": a.period_key,
                "expected_value": float(a.expected_value) if a.expected_value else None,
                "actual_value": float(a.actual_value) if a.actual_value else None,
                "deviation_pct": a.deviation_pct,
                "detected_at": a.detected_at.isoformat() if a.detected_at else None,
                "is_reviewed": a.is_reviewed,
                "is_dismissed": a.is_dismissed,
                "review_notes": a.review_notes,
                "reviewed_at": a.reviewed_at.isoformat() if a.reviewed_at else None,
            }
            for a in anomalies
        ],
        "count": len(anomalies),
        "summary": {
            "high": sum(1 for a in anomalies if a.severity == "high"),
            "medium": sum(1 for a in anomalies if a.severity == "medium"),
            "low": sum(1 for a in anomalies if a.severity == "low"),
        },
    }


@router.post(
    "/anomalies/{anomaly_id}/review",
    responses={404: {"description": "Anomaly not found"}},
)
def review_anomaly(
    anomaly_id: int,
    current_user: CurrentUser,
    db: DatabaseSession,
    body: ReviewAnomalyRequest,
) -> dict[str, Any]:
    """Mark an anomaly as reviewed."""
    anomaly = (
        db.query(Anomaly)
        .filter(
            Anomaly.id == anomaly_id,
            Anomaly.user_id == current_user.id,
        )
        .first()
    )

    if not anomaly:
        raise HTTPException(status_code=404, detail="Anomaly not found")

    anomaly.is_reviewed = True
    anomaly.is_dismissed = body.dismiss
    anomaly.review_notes = body.notes
    anomaly.reviewed_at = datetime.now(UTC)

    db.commit()

    return {"success": True, "anomaly_id": anomaly_id}


@router.get("/budgets")
def get_budgets(
    current_user: CurrentUser,
    db: DatabaseSession,
    active_only: Annotated[bool, Query()] = True,
) -> dict[str, Any]:
    """Get budget tracking data."""
    query = db.query(Budget).filter(Budget.user_id == current_user.id)

    if active_only:
        query = query.filter(Budget.is_active.is_(True))

    budgets = query.order_by(desc(Budget.current_month_pct)).all()

    return {
        "data": [
            {
                "id": b.id,
                "category": b.category,
                "subcategory": b.subcategory,
                "monthly_limit": float(b.monthly_limit),
                "current_spent": float(b.current_month_spent),
                "remaining": float(b.current_month_remaining),
                "usage_pct": b.current_month_pct,
                "alert_threshold": b.alert_threshold_pct,
                "avg_actual": float(b.avg_monthly_actual),
                "months_over": b.months_over_budget,
                "months_under": b.months_under_budget,
            }
            for b in budgets
        ],
        "count": len(budgets),
    }


@router.post("/budgets")
def create_budget(
    current_user: CurrentUser,
    db: DatabaseSession,
    body: CreateBudgetRequest,
) -> dict[str, Any]:
    """Create a new budget."""
    budget = Budget(
        user_id=current_user.id,
        category=body.category,
        subcategory=body.subcategory,
        monthly_limit=body.monthly_limit,
        alert_threshold_pct=body.alert_threshold,
        is_active=True,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    db.add(budget)
    db.commit()

    return {"success": True, "budget_id": budget.id}


@router.get("/goals")
def get_financial_goals(
    current_user: CurrentUser,
    db: DatabaseSession,
    goal_type: Annotated[
        str | None, Query(description="Filter by goal type (savings/debt_payoff/investment/etc.)")
    ] = None,
    include_achieved: Annotated[bool, Query(description="Include achieved goals")] = True,
) -> dict[str, Any]:
    """Get financial goals."""
    from ledger_sync.db.models import GoalStatus

    query = db.query(FinancialGoal).filter(FinancialGoal.user_id == current_user.id)

    if goal_type:
        query = query.filter(FinancialGoal.goal_type == goal_type)
    if not include_achieved:
        query = query.filter(FinancialGoal.status != GoalStatus.COMPLETED)

    goals = query.order_by(desc(FinancialGoal.created_at)).all()

    return {
        "data": [
            {
                "id": g.id,
                "name": g.name,
                "goal_type": g.goal_type,
                "target_amount": float(g.target_amount),
                "current_amount": float(g.current_amount),
                "progress_pct": g.progress_pct,
                "start_date": g.created_at.isoformat() if g.created_at else None,
                "target_date": g.target_date.isoformat() if g.target_date else None,
                "is_achieved": g.status == GoalStatus.COMPLETED if g.status else False,
                "achieved_date": g.completed_at.isoformat() if g.completed_at else None,
                "notes": g.description,
                "created_at": g.created_at.isoformat() if g.created_at else None,
                "updated_at": None,
            }
            for g in goals
        ],
        "count": len(goals),
    }


@router.post("/goals")
def create_goal(
    current_user: CurrentUser,
    db: DatabaseSession,
    body: CreateGoalRequest,
) -> dict[str, Any]:
    """Create a new financial goal."""
    from ledger_sync.db.models import GoalStatus

    # Parse target_date string to datetime if provided
    parsed_target_date = None
    if body.target_date:
        parsed_target_date = datetime.fromisoformat(body.target_date)

    # Calculate monthly target if target date provided
    monthly_target: float = 0
    if parsed_target_date:
        months_remaining = (parsed_target_date.year - datetime.now(UTC).year) * 12 + (
            parsed_target_date.month - datetime.now(UTC).month
        )
        if months_remaining > 0:
            monthly_target = body.target_amount / months_remaining

    goal = FinancialGoal(
        user_id=current_user.id,
        name=body.name,
        description=body.notes,
        goal_type=body.goal_type,
        target_amount=body.target_amount,
        target_date=parsed_target_date,
        monthly_target=monthly_target,
        status=GoalStatus.ACTIVE,
        created_at=datetime.now(UTC),
    )
    db.add(goal)
    db.commit()

    return {"success": True, "goal_id": goal.id}
