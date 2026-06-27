import { apiClient } from './client'

export interface MasterCategories {
  income: Record<string, string[]>
  expense: Record<string, string[]>
}

export interface TotalsData {
  total_income: number
  total_expenses: number
  net_savings: number
  savings_rate: number
  transaction_count: number
}

export interface MonthlyAggregation {
  [month: string]: {
    income: number
    expense: number
    net_savings: number
    transactions: number
    income_count: number
    expense_count: number
  }
}

export interface YearlyAggregation {
  [year: string]: {
    income: number
    expense: number
    net_savings: number
    transactions: number
    months: number[]
  }
}

export interface CategoryBreakdown {
  categories: Record<
    string,
    {
      total: number
      count: number
      percentage: number
      subcategories: Record<string, number>
    }
  >
  total: number
}

export interface AccountBalance {
  balance: number
  transactions: number
  last_transaction: string | null
}

export interface AccountBalances {
  accounts: Record<string, AccountBalance>
  total_balance: number
  total_accounts: number
  average_balance: number
  positive_accounts: number
  negative_accounts: number
}

export interface DateRangeParams {
  start_date?: string
  end_date?: string
}

export interface IncomeAnalysisData {
  total_income: number
  category_breakdown: Record<string, number>
  monthly_data: { month: string; income: number; income_avg_3m: number }[]
  cashbacks_total: number
  peak_income: number
  growth_rate: number
}

export interface QuickInsightsData {
  min_date: string | null
  max_date: string | null
  net_cashback: number
  cashback_count: number
  median_expense: number
  biggest_expense: { amount: number; category: string }
  avg_expense: number
  total_spending: number
  expense_count: number
  weekend_spending: number
  weekday_spending: number
  /** JS getDay convention: 0=Sun..6=Sat */
  peak_day: number
  peak_day_total: number
  total_transfers: number
  transfer_count: number
  top_income_source: { category: string; amount: number } | null
  most_expensive_month: { period: string; amount: number } | null
}

export const calculationsApi = {
  getMasterCategories: () =>
    apiClient.get<MasterCategories>('/api/calculations/categories/master'),

  getTotals: (params?: DateRangeParams) =>
    apiClient.get<TotalsData>('/api/calculations/totals', { params }),

  getMonthlyAggregation: (params?: DateRangeParams) =>
    apiClient.get<MonthlyAggregation>('/api/calculations/monthly-aggregation', { params }),

  getYearlyAggregation: (params?: DateRangeParams) =>
    apiClient.get<YearlyAggregation>('/api/calculations/yearly-aggregation', { params }),

  getCategoryBreakdown: (params?: DateRangeParams & { transaction_type?: 'income' | 'expense' }) =>
    apiClient.get<CategoryBreakdown>('/api/calculations/category-breakdown', { params }),

  getAccountBalances: (params?: DateRangeParams) =>
    apiClient.get<AccountBalances>('/api/calculations/account-balances', { params }),

  getQuickInsights: (params?: DateRangeParams) =>
    apiClient.get<QuickInsightsData>('/api/calculations/quick-insights', { params }),

  /** Per-category absolute spend aligned to the supplied trailing month keys. */
  getCategoryMonthlyHistory: (months: string[], transactionType: 'income' | 'expense') =>
    apiClient.get<Record<string, number[]>>('/api/calculations/category-monthly-history', {
      params: { months: months.join(','), transaction_type: transactionType },
    }),

  /** Min/max transaction date (YYYY-MM-DD) for time-filter nav bounds. */
  getDataDateRange: () =>
    apiClient.get<{ min_date: string | null; max_date: string | null }>(
      '/api/calculations/data-date-range',
    ),

  /** Income page stats: total, by-category, monthly trend (+3mo avg), cashback. */
  getIncomeAnalysis: (
    params: DateRangeParams & { cashback_categories?: string[]; category?: string },
  ) =>
    apiClient.get<IncomeAnalysisData>('/api/calculations/income-analysis', {
      params: { ...params, cashback_categories: params.cashback_categories },
      // Repeat the param per array item (FastAPI list[str] convention).
      paramsSerializer: { indexes: null },
    }),

  /** Daily per-(category, subcategory) sums for client-side time-series bucketing. */
  getCategoryDailySeries: (
    params: DateRangeParams & { transaction_type?: 'income' | 'expense'; category?: string },
  ) =>
    apiClient.get<{
      data: { date: string; category: string; subcategory: string; amount: number }[]
      transaction_count: number
    }>('/api/calculations/category-daily-series', { params }),
}
