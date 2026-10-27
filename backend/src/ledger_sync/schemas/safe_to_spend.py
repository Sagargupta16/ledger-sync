"""Response models for ``/api/safe-to-spend`` and its 30-day balance projection.

Money is a float in INR, rounded to paise, like every other analytics response.
Dates are IST calendar days (``YYYY-MM-DD``).
"""

from __future__ import annotations

import datetime as dt
from typing import Literal

from pydantic import BaseModel, Field


class PayCycleOut(BaseModel):
    """The pay cycle today falls in: from the last payday up to the next one."""

    start: dt.date
    next_payday: dt.date
    days_left: int = Field(description="Days from today up to the day before the next payday")
    total_days: int
    payday: int | None = Field(description="Stored payday preference; null when never saved")
    basis: Literal["payday", "month_end"]
    detected_payday: int | None = Field(
        description="Usual day of the largest repeating income commitment or schedule, if any"
    )


class LiquidOut(BaseModel):
    """Cash, bank and wallet balances, net of card dues and overdrafts."""

    gross: float
    liabilities: float
    net: float
    spendable_accounts: int
    card_accounts: int
    unclassified_accounts: int


class FlowOut(BaseModel):
    """One expected movement: positive is money in, negative money out."""

    name: str
    account: str
    date: dt.date
    amount: float


class ReserveCycleOut(BaseModel):
    start: dt.date
    end: dt.date
    income: float
    bills: float


class ReserveOut(BaseModel):
    """Money held back now for later bills the following paychecks cannot cover."""

    amount: float
    status: Literal["covered", "reserved", "no_recurring_income"]
    cycles: list[ReserveCycleOut]


class PaceOut(BaseModel):
    """Discretionary spend this cycle against an even pace through the cycle."""

    spent: float
    expected: float = Field(description="The cycle's allowance spread evenly, up to as_of")
    budget: float = Field(description="Spent so far plus what is still safe to spend")
    usual: float | None = Field(
        description="Average daily spend of the last 90 days, times elapsed"
    )
    elapsed_days: int
    total_days: int
    as_of: dt.date


class LowBalanceOut(BaseModel):
    account: str
    date: dt.date
    balance: float
    kind: Literal["below_zero", "below_threshold"]


class SafeToSpendResponse(BaseModel):
    as_of: dt.date
    balance_as_of: dt.date | None = Field(description="Date of the newest transaction used")
    threshold: float
    cycle: PayCycleOut
    liquid: LiquidOut
    bills_before_payday: float
    bill_count: int
    bills: list[FlowOut] = Field(description="Bills due before payday, soonest first (at most 12)")
    reserve: ReserveOut
    safe_to_spend: float
    per_day: float
    typical_daily_spend: float = Field(description="Median discretionary spend per day")
    pace: PaceOut | None
    low_balance: LowBalanceOut | None


class AccountSeriesOut(BaseModel):
    """End-of-day balances, one per projection date."""

    name: str
    start_balance: float
    balances: list[float]
    lowest: float
    lowest_on: dt.date
    below_zero_on: dt.date | None
    below_threshold_on: dt.date | None
    starts_below_zero: bool
    daily_spend: float
    daily_transfer: float


class ProjectionAssumptionsOut(BaseModel):
    lookback_days: int
    daily_spend: float = Field(
        description="Average discretionary spend per day on cash, bank and wallet accounts"
    )
    transfer_months: list[str]
    unassigned_flows: int


class BalanceProjectionResponse(BaseModel):
    as_of: dt.date
    balance_as_of: dt.date | None
    days: int
    threshold: float
    dates: list[dt.date]
    total: AccountSeriesOut
    accounts: list[AccountSeriesOut]
    events: list[FlowOut] = Field(description="Commitments and schedules inside the horizon")
    assumptions: ProjectionAssumptionsOut
