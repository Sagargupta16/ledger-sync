/**
 * Analytics V2 API Service
 *
 * Provides access to the new pre-calculated analytics data:
 * - Monthly summaries
 * - Category trends
 * - Transfer flows
 * - Recurring transactions
 * - Merchant intelligence
 * - Net worth snapshots
 * - Fiscal year summaries
 * - Anomalies
 * - Budgets
 * - Financial goals
 */

import { apiClient } from './client'

// Types — these match the actual JSON shapes returned by the backend API

export interface MonthlySummary {
  period: string
  year: number
  month: number
  income: {
    total: number
    salary: number
    investment: number
    other: number
    count: number
    change_pct: number | null
  }
  expenses: {
    total: number
    essential: number
    discretionary: number
    count: number
    change_pct: number | null
  }
  transfers: {
    out: number
    in: number
    net_investment: number
    count: number
  }
  savings: {
    net: number
    rate: number
  }
  expense_ratio: number
  total_transactions: number
  last_calculated: string | null
}

export interface CategoryTrend {
  period: string
  category: string
  subcategory: string | null
  type: string | null
  total: number
  count: number
  avg: number
  max: number
  min: number
  pct_of_monthly: number | null
  mom_change: number
  mom_change_pct: number | null
}

export interface TransferFlow {
  from: string
  to: string
  total: number
  count: number
  avg: number
  last_date: string | null
  last_amount: number | null
  from_type: string | null
  to_type: string | null
}

export interface RecurringTransaction {
  id: number
  name: string
  category: string
  subcategory: string | null
  account: string
  type: string | null
  frequency: string | null
  expected_amount: number
  variance: number
  expected_day: number | null
  confidence: number
  occurrences: number
  last_occurrence: string | null
  next_expected: string | null
  times_missed: number
  is_confirmed: boolean
}

export interface MerchantIntelligence {
  merchant: string
  category: string
  subcategory: string | null
  total_spent: number
  transaction_count: number
  avg_transaction: number
  first_transaction: string | null
  last_transaction: string | null
  months_active: number | null
  avg_days_between: number | null
  is_recurring: boolean
}

export interface NetWorthSnapshot {
  date: string
  assets: {
    cash_and_bank: number
    investments: number
    mutual_funds: number
    stocks: number
    fixed_deposits: number
    ppf_epf: number
    other: number
    total: number
  }
  liabilities: {
    credit_cards: number
    loans: number
    other: number
    total: number
  }
  net_worth: number
  change: number
  change_pct: number | null
}

export interface FYSummary {
  fiscal_year: string
  period: string
  income: {
    total: number
    salary: number
    bonus: number
    investment: number
    other: number
  }
  expenses: {
    total: number
    tax_paid: number
  }
  investments_made: number
  savings: {
    net: number
    rate: number
  }
  yoy: {
    income: number | null
    expenses: number | null
    savings: number | null
  }
  is_complete: boolean
}

export interface Anomaly {
  id: number
  anomaly_type: 'high_expense' | 'unusual_category' | 'large_transfer' | 'budget_exceeded'
  severity: 'low' | 'medium' | 'high'
  description: string
  transaction_id: string | null
  period_key: string | null
  expected_value: number | null
  actual_value: number | null
  deviation_pct: number | null
  detected_at: string
  is_reviewed: boolean
  is_dismissed: boolean
  review_notes: string | null
  reviewed_at: string | null
}

export interface Budget {
  id: number
  category: string
  subcategory: string | null
  monthly_limit: number
  current_spent: number
  remaining: number
  usage_pct: number
  alert_threshold: number
  avg_actual: number
  months_over: number
  months_under: number
}

export interface FinancialGoal {
  id: number
  name: string
  goal_type: 'savings' | 'debt_payoff' | 'investment' | 'expense_reduction' | 'income_increase' | 'custom'
  target_amount: number
  current_amount: number
  progress_pct: number
  start_date: string
  target_date: string
  is_achieved: boolean
  achieved_date: string | null
  notes: string | null
  created_at: string
  updated_at: string | null
}

// API functions

// All V2 endpoints wrap list data in { data: T[], count: number, ... }
interface WrappedResponse<T> {
  data: T[]
  count: number
}

export const analyticsV2Service = {
  // Monthly Summaries
  async getMonthlySummaries(params?: { limit?: number; offset?: number }) {
    const response = await apiClient.get<WrappedResponse<MonthlySummary>>('/api/analytics/v2/monthly-summaries', {
      params,
    })
    return response.data.data
  },

  // Category Trends
  async getCategoryTrends(params?: {
    category?: string
    subcategory?: string
    limit?: number
    offset?: number
  }) {
    const response = await apiClient.get<WrappedResponse<CategoryTrend>>('/api/analytics/v2/category-trends', {
      params,
    })
    return response.data.data
  },

  // Transfer Flows
  async getTransferFlows(params?: { limit?: number; offset?: number }) {
    const response = await apiClient.get<WrappedResponse<TransferFlow>>('/api/analytics/v2/transfer-flows', { params })
    return response.data.data
  },

  // Recurring Transactions
  async getRecurringTransactions(params?: {
    active_only?: boolean
    min_confidence?: number
    limit?: number
    offset?: number
  }) {
    const response = await apiClient.get<WrappedResponse<RecurringTransaction>>(
      '/api/analytics/v2/recurring-transactions',
      { params },
    )
    return response.data.data
  },

  // Merchant Intelligence
  async getMerchantIntelligence(params?: {
    min_transactions?: number
    recurring_only?: boolean
    limit?: number
    offset?: number
  }) {
    const response = await apiClient.get<WrappedResponse<MerchantIntelligence>>(
      '/api/analytics/v2/merchant-intelligence',
      { params },
    )
    return response.data.data
  },

  // Net Worth
  async getNetWorthSnapshots(params?: { limit?: number; offset?: number }) {
    const response = await apiClient.get<WrappedResponse<NetWorthSnapshot>>('/api/analytics/v2/net-worth', { params })
    return response.data.data
  },

  // Fiscal Year Summaries
  async getFYSummaries(params?: { limit?: number; offset?: number }) {
    const response = await apiClient.get<WrappedResponse<FYSummary>>('/api/analytics/v2/fy-summaries', { params })
    return response.data.data
  },

  // Anomalies
  async getAnomalies(params?: {
    type?: string
    severity?: string
    include_reviewed?: boolean
    limit?: number
    offset?: number
  }) {
    const response = await apiClient.get<WrappedResponse<Anomaly>>('/api/analytics/v2/anomalies', { params })
    return response.data.data
  },

  async reviewAnomaly(anomalyId: number, data: { dismiss: boolean; notes?: string }) {
    const response = await apiClient.post(`/api/analytics/v2/anomalies/${anomalyId}/review`, null, {
      params: data,
    })
    return response.data
  },

  // Budgets
  async getBudgets(params?: { active_only?: boolean }) {
    const response = await apiClient.get<WrappedResponse<Budget>>('/api/analytics/v2/budgets', { params })
    return response.data.data
  },

  async createBudget(data: {
    category: string
    subcategory?: string
    monthly_limit: number
    alert_threshold?: number
  }) {
    const response = await apiClient.post('/api/analytics/v2/budgets', null, { params: data })
    return response.data
  },

  // Goals
  async getGoals(params?: { goal_type?: string; include_achieved?: boolean }) {
    const response = await apiClient.get<WrappedResponse<FinancialGoal>>('/api/analytics/v2/goals', { params })
    return response.data.data
  },

  async createGoal(data: {
    name: string
    goal_type: string
    target_amount: number
    target_date: string
    notes?: string
  }) {
    const response = await apiClient.post('/api/analytics/v2/goals', null, { params: data })
    return response.data
  },
}
