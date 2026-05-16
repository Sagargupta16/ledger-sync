"""V2 endpoints: recurring transactions CRUD + merchant intelligence."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import desc

from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.db.models import (
    MerchantIntelligence,
    RecurrenceFrequency,
    RecurringTransaction,
    TransactionType,
)

router = APIRouter()

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
