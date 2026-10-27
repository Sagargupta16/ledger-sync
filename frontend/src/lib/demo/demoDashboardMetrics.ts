/**
 * Demo answers for `/api/dashboard-metrics/pulse` and `/api/dashboard-metrics/health`.
 *
 * Runs the browser calculators the backend endpoints port over the demo ledger,
 * with the preferences, balances and classifications the rest of demo mode
 * serves, and returns the endpoints' wire shapes. The service maps them back
 * exactly as it maps a real response.
 */

import { currentHealthFromLedger, type CurrentHealth } from '@/components/analytics/health/currentHealthInputs'
import type { AnalysisResult, BalancePosition } from '@/components/analytics/health/healthScoreTypes'
import {
  computeAgeOfMoney,
  computeDaysOfBuffering,
  computeLiquidPosition,
  spendableAccountTest,
} from '@/lib/ageOfMoneyCalculator'
import { filterTransactionsByDateRange } from '@/lib/dateUtils'
import { investmentAccountTest, summarizeInvestmentTransfers } from '@/lib/finance/investmentFlows'
import type {
  BalancePositionWire,
  CurrentHealthWire,
  DashboardHealthWire,
  DashboardPulseWire,
  HealthAnalysisWire,
} from '@/services/api/dashboardMetrics'
import type { Transaction } from '@/types'

import { generateDemoAccountClassifications } from './demoAccountReads'
import { generateDemoAccountBalances } from './demoCalculations'
import { generateDemoPreferences } from './demoPreferences'

const dateParam = (value: unknown): string | undefined =>
  typeof value === 'string' && value ? value : undefined

/** `/api/dashboard-metrics/pulse`: the selected window's Age of Money, buffer and transfers. */
export function generateDemoDashboardPulse(
  txs: Transaction[],
  params: Record<string, unknown>,
): DashboardPulseWire {
  const rows = filterTransactionsByDateRange(txs, {
    start_date: dateParam(params.start_date),
    end_date: dateParam(params.end_date),
  })
  const classifications = generateDemoAccountClassifications()
  const mappings = generateDemoPreferences().investment_account_mappings
  const flows = summarizeInvestmentTransfers(rows, investmentAccountTest(Object.keys(mappings)))
  const liquid = computeLiquidPosition(generateDemoAccountBalances(txs).accounts, classifications)
  const hasRows = rows.length > 0
  return {
    age_of_money: hasRows ? computeAgeOfMoney(rows, spendableAccountTest(classifications)) : null,
    days_of_buffering: hasRows ? computeDaysOfBuffering(liquid, rows) : null,
    investment_transfers: {
      contributions: flows.contributions,
      withdrawals: flows.withdrawals,
      net_contributions: flows.netContributions,
      internal_transfers: flows.internalTransfers,
      other_transfers: flows.otherTransfers,
    },
  }
}

function balancesToWire(balances: BalancePosition | null): BalancePositionWire | null {
  return balances && {
    liquid_assets: balances.liquidAssets,
    investment_assets: balances.investmentAssets,
    total_liabilities: balances.totalLiabilities,
    total_assets: balances.totalAssets,
    net_worth: balances.netWorth,
  }
}

function analysisToWire(analysis: AnalysisResult): HealthAnalysisWire {
  // `computeCurrentHealth` always supplies both optional fields.
  const flows = analysis.balanceFlowTotals!
  return {
    balance_flow_totals: {
      cumulative_net_savings: flows.cumulativeNetSavings,
      net_investments: flows.netInvestments,
      total_debt_outstanding: flows.totalDebtOutstanding,
    },
    has_recent_income: analysis.hasRecentIncome === true,
    months_analyzed: analysis.monthsAnalyzed,
    savings_rate: analysis.savingsRate,
    essential_to_income_ratio: analysis.essentialToIncomeRatio,
    total_income: analysis.totalIncome,
    total_expense: analysis.totalExpense,
    total_essential_expense: analysis.totalEssentialExpense,
    total_debt: analysis.totalDebt,
    avg_monthly_income: analysis.avgMonthlyIncome,
    avg_monthly_expense: analysis.avgMonthlyExpense,
    avg_monthly_essential_expense: analysis.avgMonthlyEssentialExpense,
    emergency_fund_months: analysis.emergencyFundMonths,
    cumulative_net_savings: analysis.cumulativeNetSavings,
    investment_regularity: analysis.investmentRegularity,
    investment_to_income_ratio: analysis.investmentToIncomeRatio,
    total_investment_inflow: analysis.totalInvestmentInflow,
    total_investment_outflow: analysis.totalInvestmentOutflow,
    debt_to_income_ratio: analysis.debtToIncomeRatio,
    avg_monthly_debt: analysis.avgMonthlyDebt,
    debt_trend_percent: analysis.debtTrendPercent,
    positive_savings_ratio: analysis.positiveSavingsRatio,
    savings_volatility_cv: analysis.savingsVolatilityCV,
    income_cv: analysis.incomeCV,
    balances: balancesToWire(analysis.balances),
  }
}

function currentHealthToWire({ analysis, period, earningStart }: CurrentHealth): CurrentHealthWire {
  return {
    analysis: analysisToWire(analysis),
    period: { months: period.months, start_date: period.startDate, end_date: period.endDate },
    earning_start: earningStart,
  }
}

/** `/api/dashboard-metrics/health`: current health over the whole demo ledger. */
export function generateDemoDashboardHealth(txs: Transaction[]): DashboardHealthWire {
  const current = currentHealthFromLedger(txs, {
    preferences: generateDemoPreferences(),
    accounts: generateDemoAccountBalances(txs).accounts,
    classifications: generateDemoAccountClassifications(),
  })
  return { current_health: current && currentHealthToWire(current) }
}
