import { addMonthsToMonthKey, dropPartialMonth } from '@/lib/dateUtils'

export { addMonthsToMonthKey as addMonths } from '@/lib/dateUtils'

export interface MonthlyCashFlow {
  readonly income: number
  readonly expense: number
  readonly net_savings: number
}

export type MonthlyCashFlowData = Readonly<Record<string, MonthlyCashFlow>> | undefined

export interface ObservedCashFlowMonth {
  month: string
  income: number
  expense: number
  netSavings: number
  consumptionSurplus: number
  /** Reconciles the API contract: income - living expense - net_savings. */
  capitalLosses: number
}

export interface ProjectedCashFlowMonth {
  month: string
  income: number
  expense: number
  consumptionSurplus: number
  lower: number
  upper: number
  rangeWidth: number
}

export const CASH_FLOW_FORECAST_ASSUMPTIONS = {
  horizonMonths: 12,
  lookbackMonths: 6,
  minimumCompleteMonths: 3,
  completedMonthPolicy: 'exclude-current-month-until-its-last-calendar-day',
  projectedMeasure: 'consumption-surplus',
  capitalLosses: 'not-projected',
  rangeBasis: 'historical-consumption-surplus-variability',
} as const

export interface CashFlowForecastInsights {
  avgIncome: number
  avgExpense: number
  avgNetSavings: number
  avgConsumptionSurplus: number
  avgCapitalLosses: number
  incomeGrowth: number
  expenseGrowth: number
  projectedConsumptionSurplus: number
  monthsUntilConsumptionDeficit: number | null
  observedTrend: 'positive' | 'negative'
}

export interface CashFlowForecastModel {
  historical: ObservedCashFlowMonth[]
  forecast: ProjectedCashFlowMonth[]
  basisMonths: string[]
  assumptions: typeof CASH_FLOW_FORECAST_ASSUMPTIONS
  insights: CashFlowForecastInsights
}

/** Largest monthly trend (either direction) the projection will compound. */
export const MAX_MONTHLY_GROWTH = 0.05

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/**
 * Theil-Sen trend (median of pairwise slopes) as a monthly rate relative to the
 * fitted start of the window. One bonus or one-off month cannot move a median,
 * whereas the old first-to-last measure let a single outlier set the trend.
 * Linear data still reads exactly: 100k -> 110k over 5 steps is 2% a month.
 */
function robustMonthlyRate(values: readonly number[]): number {
  const slopes: number[] = []
  for (let i = 0; i < values.length; i++) {
    for (let j = i + 1; j < values.length; j++) slopes.push((values[j] - values[i]) / (j - i))
  }
  const slope = median(slopes)
  const fittedStart = median(values.map((value, index) => value - slope * index))
  if (fittedStart <= 0) return 0
  const rate = slope / fittedStart
  return Math.min(MAX_MONTHLY_GROWTH, Math.max(-MAX_MONTHLY_GROWTH, rate))
}

export function computeGrowthRate(series: readonly { income: number; expense: number }[]) {
  if (series.length <= 1) return { incomeGrowth: 0, expenseGrowth: 0 }
  return {
    incomeGrowth: robustMonthlyRate(series.map((month) => month.income)),
    expenseGrowth: robustMonthlyRate(series.map((month) => month.expense)),
  }
}

function observedMonth(month: string, data: MonthlyCashFlow): ObservedCashFlowMonth {
  const consumptionSurplus = data.income - data.expense
  return {
    month,
    income: data.income,
    expense: data.expense,
    netSavings: data.net_savings,
    consumptionSurplus,
    capitalLosses: consumptionSurplus - data.net_savings,
  }
}

function summarizeRecent(months: readonly ObservedCashFlowMonth[]) {
  const totals = months.reduce((sum, month) => ({
    income: sum.income + month.income,
    expense: sum.expense + month.expense,
    netSavings: sum.netSavings + month.netSavings,
    consumptionSurplus: sum.consumptionSurplus + month.consumptionSurplus,
    capitalLosses: sum.capitalLosses + month.capitalLosses,
  }), { income: 0, expense: 0, netSavings: 0, consumptionSurplus: 0, capitalLosses: 0 })
  const avgConsumptionSurplus = totals.consumptionSurplus / months.length
  const variance = months.reduce(
    (sum, month) => sum + (month.consumptionSurplus - avgConsumptionSurplus) ** 2,
    0,
  ) / months.length

  return {
    avgIncome: totals.income / months.length,
    avgExpense: totals.expense / months.length,
    avgNetSavings: totals.netSavings / months.length,
    avgConsumptionSurplus,
    avgCapitalLosses: totals.capitalLosses / months.length,
    surplusStandardDeviation: Math.sqrt(variance),
  }
}

function projectMonths(
  lastMonth: string,
  base: { avgIncome: number; avgExpense: number },
  growth: ReturnType<typeof computeGrowthRate>,
  surplusStandardDeviation: number,
): ProjectedCashFlowMonth[] {
  const forecast: ProjectedCashFlowMonth[] = []
  // Seed from the lookback average, not the last month: a single bonus month
  // would otherwise become the baseline for all twelve projections.
  let income = base.avgIncome
  let expense = base.avgExpense

  for (let horizon = 1; horizon <= CASH_FLOW_FORECAST_ASSUMPTIONS.horizonMonths; horizon++) {
    // Preserve the existing half-trend model and horizon-scaled illustrative range.
    income *= 1 + growth.incomeGrowth * 0.5
    expense *= 1 + growth.expenseGrowth * 0.5
    const consumptionSurplus = income - expense
    const band = surplusStandardDeviation * 0.8 * Math.sqrt(horizon)
    const lower = Math.round(consumptionSurplus - band)
    const upper = Math.round(consumptionSurplus + band)
    forecast.push({
      month: addMonthsToMonthKey(lastMonth, horizon),
      income: Math.round(income),
      expense: Math.round(expense),
      consumptionSurplus: Math.round(consumptionSurplus),
      lower,
      upper,
      rangeWidth: upper - lower,
    })
  }
  return forecast
}

/**
 * Preserve the API's observed net_savings, including booked capital losses.
 * Only consumption surplus (income minus living expense) is projected; future
 * capital losses are not estimated. Its range uses that same surplus basis,
 * not the observed net-savings variance, and implies no confidence probability.
 *
 * Keep the existing completed-month policy: drop the current month before its
 * last local calendar day, include it on that day, and require at least three
 * remaining observations. The latest six form the model basis; the chart gets
 * up to twelve historical observations. Partial months are never extrapolated.
 */
export function buildCashFlowForecast(
  monthlyData: MonthlyCashFlowData,
  now: Date = new Date(),
): CashFlowForecastModel | null {
  if (!monthlyData) return null
  const months = Object.entries(monthlyData)
    .map(([month, data]) => observedMonth(month, data))
    .sort((a, b) => a.month.localeCompare(b.month))
  const completeMonths = dropPartialMonth(months, 'month', now)
  if (completeMonths.length < CASH_FLOW_FORECAST_ASSUMPTIONS.minimumCompleteMonths) return null
  const lastComplete = completeMonths.at(-1)
  if (!lastComplete) return null

  const recent = completeMonths.slice(-CASH_FLOW_FORECAST_ASSUMPTIONS.lookbackMonths)
  const { surplusStandardDeviation, ...averages } = summarizeRecent(recent)
  const growth = computeGrowthRate(recent)
  const forecast = projectMonths(lastComplete.month, averages, growth, surplusStandardDeviation)
  const deficitIndex = forecast.findIndex((month) => month.consumptionSurplus < 0)

  return {
    historical: completeMonths.slice(-12),
    forecast,
    basisMonths: recent.map((month) => month.month),
    assumptions: CASH_FLOW_FORECAST_ASSUMPTIONS,
    insights: {
      ...averages,
      incomeGrowth: growth.incomeGrowth * 100,
      expenseGrowth: growth.expenseGrowth * 100,
      projectedConsumptionSurplus: forecast.reduce((sum, month) => sum + month.consumptionSurplus, 0),
      monthsUntilConsumptionDeficit: deficitIndex === -1 ? null : deficitIndex + 1,
      observedTrend: averages.avgNetSavings > 0 ? 'positive' : 'negative',
    },
  }
}
