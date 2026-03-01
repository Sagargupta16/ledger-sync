/**
 * Shared transaction utility functions
 *
 * Used by DashboardPage, SpendingAnalysisPage, and other analytics views
 * to compute date ranges, filter transactions, and aggregate category data.
 */

import type { Transaction } from '@/types'
import { filterTransactionsByDateRange as dateFilterImpl } from '@/lib/dateUtils'

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
 * Filter transactions by an optional start/end date range.
 * Delegates to the generic implementation in dateUtils, with a null-safe wrapper.
 */
export function filterTransactionsByDateRange(
  transactions: Transaction[] | undefined,
  dateRange: { start_date?: string | null; end_date?: string | null },
): Transaction[] {
  if (!transactions) return []
  return dateFilterImpl(transactions, {
    start_date: dateRange.start_date ?? undefined,
    end_date: dateRange.end_date ?? undefined,
  })
}

/**
 * Aggregate expense amounts by category from a list of transactions.
 * Only includes transactions with type === 'Expense'.
 */
export function computeCategoryBreakdown(
  transactions: Transaction[],
): Record<string, number> {
  const categories: Record<string, number> = {}
  for (const t of transactions) {
    if (t.type !== 'Expense') continue
    const category = t.category || 'Uncategorized'
    categories[category] = (categories[category] || 0) + Math.abs(t.amount)
  }
  return categories
}
