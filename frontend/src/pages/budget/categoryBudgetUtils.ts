import { colors } from '@/constants/colors'
import { formatPercent } from '@/lib/formatters'
import type { Budget } from '@/services/api/analyticsV2'

export type BudgetStatus = 'paused' | 'over' | 'alert' | 'ok'

/**
 * Where a budget stands this month. `alert` uses the same rule as the sidebar
 * and mobile tab bar badges (usage at or above the budget's own threshold), so
 * "need attention" here counts what those badges count.
 */
export function budgetStatus(budget: Budget): BudgetStatus {
  if (budget.is_active === false) return 'paused'
  if (budget.usage_pct >= 100) return 'over'
  if (budget.usage_pct >= budget.alert_threshold) return 'alert'
  return 'ok'
}

export const STATUS_STYLE: Record<BudgetStatus, { readonly textClass: string; readonly barColor: string }> = {
  ok: { textClass: 'text-app-green', barColor: colors.app.green },
  alert: { textClass: 'text-app-orange', barColor: colors.app.orange },
  over: { textClass: 'text-app-red', barColor: colors.app.red },
  paused: { textClass: 'text-muted-foreground', barColor: colors.text.tertiary },
}

export function statusLabel(budget: Budget): string {
  switch (budgetStatus(budget)) {
    case 'paused':
      return 'Paused'
    case 'over':
      return budget.remaining < 0 ? 'Over limit' : 'Limit reached'
    case 'alert':
      return 'Near limit'
    default:
      return 'On track'
  }
}

/** "Category" or "Category: Subcategory", as the budget's scope reads. */
export function budgetLabel(budget: Budget): string {
  return budget.subcategory ? `${budget.category}: ${budget.subcategory}` : budget.category
}

/**
 * "80%", or "72.5%" and "72.25%" for a fractional threshold (the editor accepts
 * any step), so the label matches the tick on the bar and the status rule.
 */
export function formatThreshold(pct: number): string {
  const digits = [0, 1].find((places) => Number(pct.toFixed(places)) === pct) ?? 2
  return formatPercent(pct, false, digits)
}

const byName = (a: Budget, b: Budget) => budgetLabel(a).localeCompare(budgetLabel(b))

/** Active budgets most-used first, then paused ones by name. */
export function splitBudgets(budgets: readonly Budget[]): {
  readonly active: Budget[]
  readonly paused: Budget[]
} {
  const active = budgets
    .filter((budget) => budget.is_active !== false)
    .sort((a, b) => b.usage_pct - a.usage_pct || byName(a, b))
  const paused = budgets.filter((budget) => budget.is_active === false).sort(byName)
  return { active, paused }
}

export interface BudgetTotals {
  readonly limit: number
  readonly spent: number
  /** Negative when spending ran past the combined limit. */
  readonly left: number
  readonly usedPct: number
  /** Near or over limit: what the navigation badges count. */
  readonly needAttention: number
  readonly over: number
}

/** To the paisa, so float noise in a sum cannot flip the band to "Over budget". */
const toPaise = (value: number) => Math.round(value * 100) / 100

export function budgetTotals(active: readonly Budget[]): BudgetTotals {
  const limit = toPaise(active.reduce((sum, budget) => sum + budget.monthly_limit, 0))
  const spent = toPaise(active.reduce((sum, budget) => sum + budget.current_spent, 0))
  const statuses = active.map(budgetStatus)
  return {
    limit,
    spent,
    left: toPaise(limit - spent),
    usedPct: limit > 0 ? (spent / limit) * 100 : 0,
    needAttention: statuses.filter((status) => status === 'alert' || status === 'over').length,
    over: statuses.filter((status) => status === 'over').length,
  }
}
