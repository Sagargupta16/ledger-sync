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
 *
 * Every read keeps its previous data while a new window loads
 * (`keepPreviousData`); `useStablePeriodData` in the page hook decides when the
 * whole set has moved to the new window.
 */

import { useMemo } from 'react'

import { keepPreviousData, useQuery } from '@tanstack/react-query'

import {
  expenseCategoryDailySeriesOptions,
  expenseDailySeriesOptions,
} from '@/components/analytics/categoryDailySeriesQueries'
import {
  categoryBreakdownOptions,
  monthlyAggregationOptions,
  totalsOptions,
} from '@/hooks/api/useAnalytics'

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
  /** The previous window's data, held while this window loads. */
  readonly isPlaceholderData: boolean
  readonly dataUpdatedAt: number
  readonly refetch: () => Promise<unknown>
}

function toParams(range: SpendingRange): { start_date?: string; end_date?: string } {
  return { start_date: range.start_date, end_date: range.end_date }
}

/** `/category-breakdown` for Expense rows in the window (classified losses held out). */
export function useExpenseBreakdown(range: SpendingRange) {
  return useQuery({
    ...categoryBreakdownOptions({ transaction_type: 'expense', ...toParams(range) }),
    placeholderData: keepPreviousData,
  })
}

/**
 * `/category-breakdown` for Income rows. Only a category deep-link needs it
 * (income IN that category), so it stays idle otherwise.
 */
export function useIncomeBreakdown(range: SpendingRange, enabled: boolean) {
  const query = useQuery({
    ...categoryBreakdownOptions({ transaction_type: 'income', ...toParams(range) }),
    enabled,
    placeholderData: keepPreviousData,
  })
  // A disabled query reports `isPending` forever; it is not loading anything.
  return { ...query, isPending: enabled && query.isPending }
}

/** `/totals` for the window: income, spending, classified losses, row count. */
export function useRangeTotals(range: SpendingRange) {
  return useQuery({ ...totalsOptions(toParams(range)), placeholderData: keepPreviousData })
}

/**
 * The window-keyed series the page's chart sections read for the window they
 * are handed: MultiCategoryTimeAnalysis's every-category series and
 * EnhancedSubcategoryAnalysis's opening category. Read here for the SELECTED
 * window so the page commits only once they are cached too; the sections then
 * switch with the page instead of dropping to their own skeletons after it.
 */
export function useSectionSeries(range: SpendingRange, openingCategory: string) {
  const params = toParams(range)
  const everyCategory = useQuery({
    ...expenseDailySeriesOptions(params),
    placeholderData: keepPreviousData,
  })
  const opening = useQuery({
    ...expenseCategoryDailySeriesOptions(openingCategory, params),
    placeholderData: keepPreviousData,
  })
  return [everyCategory, opening] as const
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
  const monthly = useQuery({
    ...monthlyAggregationOptions(params),
    enabled: !category,
    placeholderData: keepPreviousData,
  })
  // Same key shape (and response) as EnhancedSubcategoryAnalysis's read, so a
  // category the user opened there is already cached here.
  const daily = useQuery({
    ...expenseCategoryDailySeriesOptions(category ?? undefined, params),
    enabled: Boolean(category),
    placeholderData: keepPreviousData,
  })

  // Folded once per response, not per render, so the map keeps its identity
  // for the memos downstream.
  const dailyData = daily.data
  const monthlyData = monthly.data
  const byMonth = useMemo(() => {
    if (category) {
      if (!dailyData) return undefined
      const out: Record<string, number> = {}
      for (const row of dailyData.data) {
        const month = row.date.slice(0, 7)
        out[month] = (out[month] ?? 0) + Math.abs(row.amount)
      }
      return out
    }
    if (!monthlyData) return undefined
    const out: Record<string, number> = {}
    for (const [month, row] of Object.entries(monthlyData)) {
      out[month] = Math.abs(row.expense)
    }
    return out
  }, [category, dailyData, monthlyData])

  const source = category ? daily : monthly
  return {
    data: byMonth,
    isPending: source.isPending,
    isError: source.isError,
    isPlaceholderData: source.isPlaceholderData,
    dataUpdatedAt: source.dataUpdatedAt,
    refetch: source.refetch,
  }
}
