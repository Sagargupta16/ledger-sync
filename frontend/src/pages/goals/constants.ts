import type { FinancialGoal } from '@/hooks/api/useAnalyticsV2'
import { rawColors } from '@/constants/colors'

export const ALLOCATION_STORAGE_KEY = 'ledger-sync-goal-allocations'
export const DELETED_GOALS_STORAGE_KEY = 'ledger-sync-deleted-goals'
export const GOAL_OVERRIDES_STORAGE_KEY = 'ledger-sync-goal-overrides'

export const GOAL_TYPE_COLORS: Record<FinancialGoal['goal_type'], string> = {
  savings: rawColors.ios.green,
  debt_payoff: rawColors.ios.red,
  investment: rawColors.ios.blue,
  expense_reduction: rawColors.ios.orange,
  income_increase: rawColors.ios.purple,
  custom: rawColors.ios.teal,
}

export const GOAL_TYPE_LABELS: Record<FinancialGoal['goal_type'], string> = {
  savings: 'Savings',
  debt_payoff: 'Debt Payoff',
  investment: 'Investment',
  expense_reduction: 'Expense Reduction',
  income_increase: 'Income Increase',
  custom: 'Custom',
}
