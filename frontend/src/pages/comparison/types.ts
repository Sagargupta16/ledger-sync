export type CompareMode = 'month' | 'year' | 'fy'

export interface PeriodSummary {
  label: string
  income: number
  expense: number
  savings: number
  savingsRate: number
  transactions: number
  /** Inclusive number of calendar days the period spans (for daily averages). */
  days: number
  /**
   * True when this pair was truncated because period B is still running. Totals
   * are then partial-vs-partial: comparable to each other, not to a full period.
   */
  isPartial: boolean
  categories: Record<string, { income: number; expense: number }>
}

/** The in-progress period a comparison was truncated to, for on-screen disclosure. */
export interface PartialPeriod {
  label: string
  daysElapsed: number
  daysTotal: number
}

export interface CategoryDelta {
  category: string
  periodA: number
  periodB: number
  change: number
  changeAbs: number
  type: 'income' | 'expense'
}
