import { queryOptions, useQuery } from '@tanstack/react-query'
import { analyticsService } from '@/services/api/analytics'
import { calculationsApi } from '@/services/api/calculations'
import type { TimeRange } from '@/types'

// Data only changes on upload (which clears the cache and re-prefetches).
// staleTime: Infinity means queries never auto-refetch — cache is only
// cleared by explicit mutation (upload / settings save).
const STABLE = { staleTime: Infinity, refetchOnWindowFocus: false } as const

// ─── Query Option Factories ──────────────────────────────────────────────────
// Exported so mutations / prefetches can reference them for cache invalidation.

export const kpisOptions = (params?: { start_date?: string; end_date?: string }) =>
  queryOptions({ queryKey: ['kpis', params], queryFn: () => analyticsService.getKPIs(params), ...STABLE })

export const recentTransactionsOptions = (limit: number = 5) =>
  queryOptions({ queryKey: ['transactions', 'recent', limit], queryFn: () => analyticsService.getRecentTransactions(limit), ...STABLE })

export const overviewOptions = (timeRange: TimeRange = 'all_time') =>
  queryOptions({ queryKey: ['analytics', 'overview', timeRange], queryFn: () => analyticsService.getOverview(timeRange), ...STABLE })

export const behaviorOptions = (timeRange: TimeRange = 'all_time') =>
  queryOptions({ queryKey: ['analytics', 'behavior', timeRange], queryFn: () => analyticsService.getBehavior(timeRange), ...STABLE })

export const trendsOptions = (timeRange: TimeRange = 'all_time') =>
  queryOptions({ queryKey: ['analytics', 'trends', timeRange], queryFn: () => analyticsService.getTrends(timeRange), ...STABLE })

export const accountDistributionOptions = (timeRange: TimeRange = 'all_time') =>
  queryOptions({ queryKey: ['analytics', 'account-distribution', timeRange], queryFn: () => analyticsService.getAccountDistributionChart(timeRange), ...STABLE })

export const categoriesChartOptions = (timeRange: TimeRange = 'all_time', limit = 10) =>
  queryOptions({ queryKey: ['analytics', 'categories-chart', timeRange, limit], queryFn: () => analyticsService.getCategoriesChart(timeRange, limit), ...STABLE })

export const monthlyTrendsOptions = (timeRange: TimeRange = 'all_time') =>
  queryOptions({ queryKey: ['analytics', 'monthly-trends', timeRange], queryFn: () => analyticsService.getMonthlyTrendsChart(timeRange), ...STABLE })

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

export const masterCategoriesOptions = () =>
  queryOptions({
    queryKey: ['calculations', 'master-categories'] as const,
    queryFn: async () => (await calculationsApi.getMasterCategories()).data,
    ...STABLE,
  })

// ─── Hook Wrappers ───────────────────────────────────────────────────────────

export const useKPIs = (params?: { start_date?: string; end_date?: string }) => useQuery(kpisOptions(params))
export const useRecentTransactions = (limit: number = 5) => useQuery(recentTransactionsOptions(limit))
export const useOverview = (timeRange: TimeRange = 'all_time') => useQuery(overviewOptions(timeRange))
export const useBehavior = (timeRange: TimeRange = 'all_time') => useQuery(behaviorOptions(timeRange))
export const useTrends = (timeRange: TimeRange = 'all_time') => useQuery(trendsOptions(timeRange))
export const useAccountDistribution = (timeRange: TimeRange = 'all_time') => useQuery(accountDistributionOptions(timeRange))
export const useCategoriesChart = (timeRange: TimeRange = 'all_time', limit = 10) => useQuery(categoriesChartOptions(timeRange, limit))
export const useMonthlyTrends = (timeRange: TimeRange = 'all_time') => useQuery(monthlyTrendsOptions(timeRange))
export const useCategoryBreakdown = (params?: { start_date?: string; end_date?: string; transaction_type?: 'income' | 'expense' }) => useQuery(categoryBreakdownOptions(params))
export const useAccountBalances = (params?: { start_date?: string; end_date?: string }) => useQuery(accountBalancesOptions(params))
export const useMonthlyAggregation = (params?: { start_date?: string; end_date?: string }) => useQuery(monthlyAggregationOptions(params))
export const useTotals = (params?: { start_date?: string; end_date?: string }) => useQuery(totalsOptions(params))
export const useMasterCategories = () => useQuery(masterCategoriesOptions())
