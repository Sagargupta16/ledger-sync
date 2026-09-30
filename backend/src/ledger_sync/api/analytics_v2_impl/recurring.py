"""V2 endpoints: recurring transactions CRUD + merchant intelligence.

Shared rules live in ``recurring_rules``; merchant intelligence lives in
``merchant_intelligence`` and is mounted on this router after the CRUD routes,
so the route order is unchanged.
"""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import desc, or_, update

from ledger_sync.api.analytics_v2_impl.merchant_intelligence import (
    router as merchant_intelligence_router,
)

# Re-exported: tests import the date estimator from this module.
from ledger_sync.api.analytics_v2_impl.recurring_rules import (
    _MANUAL_ACCOUNT,
    _USER_EDITABLE_FIELDS,
    _VALID_FREQUENCIES,
    _VALID_PATTERN_KINDS,
    _dismiss_detection_label,
    _find_visible_record,
    _next_expected_for_record,
)
from ledger_sync.api.analytics_v2_impl.recurring_rules import (
    _compute_next_expected as _compute_next_expected,
)
from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.core.analytics.recurring import (
    DISMISSED_PATTERN_KIND,
    effective_pattern_kind,
)
from ledger_sync.core.analytics.refresh import lock_analytics_user
from ledger_sync.db.models import (
    RecurrenceFrequency,
    RecurringTransaction,
    ScheduledTransaction,
    TransactionType,
)
from ledger_sync.ingest.normalizer import DataNormalizer
from ledger_sync.schemas.transactions import PositiveAmount

router = APIRouter()

# Expected amounts are rounded to paise exactly like imported rows.
_normalizer = DataNormalizer()


@router.get("/recurring-transactions")
def get_recurring_transactions(
    current_user: CurrentUser,
    db: DatabaseSession,
    active_only: Annotated[bool, Query(description="Only show active recurring patterns")] = True,
    min_confidence: Annotated[
        float, Query(ge=0, le=100, description="Minimum confidence score")
    ] = 50,
    pattern_kind: Annotated[
        str | None,
        Query(description="Filter by kind: 'commitment' (bill/salary) or 'habit'"),
    ] = None,
) -> dict[str, Any]:
    """Get detected recurring transaction patterns.

    Includes:
    - Subscriptions (OTT, software)
    - Bills (rent, utilities)
    - Salary/income patterns
    - Regular investments

    Each row carries ``pattern_kind``: ``commitment`` rows are owed on a
    calendar date, ``habit`` rows just repeat (the daily lunch, the weekly fruit
    run). Fixed-cost totals, the bill calendar and missed-payment alerts must
    filter to ``commitment`` -- a repeated meal is not a bill.
    """
    query = (
        db.query(RecurringTransaction)
        .filter(
            RecurringTransaction.user_id == current_user.id,
            RecurringTransaction.pattern_kind != DISMISSED_PATTERN_KIND,
        )
        .order_by(
            desc(RecurringTransaction.confidence_score),
            desc(RecurringTransaction.expected_amount),
        )
    )

    if active_only:
        query = query.filter(RecurringTransaction.is_active.is_(True))
    if min_confidence:
        query = query.filter(
            or_(
                RecurringTransaction.is_user_confirmed.is_(True),
                RecurringTransaction.confidence_score >= min_confidence,
            )
        )
    # Old rollups may call periodic shopping a commitment. Apply the same
    # interpretation as detection before filtering, without a DB refresh/write.
    recurring = [
        r for r in query.all() if pattern_kind is None or effective_pattern_kind(r) == pattern_kind
    ]

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
                "next_expected": _next_expected_for_record(r),
                "times_missed": r.times_missed,
                "is_active": r.is_active,
                "is_confirmed": r.is_user_confirmed,
                "pattern_kind": effective_pattern_kind(r),
            }
            for r in recurring
        ],
        "count": len(recurring),
        "summary": {
            # Commitments only: a repeated lunch is not a fixed monthly cost.
            "total_monthly_recurring": sum(
                float(r.expected_amount)
                for r in recurring
                if r.frequency
                and r.frequency.value == "monthly"
                and effective_pattern_kind(r) == "commitment"
            ),
            "commitment_count": sum(
                1 for r in recurring if effective_pattern_kind(r) == "commitment"
            ),
            "habit_count": sum(1 for r in recurring if effective_pattern_kind(r) == "habit"),
        },
    }


class RecurringTransactionUpdate(BaseModel):
    """Partial update for a recurring transaction."""

    pattern_name: str | None = None
    frequency: str | None = None
    expected_amount: PositiveAmount | None = None
    is_confirmed: bool | None = None
    is_active: bool | None = None
    pattern_kind: str | None = None


@router.patch(
    "/recurring-transactions/{item_id}",
    responses={
        404: {"description": "Recurring transaction not found"},
        422: {"description": "Invalid frequency or pattern kind value"},
    },
)
def update_recurring_transaction(
    item_id: int,
    body: RecurringTransactionUpdate,
    current_user: CurrentUser,
    db: DatabaseSession,
) -> dict[str, Any]:
    """Update a detected recurring transaction (name, frequency, amount, status).

    Any edit is a user decision, so the row becomes user-confirmed: refresh
    deletes and re-derives unconfirmed rows, which would silently undo the edit.
    An explicit ``is_confirmed`` in the body still wins.
    """
    lock_analytics_user(db, current_user.id)
    record = _find_visible_record(db, current_user.id, item_id)

    if any(getattr(body, field) is not None for field in _USER_EDITABLE_FIELDS):
        record.is_user_confirmed = True
    if body.pattern_name is not None:
        _dismiss_detection_label(db, record, body.pattern_name)
        record.pattern_name = body.pattern_name
    if body.frequency is not None:
        freq = body.frequency.lower()
        if freq not in _VALID_FREQUENCIES:
            raise HTTPException(status_code=422, detail=f"Invalid frequency: {body.frequency}")
        record.frequency = RecurrenceFrequency(freq)
    if body.expected_amount is not None:
        record.expected_amount = _normalizer.normalize_amount(body.expected_amount)
    if body.is_confirmed is not None:
        record.is_user_confirmed = body.is_confirmed
    if body.is_active is not None:
        record.is_active = body.is_active
    if body.pattern_kind is not None:
        kind = body.pattern_kind.lower()
        if kind not in _VALID_PATTERN_KINDS:
            raise HTTPException(
                status_code=422, detail=f"Invalid pattern kind: {body.pattern_kind}"
            )
        record.pattern_kind = kind
    record.last_updated = datetime.now(UTC)
    db.commit()

    return {"status": "ok", "id": item_id}


class RecurringTransactionCreate(BaseModel):
    """Create a user-defined recurring transaction."""

    name: str
    type: str  # "Income" or "Expense"
    frequency: str
    amount: PositiveAmount
    category: str | None = None
    expected_day: int | None = Field(default=None, ge=1, le=31)


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
    freq = body.frequency.lower()
    if freq not in _VALID_FREQUENCIES:
        raise HTTPException(status_code=422, detail=f"Invalid frequency: {body.frequency}")

    txn_type = body.type.upper()
    if txn_type not in ("INCOME", "EXPENSE"):
        raise HTTPException(status_code=422, detail="Type must be Income or Expense")

    lock_analytics_user(db, current_user.id)
    record = RecurringTransaction(
        user_id=current_user.id,
        pattern_name=body.name.strip(),
        category=body.category or ("Income" if txn_type == "INCOME" else "Expense"),
        subcategory=None,
        account=_MANUAL_ACCOUNT,
        transaction_type=TransactionType(txn_type.capitalize()),
        frequency=RecurrenceFrequency(freq),
        expected_amount=_normalizer.normalize_amount(body.amount),
        amount_variance=Decimal("0"),
        expected_day=body.expected_day,
        confidence_score=100,
        occurrences_detected=0,
        # A manually added recurring item is by definition something the user
        # means to track as owed, so it is a commitment regardless of cadence.
        pattern_kind="commitment",
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
    """Delete a recurring transaction.

    A manually created row is removed. A detected row is kept as a dismissed
    tombstone instead: deleting it outright lets the next refresh detect the
    same pattern again. Every reader excludes tombstones, so the API response
    is identical to a delete.
    """
    lock_analytics_user(db, current_user.id)
    record = _find_visible_record(db, current_user.id, item_id)
    # A schedule owns its payment details independently of its detected source.
    # Unlink before DELETE to satisfy the tenant-scoped FK without deleting or
    # rewriting any schedule, including inactive schedules.
    db.execute(
        update(ScheduledTransaction)
        .where(
            ScheduledTransaction.user_id == current_user.id,
            ScheduledTransaction.recurring_transaction_id == item_id,
        )
        .values(
            recurring_transaction_id=None,
            updated_at=ScheduledTransaction.updated_at,
        )
    )
    if record.account == _MANUAL_ACCOUNT:
        db.delete(record)
    else:
        record.pattern_kind = DISMISSED_PATTERN_KIND
        record.is_user_confirmed = True
        record.is_active = False
        record.last_updated = datetime.now(UTC)
    db.commit()
    return {"status": "ok", "id": item_id}


# Mounted after the CRUD routes so merchant intelligence stays last, as before.
router.include_router(merchant_intelligence_router)
