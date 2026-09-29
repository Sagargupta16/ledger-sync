/**
 * Shared transaction utility functions
 *
 * Used by DashboardPage, SpendingAnalysisPage, and other analytics views
 * to compute date ranges and aggregate category data. Date-range filtering
 * lives in `@/lib/dateUtils` (`filterTransactionsByDateRange`).
 */

import type { Transaction } from '@/types'
import { isSpending } from '@/lib/expenseClassification'

/**
 * Compute the min/max date range from an array of transactions.
 * Returns undefined values when there are no transactions.
 */
export function computeDataDateRange(
  transactions: Transaction[] | undefined,
): { minDate: string | undefined; maxDate: string | undefined } {
  if (!transactions || transactions.length === 0) return { minDate: undefined, maxDate: undefined }
  const dates = transactions.map((t) => t.date.substring(0, 10)).sort((a, b) => a.localeCompare(b))
  return { minDate: dates[0], maxDate: dates.at(-1) }
}

/**
 * Aggregate expense amounts by category from a list of transactions.
 *
 * Only spending counts: realised capital losses are booked as Expense rows so
 * the cash column balances, but they are a negative investment return, not
 * consumption, so ranking them against Food or Rent is meaningless.
 */
export function computeCategoryBreakdown(
  transactions: Transaction[],
): Record<string, number> {
  const categories: Record<string, number> = {}
  for (const t of transactions) {
    if (t.type !== 'Expense' || !isSpending(t)) continue
    const category = t.category || 'Uncategorized'
    categories[category] = (categories[category] || 0) + Math.abs(t.amount)
  }
  return categories
}
