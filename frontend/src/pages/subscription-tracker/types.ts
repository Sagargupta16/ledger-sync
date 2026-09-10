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

export type { RecurringCommitmentSummary as RecurringSummary } from '@/lib/recurringCalculations'
