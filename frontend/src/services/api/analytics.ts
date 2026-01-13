import type { TimeRange, Transaction } from '@/types'
import { apiClient } from './client'

export interface OverviewData {
  total_income: number
  total_expenses: number
  net_change: number
  best_month: { month: string; surplus: number } | null
  worst_month: { month: string; surplus: number } | null
  asset_allocation: Array<{ account: string; balance: number }>
  transaction_count: number
}

export interface BehaviorData {
  avg_transaction_size: number
  spending_frequency: number
  convenience_spending_pct: number
  lifestyle_inflation: number
  top_categories: Array<{ category: string; amount: number }>
}

export interface TrendsData {
  monthly_trends: Array<{
    month: string
    income: number
    expenses: number
    surplus: number
  }>
  surplus_trend: Array<{ month: string; surplus: number }>
  consistency_score: number
}

export interface WrappedInsight {
  title: string
  value: string
  description: string
}

export interface KPIData {
  savings_rate: number
  daily_spending_rate: number
  monthly_burn_rate: number
  spending_velocity: number
  category_concentration: number
  consistency_score: number
  lifestyle_inflation: number
  convenience_spending_pct: number
}

export interface ChartData {
  data: Array<Record<string, string | number | undefined>>
}

export interface GeneratedInsight {
  type: string
  title: string
  message: string
  severity: 'info' | 'warning' | 'success'
  metric?: number
  context?: Record<string, unknown>
}

export const analyticsService = {
  getKPIs: async (params?: { start_date?: string; end_date?: string }) => {
    const response = await apiClient.get<KPIData>('/api/analytics/kpis', { params })
    return response.data
  },

  getRecentTransactions: async (limit: number = 5): Promise<Transaction[]> => {
    const response = await apiClient.get<Transaction[]>('/api/transactions')
    const transactions = response.data || []
    return transactions.slice(0, limit)
  },

  getOverview: async (timeRange: TimeRange = 'all_time') => {
    const response = await apiClient.get<OverviewData>('/api/analytics/overview', {
      params: { time_range: timeRange },
    })
    return response.data
  },

  getBehavior: async (timeRange: TimeRange = 'all_time') => {
    const response = await apiClient.get<BehaviorData>('/api/analytics/behavior', {
      params: { time_range: timeRange },
    })
    return response.data
  },

  getTrends: async (timeRange: TimeRange = 'all_time') => {
    const response = await apiClient.get<TrendsData>('/api/analytics/trends', {
      params: { time_range: timeRange },
    })
    return response.data
  },

  getWrapped: async (timeRange: TimeRange = 'all_time') => {
    const response = await apiClient.get<{ insights: WrappedInsight[] }>(
      '/api/analytics/wrapped',
      {
        params: { time_range: timeRange },
      },
    )
    return response.data
  },

  getIncomeExpenseChart: async (timeRange: TimeRange = 'all_time') => {
    const response = await apiClient.get<ChartData>('/api/analytics/charts/income-expense', {
      params: { time_range: timeRange },
    })
    return response.data
  },

  getCategoriesChart: async (timeRange: TimeRange = 'all_time', limit = 10) => {
    const response = await apiClient.get<ChartData>('/api/analytics/charts/categories', {
      params: { time_range: timeRange, limit },
    })
    return response.data
  },

  getMonthlyTrendsChart: async (timeRange: TimeRange = 'last_12_months') => {
    const response = await apiClient.get<ChartData>('/api/analytics/charts/monthly-trends', {
      params: { time_range: timeRange },
    })
    return response.data
  },

  getAccountDistributionChart: async (timeRange: TimeRange = 'all_time') => {
    const response = await apiClient.get<ChartData>(
      '/api/analytics/charts/account-distribution',
      {
        params: { time_range: timeRange },
      },
    )
    return response.data
  },

  getGeneratedInsights: async (timeRange: TimeRange = 'all_time') => {
    const response = await apiClient.get<{ insights: GeneratedInsight[] }>(
      '/api/analytics/insights/generated',
      {
        params: { time_range: timeRange },
      },
    )
    return response.data
  },
}
