/**
 * `/api/dashboard-metrics`: the Dashboard figures that used to need the whole
 * ledger in the browser (`/api/transactions/all`, about 3.4 MB of JSON at 9,000 rows).
 *
 * Both endpoints answer in the API's snake_case. This module maps them onto the
 * shapes the browser calculators produce (`summarizeInvestmentTransfers`,
 * `computeCurrentHealth`), so the Dashboard and the health panel keep their
 * types. The demo resolver (`lib/demo/demoDashboardMetrics.ts`) builds the same
 * wire shapes from those calculators, and demo data comes back through here too.
 */

import type { CurrentHealth } from '@/components/analytics/health/currentHealthInputs'
import type { AnalysisResult, BalancePosition } from '@/components/analytics/health/healthScoreTypes'
import type { summarizeInvestmentTransfers } from '@/lib/finance/investmentFlows'

import type { DateRangeParams } from './calculations'
import { apiClient } from './client'

type InvestmentTransferSummary = ReturnType<typeof summarizeInvestmentTransfers>

/** The window's figures as the Dashboard reads them. */
export interface DashboardPulse {
  ageOfMoney: number | null
  daysOfBuffering: number | null
  investmentTransfers: InvestmentTransferSummary
}

/** `GET /api/dashboard-metrics/pulse` */
export interface DashboardPulseWire {
  age_of_money: number | null
  days_of_buffering: number | null
  investment_transfers: {
    contributions: number
    withdrawals: number
    net_contributions: number
    internal_transfers: number
    other_transfers: number
  }
}

export interface BalancePositionWire {
  liquid_assets: number
  investment_assets: number
  total_liabilities: number
  total_assets: number
  net_worth: number
}

export interface HealthAnalysisWire {
  balance_flow_totals: {
    cumulative_net_savings: number
    net_investments: number
    total_debt_outstanding: number
  }
  has_recent_income: boolean
  months_analyzed: number
  savings_rate: number
  essential_to_income_ratio: number
  total_income: number
  total_expense: number
  total_essential_expense: number
  total_debt: number
  avg_monthly_income: number
  avg_monthly_expense: number
  avg_monthly_essential_expense: number
  emergency_fund_months: number
  cumulative_net_savings: number
  investment_regularity: number
  investment_to_income_ratio: number
  total_investment_inflow: number
  total_investment_outflow: number
  debt_to_income_ratio: number
  avg_monthly_debt: number
  debt_trend_percent: number
  positive_savings_ratio: number
  savings_volatility_cv: number
  income_cv: number
  balances: BalancePositionWire | null
}

export interface CurrentHealthWire {
  analysis: HealthAnalysisWire
  period: { months: string[]; start_date: string | null; end_date: string | null }
  earning_start: CurrentHealth['earningStart']
}

/** `GET /api/dashboard-metrics/health`: null below 10 rows or 3 completed months. */
export interface DashboardHealthWire {
  current_health: CurrentHealthWire | null
}

function pulseFromWire(wire: DashboardPulseWire): DashboardPulse {
  const flows = wire.investment_transfers
  return {
    ageOfMoney: wire.age_of_money,
    daysOfBuffering: wire.days_of_buffering,
    investmentTransfers: {
      contributions: flows.contributions,
      withdrawals: flows.withdrawals,
      netContributions: flows.net_contributions,
      internalTransfers: flows.internal_transfers,
      otherTransfers: flows.other_transfers,
    },
  }
}

function balancesFromWire(wire: BalancePositionWire | null): BalancePosition | null {
  return wire && {
    liquidAssets: wire.liquid_assets,
    investmentAssets: wire.investment_assets,
    totalLiabilities: wire.total_liabilities,
    totalAssets: wire.total_assets,
    netWorth: wire.net_worth,
  }
}

function analysisFromWire(wire: HealthAnalysisWire): AnalysisResult {
  const flows = wire.balance_flow_totals
  return {
    balanceFlowTotals: {
      cumulativeNetSavings: flows.cumulative_net_savings,
      netInvestments: flows.net_investments,
      totalDebtOutstanding: flows.total_debt_outstanding,
    },
    hasRecentIncome: wire.has_recent_income,
    monthsAnalyzed: wire.months_analyzed,
    savingsRate: wire.savings_rate,
    essentialToIncomeRatio: wire.essential_to_income_ratio,
    totalIncome: wire.total_income,
    totalExpense: wire.total_expense,
    totalEssentialExpense: wire.total_essential_expense,
    totalDebt: wire.total_debt,
    avgMonthlyIncome: wire.avg_monthly_income,
    avgMonthlyExpense: wire.avg_monthly_expense,
    avgMonthlyEssentialExpense: wire.avg_monthly_essential_expense,
    emergencyFundMonths: wire.emergency_fund_months,
    cumulativeNetSavings: wire.cumulative_net_savings,
    investmentRegularity: wire.investment_regularity,
    investmentToIncomeRatio: wire.investment_to_income_ratio,
    totalInvestmentInflow: wire.total_investment_inflow,
    totalInvestmentOutflow: wire.total_investment_outflow,
    debtToIncomeRatio: wire.debt_to_income_ratio,
    avgMonthlyDebt: wire.avg_monthly_debt,
    debtTrendPercent: wire.debt_trend_percent,
    positiveSavingsRatio: wire.positive_savings_ratio,
    savingsVolatilityCV: wire.savings_volatility_cv,
    incomeCV: wire.income_cv,
    balances: balancesFromWire(wire.balances),
  }
}

function currentHealthFromWire(wire: CurrentHealthWire | null | undefined): CurrentHealth | null {
  if (!wire) return null
  const { months, start_date: startDate, end_date: endDate } = wire.period
  return {
    analysis: analysisFromWire(wire.analysis),
    period: { months, startDate, endDate },
    earningStart: wire.earning_start,
  }
}

export const dashboardMetricsApi = {
  getPulse: async (params?: DateRangeParams): Promise<DashboardPulse> => {
    const response = await apiClient.get<DashboardPulseWire>('/api/dashboard-metrics/pulse', { params })
    return pulseFromWire(response.data)
  },

  getHealth: async (): Promise<CurrentHealth | null> => {
    const response = await apiClient.get<DashboardHealthWire>('/api/dashboard-metrics/health')
    return currentHealthFromWire(response.data.current_health)
  },
}
