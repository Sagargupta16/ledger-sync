import { getCurrentMonth } from '@/lib/dateUtils'
import type { Budget } from '@/services/api/analyticsV2'
import type { Transaction } from '@/types'

import { isExpense } from './demoHelpers'

/**
 * Sample limits on categories the demo ledger really spends in, set near each
 * one's typical month so a visit shows a mix of on-track, near and over rows.
 * One is paused.
 */
const DEMO_BUDGETS: ReadonlyArray<{
  readonly id: number
  readonly category: string
  readonly monthly_limit: number
  readonly alert_threshold: number
  readonly is_active: boolean
}> = [
  { id: 1, category: 'Food & Dining', monthly_limit: 24000, alert_threshold: 80, is_active: true },
  { id: 2, category: 'Transportation', monthly_limit: 5000, alert_threshold: 80, is_active: true },
  { id: 3, category: 'Entertainment & Recreations', monthly_limit: 4000, alert_threshold: 75, is_active: true },
  { id: 4, category: 'Personal Care', monthly_limit: 3000, alert_threshold: 80, is_active: true },
  { id: 5, category: 'Healthcare', monthly_limit: 3000, alert_threshold: 90, is_active: true },
  { id: 6, category: 'Gadgets & Accessories', monthly_limit: 10000, alert_threshold: 80, is_active: false },
]

const round2 = (value: number) => Math.round(value * 100) / 100

/**
 * `GET /analytics/v2/budgets` for demo mode, tracked against the demo ledger.
 *
 * Mirrors the endpoint: this month's expense spend per category, counted when
 * the list loads (the whole calendar month, as budget tracking counts it), for
 * paused rows too; `active_only` defaulting to true; most-used first.
 */
export function resolveDemoBudgets(
  txs: Transaction[],
  params: Record<string, unknown>,
): { data: Budget[]; count: number } {
  const month = getCurrentMonth()
  const spentByCategory = new Map<string, number>()
  for (const t of txs) {
    if (!isExpense(t) || !t.date.startsWith(month)) continue
    spentByCategory.set(t.category, (spentByCategory.get(t.category) ?? 0) + Math.abs(t.amount))
  }

  const activeOnly = params.active_only !== false && params.active_only !== 'false'
  const rows: Budget[] = DEMO_BUDGETS.filter((spec) => spec.is_active || !activeOnly).map((spec) => {
    const spent = round2(spentByCategory.get(spec.category) ?? 0)
    return {
      id: spec.id,
      category: spec.category,
      subcategory: null,
      monthly_limit: spec.monthly_limit,
      current_spent: spent,
      remaining: round2(spec.monthly_limit - spent),
      usage_pct: round2((spent / spec.monthly_limit) * 100),
      alert_threshold: spec.alert_threshold,
      avg_actual: 0,
      months_over: 0,
      months_under: 0,
      is_active: spec.is_active,
    }
  })
  rows.sort((a, b) => b.usage_pct - a.usage_pct || a.category.localeCompare(b.category))
  return { data: rows, count: rows.length }
}
