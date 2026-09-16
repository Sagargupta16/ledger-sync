import { formatMonthKey, toLocalDateKey } from '@/lib/dateUtils'
import { percentChange } from '@/lib/formatters'
import { ROLLING_AVG_MONTHS, countRollingAvgPoints } from '@/lib/chartUtils'

import { fillAnalysisMonths, resolveAnalysisPeriod } from './analysisPeriod'

interface IncomeMonth {
  month: string
  income: number
}

/** Selected chart history is independent of the earnings-aware average basis. */
export function computeIncomeMetrics(
  rows: readonly IncomeMonth[],
  {
    earningStartDate,
    startDate,
    endDate,
    now = new Date(),
  }: {
    earningStartDate?: string | null
    startDate?: string | null
    endDate?: string | null
    now?: Date
  } = {},
) {
  const monthKeys = rows.map((row) => row.month)
  const chartPeriod = resolveAnalysisPeriod(monthKeys, { startDate, endDate, now })
  const averagePeriod = resolveAnalysisPeriod(monthKeys, { earningStartDate, startDate, endDate, now })
  const empty = (month: string): IncomeMonth => ({ month, income: 0 })
  const complete = fillAnalysisMonths(rows, chartPeriod.months, empty)
  const currentMonth = toLocalDateKey(now).slice(0, 7)
  const partial = rows.filter((row) => row.month === currentMonth)
  const basis = complete.length ? complete : partial
  const averageBasis = fillAnalysisMonths(rows, averagePeriod.months, empty)
  const monthlyTrendData = basis.map((row, index) => {
    const window = basis.slice(Math.max(0, index + 1 - ROLLING_AVG_MONTHS), index + 1)
    const fullWindow = window.length === ROLLING_AVG_MONTHS &&
      (!earningStartDate || window[0].month >= earningStartDate.slice(0, 7))
    return {
      ...row,
      label: formatMonthKey(row.month, { month: 'short', year: '2-digit' }),
      incomeAvg: fullWindow ? window.reduce((sum, item) => sum + item.income, 0) / ROLLING_AVG_MONTHS : undefined,
    }
  })
  // Preserve the existing explicitly labeled month-so-far fallback for new ledgers.
  const averages = averageBasis.length ? averageBasis : (complete.length ? [] : partial)
  const incomeSeries = averageBasis.map((row) => row.income)
  const growthRate = incomeSeries.length >= 2
    ? percentChange(incomeSeries.at(-1)!, incomeSeries[0]) ?? undefined
    : undefined
  return {
    averagePeriod,
    monthlyTrendData,
    avgIncome: averages.length ? averages.reduce((sum, row) => sum + row.income, 0) / averages.length : 0,
    incomeSeries,
    growthRate,
    peakIncome: complete.length ? Math.max(...complete.map((row) => row.income)) : undefined,
    rollingAvgPointCount: countRollingAvgPoints(monthlyTrendData, (row) => row.incomeAvg),
  }
}
