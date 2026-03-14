export type CompareMode = 'month' | 'year' | 'fy'

export interface PeriodSummary {
  label: string
  income: number
  expense: number
  savings: number
  savingsRate: number
  transactions: number
  categories: Record<string, { income: number; expense: number }>
}

export interface CategoryDelta {
  category: string
  periodA: number
  periodB: number
  change: number
  changeAbs: number
  type: 'income' | 'expense'
}
