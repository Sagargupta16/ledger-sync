import { useQuery } from '@tanstack/react-query'
import { analyticsService } from '@/services/api/analytics'
import { calculationsApi } from '@/services/api/calculations'
import type { TimeRange } from '@/types'

// KPIs and Dashboard
export function useKPIs(params?: { start_date?: string; end_date?: string }) {
  return useQuery({
    queryKey: ['kpis', params],
    queryFn: () => analyticsService.getKPIs(params),
  })
}

export function useRecentTransactions(limit: number = 5) {
  return useQuery({
    queryKey: ['transactions', 'recent', limit],
    queryFn: () => analyticsService.getRecentTransactions(limit),
  })
}

// Analytics Overview
export const useOverview = (timeRange: TimeRange = 'all_time') => {
  return useQuery({
    queryKey: ['analytics', 'overview', timeRange],
    queryFn: () => analyticsService.getOverview(timeRange),
  })
}

export const useBehavior = (timeRange: TimeRange = 'all_time') => {
  return useQuery({
    queryKey: ['analytics', 'behavior', timeRange],
    queryFn: () => analyticsService.getBehavior(timeRange),
  })
}

export const useTrends = (timeRange: TimeRange = 'all_time') => {
  return useQuery({
    queryKey: ['analytics', 'trends', timeRange],
    queryFn: () => analyticsService.getTrends(timeRange),
  })
}

// Charts
export const useAccountDistribution = (timeRange: TimeRange = 'all_time') => {
  return useQuery({
    queryKey: ['analytics', 'account-distribution', timeRange],
    queryFn: () => analyticsService.getAccountDistributionChart(timeRange),
  })
}

export const useCategoriesChart = (timeRange: TimeRange = 'all_time', limit = 10) => {
  return useQuery({
    queryKey: ['analytics', 'categories-chart', timeRange, limit],
    queryFn: () => analyticsService.getCategoriesChart(timeRange, limit),
  })
}

export const useMonthlyTrends = (timeRange: TimeRange = 'last_12_months') => {
  return useQuery({
    queryKey: ['analytics', 'monthly-trends', timeRange],
    queryFn: () => analyticsService.getMonthlyTrendsChart(timeRange),
  })
}

// Calculations
export const useCategoryBreakdown = (params?: {
  start_date?: string
  end_date?: string
  transaction_type?: 'income' | 'expense'
}) => {
  return useQuery({
    queryKey: ['calculations', 'category-breakdown', params],
    queryFn: async () => {
      const response = await calculationsApi.getCategoryBreakdown(params)
      return response.data
    },
  })
}

export const useAccountBalances = (params?: { start_date?: string; end_date?: string }) => {
  return useQuery({
    queryKey: ['calculations', 'account-balances', params],
    queryFn: async () => {
      const response = await calculationsApi.getAccountBalances(params)
      return response.data
    },
  })
}

export const useMonthlyAggregation = (params?: { start_date?: string; end_date?: string }) => {
  return useQuery({
    queryKey: ['calculations', 'monthly-aggregation', params],
    queryFn: async () => {
      const response = await calculationsApi.getMonthlyAggregation(params)
      return response.data
    },
  })
}

export const useTotals = (params?: { start_date?: string; end_date?: string }) => {
  return useQuery({
    queryKey: ['calculations', 'totals', params],
    queryFn: async () => {
      const response = await calculationsApi.getTotals(params)
      return response.data
    },
  })
}

// Insights
export const useGeneratedInsights = (timeRange: TimeRange = 'all_time') => {
  return useQuery({
    queryKey: ['analytics', 'generated-insights', timeRange],
    queryFn: () => analyticsService.getGeneratedInsights(timeRange),
  })
}
