export interface Suggestion {
  name: string
  type: 'Income' | 'Expense'
  frequency: string
  category: string
}

export interface RecurringFormData {
  name: string
  type: 'Income' | 'Expense'
  frequency: string
  amount: number
  category?: string
}

export interface RecurringSummary {
  monthlyExpense: number
  monthlyIncome: number
  netMonthly: number
  count: number
  deactivatedExpenseSavings: number
  deactivatedCount: number
}
