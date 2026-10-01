import { useMemo } from 'react'
import { queryOptions, useQuery } from '@tanstack/react-query'
import { analyticsService } from '@/services/api/analytics'
import { calculationsApi } from '@/services/api/calculations'
import type { TimeRange } from '@/types'

// Data only changes on upload (which clears the cache and re-prefetches).
// staleTime: Infinity means queries never auto-refetch -- cache is only
// cleared by explicit mutation (upload / settings save).
const STABLE = { staleTime: Infinity, refetchOnWindowFocus: false } as const

// ─── Query Option Factories ──────────────────────────────────────────────────
// Exported so mutations / prefetches can reference them for cache invalidation.

// `time_range`, not a date window -- `GET /api/analytics/kpis` declares only
// `time_range` (`get_kpis` in backend/src/ledger_sync/api/analytics.py). The old
// `{ start_date, end_date }` params were silently dropped by FastAPI, so a
// date-filtered KPI read answered with all-time figures under a type that said
// otherwise. Key shape is unchanged: no caller passes params today.
export const kpisOptions = (params?: { time_range?: TimeRange }) =>
  queryOptions({ queryKey: ['kpis', params], queryFn: () => analyticsService.getKPIs(params), ...STABLE })

export const recentTransactionsOptions = (limit: number = 5) =>
  queryOptions({ queryKey: ['transactions', 'recent', limit], queryFn: () => analyticsService.getRecentTransactions(limit), ...STABLE })

export const overviewOptions = (timeRange: TimeRange = 'all_time') =>
  queryOptions({ queryKey: ['analytics', 'overview', timeRange], queryFn: () => analyticsService.getOverview(timeRange), ...STABLE })

export const behaviorOptions = (timeRange: TimeRange = 'all_time') =>
  queryOptions({ queryKey: ['analytics', 'behavior', timeRange], queryFn: () => analyticsService.getBehavior(timeRange), ...STABLE })

export const trendsOptions = (timeRange: TimeRange = 'all_time') =>
  queryOptions({ queryKey: ['analytics', 'trends', timeRange], queryFn: () => analyticsService.getTrends(timeRange), ...STABLE })

// `accountDistributionOptions` / `categoriesChartOptions` / `monthlyTrendsOptions`
// and their `useAccountDistribution` / `useCategoriesChart` / `useMonthlyTrends`
// wrappers were removed along with the service methods they called -- zero call
// sites anywhere under `src/`, and no `DEMO_ROUTES` entry, so unlike the
// consumerless-but-serviceable `useKPIs` / `useOverview` / `useBehavior` (pinned
// by `lib/demo/__tests__/seedReaderContract.test.tsx`) they could not have
// served a page in demo mode either. The `/api/analytics/charts/*` endpoints are
// still live; see the note at the bottom of `services/api/analytics.ts`.

export const categoryBreakdownOptions = (params?: { start_date?: string; end_date?: string; transaction_type?: 'income' | 'expense' }) =>
  queryOptions({
    queryKey: ['calculations', 'category-breakdown', params] as const,
    queryFn: async () => (await calculationsApi.getCategoryBreakdown(params)).data,
    ...STABLE,
  })

export const accountBalancesOptions = (params?: { start_date?: string; end_date?: string }) =>
  queryOptions({
    queryKey: ['calculations', 'account-balances', params] as const,
    queryFn: async () => (await calculationsApi.getAccountBalances(params)).data,
    ...STABLE,
  })

export const monthlyAggregationOptions = (params?: { start_date?: string; end_date?: string }) =>
  queryOptions({
    queryKey: ['calculations', 'monthly-aggregation', params] as const,
    queryFn: async () => (await calculationsApi.getMonthlyAggregation(params)).data,
    ...STABLE,
  })

export const totalsOptions = (params?: { start_date?: string; end_date?: string }) =>
  queryOptions({
    queryKey: ['calculations', 'totals', params] as const,
    queryFn: async () => (await calculationsApi.getTotals(params)).data,
    ...STABLE,
  })

export const quickInsightsOptions = (params?: { start_date?: string; end_date?: string }) =>
  queryOptions({
    queryKey: ['calculations', 'quick-insights', params] as const,
    queryFn: async () => (await calculationsApi.getQuickInsights(params)).data,
    ...STABLE,
  })

export const dataDateRangeOptions = () =>
  queryOptions({
    queryKey: ['calculations', 'data-date-range'] as const,
    queryFn: async () => (await calculationsApi.getDataDateRange()).data,
    ...STABLE,
  })

/**
 * `/income-analysis` for a window. The key carries every param the request
 * sends, cashback list included, because staleTime is Infinity. The Dashboard and
 * the Income page both read through this factory, so an unfiltered window is one
 * cache entry (an undefined `category` drops out of the hashed key).
 */
export const incomeAnalysisOptions = (params: {
  start_date?: string
  end_date?: string
  category?: string
  cashback_categories: string[]
}) =>
  queryOptions({
    queryKey: ['income-analysis', params] as const,
    queryFn: async () => (await calculationsApi.getIncomeAnalysis(params)).data,
    ...STABLE,
  })

/**
 * Daily income sums per (category, subcategory): the evidence
 * `resolveEarningStart` needs, without the full ledger. Same key and request as
 * the Income page's evidence query, so the two share one cache entry. A day's
 * sum is positive exactly when one of its rows is (amounts are stored >= 0), so
 * the inferred start date matches the row-level result.
 */
export const earningStartEvidenceOptions = () =>
  queryOptions({
    queryKey: ['earning-start-evidence'] as const,
    queryFn: async () =>
      (await calculationsApi.getCategoryDailySeries({ transaction_type: 'income' })).data.data,
    staleTime: Infinity,
  })

export const masterCategoriesOptions = () =>
  queryOptions({
    queryKey: ['calculations', 'master-categories'] as const,
    queryFn: async () => (await calculationsApi.getMasterCategories()).data,
    ...STABLE,
  })

/** Income buckets with row counts + sums, for the Settings classification audit. */
export const incomeFacetsOptions = () =>
  queryOptions({
    queryKey: ['calculations', 'income-facets'] as const,
    queryFn: async () => (await calculationsApi.getIncomeFacets()).data,
    ...STABLE,
  })

// ─── Hook Wrappers ───────────────────────────────────────────────────────────

export const useKPIs = (params?: { time_range?: TimeRange }) => useQuery(kpisOptions(params))
export const useRecentTransactions = (limit: number = 5) => useQuery(recentTransactionsOptions(limit))
export const useOverview = (timeRange: TimeRange = 'all_time') => useQuery(overviewOptions(timeRange))
export const useBehavior = (timeRange: TimeRange = 'all_time') => useQuery(behaviorOptions(timeRange))
export const useTrends = (timeRange: TimeRange = 'all_time') => useQuery(trendsOptions(timeRange))
export const useCategoryBreakdown = (params?: { start_date?: string; end_date?: string; transaction_type?: 'income' | 'expense' }) => useQuery(categoryBreakdownOptions(params))
export const useAccountBalances = (params?: { start_date?: string; end_date?: string }) => useQuery(accountBalancesOptions(params))
export const useMonthlyAggregation = (params?: { start_date?: string; end_date?: string }) => useQuery(monthlyAggregationOptions(params))
export const useTotals = (params?: { start_date?: string; end_date?: string }) => useQuery(totalsOptions(params))
export const useQuickInsights = (params?: { start_date?: string; end_date?: string }) => useQuery(quickInsightsOptions(params))
/** Returns `{ minDate, maxDate }` for the analytics time-filter without fetching the ledger. */
export const useDataDateRange = () => {
  const query = useQuery(dataDateRangeOptions())
  return {
    minDate: query.data?.min_date ?? undefined,
    maxDate: query.data?.max_date ?? undefined,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  }
}
/**
 * Referentially stable `{ minDate, maxDate }` for `useAnalyticsTimeFilter(bounds)`.
 * Same non-deleted, non-excluded rows `/transactions/all` returns, so the bounds
 * equal the min/max of the ledger array without sorting every row's date.
 */
export const useDataDateBounds = () => {
  const { minDate, maxDate } = useDataDateRange()
  return useMemo(() => ({ minDate, maxDate }), [minDate, maxDate])
}
export const useMasterCategories = () => useQuery(masterCategoriesOptions())
export const useIncomeFacets = () => useQuery(incomeFacetsOptions())
