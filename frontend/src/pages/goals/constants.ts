import type { FinancialGoal } from '@/hooks/api/useAnalyticsV2'
import { rawColors } from '@/constants/colors'

export const ALLOCATION_STORAGE_KEY = 'ledger-sync-goal-allocations'
export const DELETED_GOALS_STORAGE_KEY = 'ledger-sync-deleted-goals'
export const GOAL_OVERRIDES_STORAGE_KEY = 'ledger-sync-goal-overrides'

export const GOAL_TYPE_COLORS: Record<FinancialGoal['goal_type'], string> = {
  savings: rawColors.app.green,
  debt_payoff: rawColors.app.red,
  investment: rawColors.app.blue,
  expense_reduction: rawColors.app.orange,
  income_increase: rawColors.app.purple,
  custom: rawColors.app.teal,
}

export const GOAL_TYPE_LABELS: Record<FinancialGoal['goal_type'], string> = {
  savings: 'Savings',
  debt_payoff: 'Debt Payoff',
  investment: 'Investment',
  expense_reduction: 'Expense Reduction',
  income_increase: 'Income Increase',
  custom: 'Custom',
}
