"""Response schemas for ``/api/dashboard-metrics``.

Field for field the shapes the browser calculators produce (``computeAgeOfMoney``,
``computeDaysOfBuffering``, ``summarizeInvestmentTransfers`` and
``computeCurrentHealth``), in the API's snake_case. ``frontend/src/services/api/
dashboardMetrics.ts`` maps them back onto the frontend types.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class InvestmentTransfers(BaseModel):
    """Transfer volume split at the investment perimeter for the window."""

    contributions: float
    withdrawals: float
    net_contributions: float
    internal_transfers: float
    other_transfers: float


class DashboardPulseResponse(BaseModel):
    """The selected window's row-level figures on the Dashboard."""

    age_of_money: int | None
    days_of_buffering: int | None
    investment_transfers: InvestmentTransfers


class BalanceFlowTotals(BaseModel):
    """Lifetime flow proxies, used only where no account balance is recorded."""

    cumulative_net_savings: float
    net_investments: float
    total_debt_outstanding: float


class BalancePosition(BaseModel):
    """Liquid, invested and owed money from the recorded account balances."""

    liquid_assets: float
    investment_assets: float
    total_liabilities: float
    total_assets: float
    net_worth: float


class HealthAnalysis(BaseModel):
    """The inputs the FinHealth and CFP scorers read (``AnalysisResult``)."""

    balance_flow_totals: BalanceFlowTotals
    has_recent_income: bool
    months_analyzed: int
    savings_rate: float
    essential_to_income_ratio: float
    total_income: float
    total_expense: float
    total_essential_expense: float
    total_debt: float
    avg_monthly_income: float
    avg_monthly_expense: float
    avg_monthly_essential_expense: float
    emergency_fund_months: float
    cumulative_net_savings: float
    investment_regularity: float
    investment_to_income_ratio: float
    total_investment_inflow: float
    total_investment_outflow: float
    debt_to_income_ratio: float
    avg_monthly_debt: float
    debt_trend_percent: float
    positive_savings_ratio: float
    savings_volatility_cv: float
    income_cv: float
    balances: BalancePosition | None


class AnalysisPeriod(BaseModel):
    """The completed months the analysis covers."""

    months: list[str]
    start_date: str | None
    end_date: str | None


class EarningStart(BaseModel):
    """Where the employment start bounding the period came from."""

    date: str | None
    source: Literal["saved", "inferred", "unknown"]


class CurrentHealth(BaseModel):
    """One user's current health analysis with the window it covers."""

    analysis: HealthAnalysis
    period: AnalysisPeriod
    earning_start: EarningStart


class DashboardHealthResponse(BaseModel):
    """``current_health`` is null below 10 recorded rows or 3 completed months."""

    current_health: CurrentHealth | None
