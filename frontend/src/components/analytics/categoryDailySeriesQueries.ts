import { queryOptions } from '@tanstack/react-query'

import { calculationsApi } from '@/services/api/calculations'

/**
 * `/category-daily-series` reads for Expense rows, shared by the sections that
 * chart them and by the Expense Analysis page, which reads the same keys for a
 * newly selected window so those sections switch with the page instead of
 * dropping to their own skeletons after it (see `useStablePeriodData`). One
 * factory per key shape keeps the page and the sections on one cache entry.
 * Under the `category-daily-series` prefix that every preference save
 * invalidates.
 */

interface SeriesRange {
  readonly start_date?: string
  readonly end_date?: string
}

/** The category `EnhancedSubcategoryAnalysis` opens on when no filter names one. */
export const DEFAULT_SUBCATEGORY_FOCUS = 'Food & Dining'

/** Every expense category's daily sums (MultiCategoryTimeAnalysis). */
export const expenseDailySeriesOptions = (range?: SeriesRange) =>
  queryOptions({
    queryKey: ['category-daily-series', 'expense', range?.start_date, range?.end_date] as const,
    queryFn: async () =>
      (
        await calculationsApi.getCategoryDailySeries({
          transaction_type: 'expense',
          start_date: range?.start_date,
          end_date: range?.end_date,
        })
      ).data,
    staleTime: Infinity,
  })

/** One expense category's daily sums per subcategory. */
export const expenseCategoryDailySeriesOptions = (category: string | undefined, range?: SeriesRange) =>
  queryOptions({
    queryKey: ['category-daily-series', 'expense', category, range?.start_date, range?.end_date] as const,
    queryFn: async () =>
      (
        await calculationsApi.getCategoryDailySeries({
          transaction_type: 'expense',
          category,
          start_date: range?.start_date,
          end_date: range?.end_date,
        })
      ).data,
    staleTime: Infinity,
  })
