export type BudgetPeriod = 'monthly' | 'yearly'
export type ViewMode = 'category' | 'subcategory'

export interface BudgetRow {
  category: string
  subcategory?: string
  limit: number
  period: BudgetPeriod
  spent: number
  percentage: number
  remaining: number
  status: 'safe' | 'warning' | 'danger' | 'exceeded'
}
