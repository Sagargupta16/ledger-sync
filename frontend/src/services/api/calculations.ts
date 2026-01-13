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
}
