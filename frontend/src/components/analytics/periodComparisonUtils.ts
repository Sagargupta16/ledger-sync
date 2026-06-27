import {
  buildMonthlyMetrics,
  buildYearlyMetrics,
  type CompareMode,
  type MetricRow,
  type MonthData,
  type PeriodKey,
  type TransactionType,
  type YearData,
} from './period-comparison/periodMetrics'

type RawMonthData = {
  income: number
  expense: number
  net_savings: number
  transactions?: number
  income_count?: number
  expense_count?: number
}
type MonthlyData = Record<string, RawMonthData>
type TxCounts = Record<string, { total: number; income: number; expense: number }>

export function deriveAvailableMonths(monthlyData: MonthlyData | undefined): MonthData[] {
  if (!monthlyData) return []
  return Object.entries(monthlyData)
    .map(([month, data]) => ({
      month,
      ...(data as RawMonthData),
    }))
    .sort((a, b) => b.month.localeCompare(a.month))
}

export function deriveAvailableYears(monthlyData: MonthlyData | undefined): number[] {
  if (!monthlyData) return []
  const years = new Set<number>()
  Object.keys(monthlyData).forEach((month) => {
    years.add(Number.parseInt(month.slice(0, 4)))
  })
  return Array.from(years).sort((a, b) => b - a)
}

export function deriveYearlyData(monthlyData: MonthlyData | undefined): Record<number, YearData> {
  if (!monthlyData) return {}
  const yearly: Record<number, YearData> = {}

  Object.entries(monthlyData).forEach(([month, data]) => {
    const year = Number.parseInt(month.slice(0, 4))
    const d = data as RawMonthData
    if (!yearly[year]) {
      yearly[year] = { income: 0, expense: 0, net_savings: 0, months: 0 }
    }
    yearly[year].income += d.income
    yearly[year].expense += d.expense
    yearly[year].net_savings += d.net_savings
    yearly[year].months += 1
  })

  return yearly
}

export function deriveTransactionCounts(monthlyData: MonthlyData | undefined): TxCounts {
  const counts: TxCounts = {}
  if (!monthlyData) return counts
  Object.entries(monthlyData).forEach(([month, data]) => {
    counts[month] = {
      total: data.transactions ?? 0,
      income: data.income_count ?? 0,
      expense: data.expense_count ?? 0,
    }
  })
  return counts
}

export function makeGetTransactionCount(transactionCounts: TxCounts) {
  return (period: PeriodKey, type: TransactionType = 'total'): number => {
    if (typeof period === 'number') {
      return Object.entries(transactionCounts)
        .filter(([month]) => month.startsWith(String(period)))
        .reduce((sum, [, counts]) => sum + counts[type], 0)
    }
    return transactionCounts[period]?.[type] ?? 0
  }
}

export function buildComparisonMetrics(args: {
  compareMode: CompareMode
  monthlyData: MonthlyData | undefined
  availableMonths: MonthData[]
  yearlyData: Record<number, YearData>
  effectiveMonth1: string | null
  effectiveMonth2: string | null
  effectiveYear1: number | null
  effectiveYear2: number | null
  getTransactionCount: (period: PeriodKey, type?: TransactionType) => number
}): MetricRow[] | null {
  const {
    compareMode,
    monthlyData,
    availableMonths,
    yearlyData,
    effectiveMonth1,
    effectiveMonth2,
    effectiveYear1,
    effectiveYear2,
    getTransactionCount,
  } = args

  if (compareMode === 'months') {
    if (!effectiveMonth1 || !effectiveMonth2 || !monthlyData) return null
    const m1 = availableMonths.find((m) => m.month === effectiveMonth1)
    const m2 = availableMonths.find((m) => m.month === effectiveMonth2)
    if (!m1 || !m2) return null
    return buildMonthlyMetrics(
      m1,
      m2,
      effectiveMonth1,
      effectiveMonth2,
      availableMonths,
      getTransactionCount,
    )
  }

  if (!effectiveYear1 || !effectiveYear2) return null
  const y1 = yearlyData[effectiveYear1]
  const y2 = yearlyData[effectiveYear2]
  if (!y1 || !y2) return null
  return buildYearlyMetrics(y1, y2, effectiveYear1, effectiveYear2, getTransactionCount)
}
