"""Safe to spend until payday, and the per-account balance projection behind it.

Routes only: the computation lives in ``core/safe_to_spend``. Both reads are
scoped to the signed-in user and leave the ledger untouched.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Query

from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.core.safe_to_spend import balance_projection, safe_to_spend
from ledger_sync.schemas.safe_to_spend import BalanceProjectionResponse, SafeToSpendResponse

router = APIRouter(prefix="/api/safe-to-spend", tags=["safe-to-spend"])

Threshold = Annotated[
    Decimal,
    Query(
        ge=0,
        le=1_000_000_000_000,
        max_digits=15,
        decimal_places=2,
        description="Flag an account projected to fall below this INR amount; 0 flags only zero",
    ),
]


@router.get("")
def get_safe_to_spend(
    current_user: CurrentUser,
    db: DatabaseSession,
    threshold: Threshold = Decimal(0),
) -> SafeToSpendResponse:
    """Money free to spend until the next payday, per day, with the pace so far.

    Liquid balances (Cash, Bank Accounts, Other Wallets, net of card dues and
    overdrafts) less commitments and schedules due before payday, less a
    reserve for later bills that the following paychecks cannot cover. The
    first account projected to fall below zero or ``threshold`` within 30 days
    comes back as ``low_balance``.
    """
    return safe_to_spend(db, current_user, threshold)


@router.get("/projection")
def get_balance_projection(
    current_user: CurrentUser,
    db: DatabaseSession,
    days: Annotated[int, Query(ge=7, le=90, description="Days to project, from today")] = 30,
    threshold: Threshold = Decimal(0),
) -> BalanceProjectionResponse:
    """End-of-day balance per spendable account from today's balance.

    Each day adds that day's commitments and schedules and the account's usual
    net transfers, and takes its share of the average daily discretionary spend
    of the last 90 days.
    """
    return balance_projection(db, current_user, days, threshold)
