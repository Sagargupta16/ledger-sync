import {
  buildCashFlowForecast,
  type CashFlowForecastInsights,
  type CashFlowForecastModel,
  type MonthlyCashFlowData,
} from '@/lib/finance/cashFlowForecast'

export { addMonths, computeGrowthRate } from '@/lib/finance/cashFlowForecast'

export function formatMonth(v: string) {
  // Build from local Y/M parts: `new Date('YYYY-MM-01')` parses as UTC midnight
  // and toLocaleDateString renders local, mislabeling the axis tick (prior
  // month) for negative-offset users.
  const [y, m] = v.slice(0, 7).split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

type CombinedPoint = {
  month: string; label: string; isForecast: boolean
  income: number | undefined; expense: number | undefined; net: number | undefined
  consumptionSurplus: number | undefined; capitalLosses: number | undefined
  forecastIncome: number | undefined; forecastExpense: number | undefined; forecastNet: number | undefined
  upper: number | undefined; lower: number | undefined
  // Stacked-band fields: a transparent baseline (= lower) plus the band height
  // (= upper - lower) stacked on top render the variability range correctly above,
  // below, or across the zero line -- unlike the old black-mask Area which only
  // worked when the whole band was positive.
  lowerBase: number | undefined; bandRange: number | undefined
}

export interface ForecastResult {
  combined: CombinedPoint[]
  barData: Array<{ month: string; label: string; income: number; expense: number; isForecast: boolean }>
  forecastStartMonth: string | undefined
  basisMonths: string[]
  assumptions: CashFlowForecastModel['assumptions']
  insights: CashFlowForecastInsights & {
    /** Compatibility names: historical savings are observed; projections exclude capital losses. */
    avgSavings: number
    projectedSavings: number
    monthsUntilNegative: number | null
    trend: 'positive' | 'negative'
  }
}

/** Add chart labels and series keys; forecast arithmetic lives in the domain module. */
export function buildForecast(monthlyData: MonthlyCashFlowData, now: Date = new Date()): ForecastResult | null {
  const model = buildCashFlowForecast(monthlyData, now)
  if (!model) return null
  const { historical, forecast, insights } = model

  const combined: CombinedPoint[] = [
    ...historical.map((month, index) => {
      const bridge = index === historical.length - 1
      return {
        month: month.month, label: formatMonth(month.month), isForecast: false,
        income: month.income, expense: month.expense, net: month.netSavings,
        consumptionSurplus: month.consumptionSurplus, capitalLosses: month.capitalLosses,
        // The projection starts from consumption surplus, not observed net after losses.
        forecastIncome: bridge ? month.income : undefined,
        forecastExpense: bridge ? month.expense : undefined,
        forecastNet: bridge ? month.consumptionSurplus : undefined,
        upper: bridge ? month.consumptionSurplus : undefined,
        lower: bridge ? month.consumptionSurplus : undefined,
        lowerBase: bridge ? month.consumptionSurplus : undefined,
        bandRange: bridge ? 0 : undefined,
      }
    }),
    ...forecast.map(f => ({
      month: f.month, label: formatMonth(f.month), isForecast: true,
      income: undefined as number | undefined, expense: undefined as number | undefined, net: undefined as number | undefined,
      consumptionSurplus: undefined as number | undefined, capitalLosses: undefined as number | undefined,
      forecastIncome: f.income, forecastExpense: f.expense, forecastNet: f.consumptionSurplus,
      upper: f.upper, lower: f.lower,
      lowerBase: f.lower, bandRange: f.rangeWidth,
    })),
  ]
  const barData = [
    ...historical.slice(-6).map(h => ({ month: h.month, label: formatMonth(h.month), income: h.income, expense: h.expense, isForecast: false })),
    ...forecast.map(f => ({ month: f.month, label: formatMonth(f.month), income: f.income, expense: f.expense, isForecast: true })),
  ]

  return {
    combined, barData,
    forecastStartMonth: forecast[0]?.month,
    basisMonths: model.basisMonths,
    assumptions: model.assumptions,
    insights: {
      ...insights,
      avgSavings: insights.avgNetSavings,
      projectedSavings: insights.projectedConsumptionSurplus,
      monthsUntilNegative: insights.monthsUntilConsumptionDeficit,
      trend: insights.observedTrend,
    },
  }
}
