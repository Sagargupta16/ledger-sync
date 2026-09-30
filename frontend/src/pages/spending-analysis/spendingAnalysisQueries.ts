/**
 * Server reads behind the Spending Analysis page.
 *
 * Every figure the page shows is a sum over Expense/Income rows in a window,
 * optionally narrowed to one category -- exactly what `/category-breakdown`,
 * `/totals`, `/monthly-aggregation` and `/category-daily-series` answer, and
 * with the same capital-loss rule (`without_capital_losses`: only the user's
 * classified keys leave spending). So the page no longer downloads the full
 * ledger to add it up client-side. Each read shares its cache entry with any
 * other page asking for the same window.
 */

import { useQuery } from '@tanstack/react-query'

import {
  categoryBreakdownOptions,
  monthlyAggregationOptions,
  totalsOptions,
} from '@/hooks/api/useAnalytics'
import { calculationsApi } from '@/services/api/calculations'

/** A window in the shape the calculation endpoints take. */
export interface SpendingRange {
  readonly start_date?: string
  readonly end_date?: string
}

/** The loading/error surface every read below exposes. */
export interface SpendingRead<T> {
  readonly data: T | undefined
  readonly isPending: boolean
  readonly isError: boolean
  readonly refetch: () => Promise<unknown>
}

function toParams(range: SpendingRange): { start_date?: string; end_date?: string } {
  return { start_date: range.start_date, end_date: range.end_date }
}

/** `/category-breakdown` for Expense rows in the window (classified losses held out). */
export function useExpenseBreakdown(range: SpendingRange) {
  return useQuery(categoryBreakdownOptions({ transaction_type: 'expense', ...toParams(range) }))
}

/**
 * `/category-breakdown` for Income rows. Only a category deep-link needs it
 * (income IN that category), so it stays idle otherwise.
 */
export function useIncomeBreakdown(range: SpendingRange, enabled: boolean) {
  const query = useQuery({
    ...categoryBreakdownOptions({ transaction_type: 'income', ...toParams(range) }),
    enabled,
  })
  // A disabled query reports `isPending` forever; it is not loading anything.
  return { ...query, isPending: enabled && query.isPending }
}

/** `/totals` for the window: income, spending, classified losses, row count. */
export function useRangeTotals(range: SpendingRange) {
  return useQuery(totalsOptions(toParams(range)))
}

/**
 * Spend per `YYYY-MM` in the window. The whole ledger reads
 * `/monthly-aggregation`; a category deep-link reads `/category-daily-series`
 * for that category and folds its days into months. Both hold classified
 * losses out, like every other spending read on the page.
 */
export function useMonthlyExpense(
  range: SpendingRange,
  category: string | null,
): SpendingRead<Record<string, number>> {
  const params = toParams(range)
  const monthly = useQuery({ ...monthlyAggregationOptions(params), enabled: !category })
  // Same key shape (and response) as EnhancedSubcategoryAnalysis's read, so a
  // category the user opened there is already cached here.
  const daily = useQuery({
    queryKey: [
      'category-daily-series',
      'expense',
      category ?? undefined,
      params.start_date,
      params.end_date,
    ],
    queryFn: async () =>
      (
        await calculationsApi.getCategoryDailySeries({
          ...params,
          transaction_type: 'expense',
          category: category ?? undefined,
        })
      ).data,
    staleTime: Infinity,
    enabled: Boolean(category),
  })

  if (category) {
    const byMonth: Record<string, number> = {}
    for (const row of daily.data?.data ?? []) {
      const month = row.date.slice(0, 7)
      byMonth[month] = (byMonth[month] ?? 0) + Math.abs(row.amount)
    }
    return {
      data: daily.data ? byMonth : undefined,
      isPending: daily.isPending,
      isError: daily.isError,
      refetch: daily.refetch,
    }
  }

  const byMonth: Record<string, number> = {}
  for (const [month, row] of Object.entries(monthly.data ?? {})) {
    byMonth[month] = Math.abs(row.expense)
  }
  return {
    data: monthly.data ? byMonth : undefined,
    isPending: monthly.isPending,
    isError: monthly.isError,
    refetch: monthly.refetch,
  }
}
