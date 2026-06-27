export function formatMonth(v: string) {
  // Build from local Y/M parts: `new Date('YYYY-MM-01')` parses as UTC midnight
  // and toLocaleDateString renders local, mislabeling the axis tick (prior
  // month) for negative-offset users.
  const [y, m] = v.slice(0, 7).split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

/**
 * Add `n` months to a `YYYY-MM` key using integer arithmetic.
 *
 * Date-based month math (new Date(key+'-01') is UTC, setMonth() is local,
 * toISOString() is UTC again) skips or duplicates months for non-UTC users.
 * Integer math on the year/month is timezone-independent.
 */
export function addMonths(yyyymm: string, n: number): string {
  const [year, month] = yyyymm.split('-').map(Number)
  const zeroBased = year * 12 + (month - 1) + n
  const newYear = Math.floor(zeroBased / 12)
  const newMonth = (zeroBased % 12) + 1
  return `${newYear}-${String(newMonth).padStart(2, '0')}`
}

export function computeGrowthRate(series: Array<{ income: number; expense: number }>) {
  if (series.length <= 1) return { incomeGrowth: 0, expenseGrowth: 0 }
  const first = series[0]
  const last = series.at(-1) ?? first
  const periods = series.length - 1
  return {
    incomeGrowth: first.income > 0 ? (last.income - first.income) / first.income / periods : 0,
    expenseGrowth: first.expense > 0 ? (last.expense - first.expense) / first.expense / periods : 0,
  }
}

type CombinedPoint = {
  month: string; label: string; isForecast: boolean
  income: number | undefined; expense: number | undefined; net: number | undefined
  forecastIncome: number | undefined; forecastExpense: number | undefined; forecastNet: number | undefined
  upper: number | undefined; lower: number | undefined
  // Stacked-band fields: a transparent baseline (= lower) plus the band height
  // (= upper - lower) stacked on top render the confidence cone correctly above,
  // below, or across the zero line -- unlike the old black-mask Area which only
  // worked when the whole band was positive.
  lowerBase: number | undefined; bandRange: number | undefined
}

export interface ForecastResult {
  combined: CombinedPoint[]
  barData: Array<{ month: string; label: string; income: number; expense: number; isForecast: boolean }>
  forecastStartMonth: string | undefined
  insights: {
    avgIncome: number; avgExpense: number; avgSavings: number
    incomeGrowth: number; expenseGrowth: number
    projectedSavings: number
    monthsUntilNegative: number | null
    trend: 'positive' | 'negative'
  }
}

type MonthlyData = Record<string, { income: number; expense: number; net_savings: number }> | undefined

/**
 * Builds the 12-month cash-flow projection: trend + volatility from the last
 * 6 complete months, a confidence cone that widens with horizon, and the
 * combined historical+forecast series the chart renders. Returns null when
 * there isn't enough data (needs >= 3 complete months).
 */
export function buildForecast(monthlyData: MonthlyData): ForecastResult | null {
  if (!monthlyData) return null

  const months = Object.entries(monthlyData)
    .map(([month, data]) => ({
      month,
      ...(data as { income: number; expense: number; net_savings: number }),
    }))
    .sort((a, b) => a.month.localeCompare(b.month))

  if (months.length < 3) return null

  // Exclude incomplete current month
  const today = new Date()
  const currentMonth = today.toISOString().slice(0, 7)
  const isIncomplete = today.getDate() < 25
  const last = months.at(-1)
  if (!last) return null
  const historicalMonths = (last.month === currentMonth && isIncomplete)
    ? months.slice(0, -1) : months
  const lastComplete = historicalMonths.at(-1)
  if (!lastComplete) return null

  if (historicalMonths.length < 3) return null

  // Trend from last 6 complete months
  const recent = historicalMonths.slice(-6)
  const avgIncome = recent.reduce((s, m) => s + m.income, 0) / recent.length
  const avgExpense = recent.reduce((s, m) => s + m.expense, 0) / recent.length
  const avgSavings = avgIncome - avgExpense

  const { incomeGrowth, expenseGrowth } = computeGrowthRate(recent)

  // Volatility for confidence bands
  const savingsValues = recent.map(m => m.income - m.expense)
  const savingsAvg = savingsValues.reduce((s, v) => s + v, 0) / savingsValues.length
  const variance = savingsValues.reduce((s, v) => s + (v - savingsAvg) ** 2, 0) / savingsValues.length
  const stdDev = Math.sqrt(variance)

  // Generate 6-month forecast
  const offset = (last.month === currentMonth && isIncomplete) ? 0 : 1
  const forecast = []
  let projIncome = lastComplete.income
  let projExpense = lastComplete.expense

  for (let i = offset; i <= offset + 11; i++) {
    const ms = addMonths(lastComplete.month, i)
    projIncome = projIncome * (1 + incomeGrowth * 0.5)
    projExpense = projExpense * (1 + expenseGrowth * 0.5)
    const net = projIncome - projExpense
    const monthsOut = i - offset + 1
    // Confidence band widens over time
    const band = stdDev * 0.8 * Math.sqrt(monthsOut)
    forecast.push({
      month: ms,
      income: Math.round(projIncome),
      expense: Math.round(projExpense),
      net: Math.round(net),
      upper: Math.round(net + band),
      lower: Math.round(net - band),
      isForecast: true,
    })
  }

  // Historical (last 12)
  const historical = historicalMonths.slice(-12).map(m => ({
    month: m.month,
    income: m.income,
    expense: m.expense,
    net: m.income - m.expense,
    isForecast: false,
  }))

  // Combined data with income, expense, net + forecast variants
  const lastHist = historical.at(-1)
  if (!lastHist) return null
  const combined: CombinedPoint[] = [
    ...historical.map(h => ({
      month: h.month, label: formatMonth(h.month), isForecast: false,
      income: h.income, expense: h.expense, net: h.net,
      forecastIncome: undefined as number | undefined, forecastExpense: undefined as number | undefined,
      forecastNet: undefined as number | undefined,
      upper: undefined as number | undefined, lower: undefined as number | undefined,
      lowerBase: undefined as number | undefined, bandRange: undefined as number | undefined,
    })),
    // Bridge point — zero-width band so the cone starts flush at the last actual.
    {
      month: lastHist.month, label: formatMonth(lastHist.month), isForecast: false,
      income: lastHist.income, expense: lastHist.expense, net: lastHist.net,
      forecastIncome: lastHist.income, forecastExpense: lastHist.expense, forecastNet: lastHist.net,
      upper: lastHist.net, lower: lastHist.net,
      lowerBase: lastHist.net, bandRange: 0,
    },
    ...forecast.map(f => ({
      month: f.month, label: formatMonth(f.month), isForecast: true,
      income: undefined as number | undefined, expense: undefined as number | undefined, net: undefined as number | undefined,
      forecastIncome: f.income, forecastExpense: f.expense, forecastNet: f.net,
      upper: f.upper, lower: f.lower,
      lowerBase: f.lower, bandRange: f.upper - f.lower,
    })),
  ]
  // Remove duplicate bridge
  combined.splice(historical.length - 1, 1)

  // Bar data — last 6 historical + 6 forecast
  const barData = [
    ...historical.slice(-6).map(h => ({ month: h.month, label: formatMonth(h.month), income: h.income, expense: h.expense, isForecast: false })),
    ...forecast.map(f => ({ month: f.month, label: formatMonth(f.month), income: f.income, expense: f.expense, isForecast: true })),
  ]

  const totalForecastSavings = forecast.reduce((s, f) => s + f.net, 0)
  const monthsUntilNegative = forecast.findIndex(f => f.net < 0)

  return {
    combined, barData,
    forecastStartMonth: forecast[0]?.month,
    insights: {
      avgIncome, avgExpense, avgSavings,
      incomeGrowth: incomeGrowth * 100,
      expenseGrowth: expenseGrowth * 100,
      projectedSavings: totalForecastSavings,
      monthsUntilNegative: monthsUntilNegative === -1 ? null : monthsUntilNegative + 1,
      trend: avgSavings > 0 ? 'positive' as const : 'negative' as const,
    },
  }
}
