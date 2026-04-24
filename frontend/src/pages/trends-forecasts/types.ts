export type TrendDirection = 'up' | 'down' | 'stable'

export interface TrendMetrics {
  current: number
  previous: number
  change: number
  changePercent: number
  direction: TrendDirection
  average: number
  highest: number
  lowest: number
}

export interface MonthlyTrendRow {
  month: string
  income: number
  expenses: number
  surplus: number
  rawSavingsRate: number
}
