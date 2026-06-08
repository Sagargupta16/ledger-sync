import type { Budget } from '@/store/budgetStore'

export type BudgetStatusLevel = 'safe' | 'warning' | 'danger' | 'exceeded'

export interface BudgetWithStatus extends Budget {
  spent: number
  percentage: number
  remaining: number
  status: BudgetStatusLevel
}

export function computeBudgetStatus(
  budgets: Budget[],
  currentMonthSpending: Record<string, number>
): BudgetWithStatus[] {
  return budgets.map((budget) => {
    const spent = currentMonthSpending[budget.category] || 0
    const percentage = budget.limit > 0 ? (spent / budget.limit) * 100 : 0
    const remaining = budget.limit - spent

    let status: BudgetStatusLevel = 'safe'
    if (percentage >= 100) status = 'exceeded'
    else if (percentage >= 80) status = 'danger'
    else if (percentage >= 60) status = 'warning'

    return {
      ...budget,
      spent,
      percentage,
      remaining,
      status,
    }
  })
}

export function getStatusColor(status: string) {
  switch (status) {
    case 'safe':
      return 'text-app-green bg-app-green/20 border-app-green/30'
    case 'warning':
      return 'text-app-yellow bg-app-yellow/20 border-app-yellow/30'
    case 'danger':
      return 'text-app-orange bg-app-orange/20 border-app-orange/30'
    case 'exceeded':
      return 'text-app-red bg-app-red/20 border-app-red/30'
    default:
      return ''
  }
}

export function getProgressColor(status: string) {
  switch (status) {
    case 'safe':
      return 'bg-app-green'
    case 'warning':
      return 'bg-app-yellow'
    case 'danger':
      return 'bg-app-orange'
    case 'exceeded':
      return 'bg-app-red'
    default:
      return 'bg-primary'
  }
}
