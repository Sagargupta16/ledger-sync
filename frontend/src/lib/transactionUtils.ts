/**
 * Shared transaction utility functions
 *
 * Used by DashboardPage, SpendingAnalysisPage, and other analytics views
 * to compute date ranges. Date-range filtering lives in `@/lib/dateUtils`
 * (`filterTransactionsByDateRange`).
 */

import type { Transaction } from '@/types'

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
