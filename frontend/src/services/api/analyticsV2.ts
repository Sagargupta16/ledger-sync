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

// Types

export interface MonthlySummary {
  id: number
  year: number
  month: number
  period_key: string
  total_income: number
  salary_income: number
  investment_income: number
  other_income: number
  total_expenses: number
  essential_expenses: number
  discretionary_expenses: number
  net_savings: number
  savings_rate: number
  total_transfers_out: number
  total_transfers_in: number
  net_investment_flow: number
  income_count: number
  expense_count: number
  transfer_count: number
  mom_income_change: number | null
  mom_expense_change: number | null
  created_at: string
}

export interface CategoryTrend {
  id: number
  category: string
  subcategory: string | null
  year: number
  month: number
  period_key: string
  total_amount: number
  transaction_count: number
  avg_transaction: number
  mom_change: number | null
  yoy_change: number | null
  pct_of_total: number | null
  created_at: string
}

export interface TransferFlow {
  id: number
  from_account: string
  to_account: string
  year: number
  month: number
  period_key: string
  total_amount: number
  transfer_count: number
  avg_transfer: number
  created_at: string
}

export interface RecurringTransaction {
  id: number
  pattern_hash: string
  description: string
  amount: number
  amount_variance: number
  frequency: 'weekly' | 'bi_weekly' | 'monthly' | 'quarterly' | 'yearly'
  category: string
  subcategory: string | null
  account: string
  first_occurrence: string
  last_occurrence: string
  occurrence_count: number
  expected_next: string | null
  confidence_score: number
  is_confirmed: boolean
  is_active: boolean
  notes: string | null
  created_at: string
  updated_at: string | null
}

export interface MerchantIntelligence {
  id: number
  merchant_name: string
  normalized_name: string
  category: string
  subcategory: string | null
  total_spent: number
  transaction_count: number
  avg_transaction: number
  first_transaction: string
  last_transaction: string
  frequency_days: number | null
  is_subscription: boolean
  typical_amount: number | null
  created_at: string
  updated_at: string | null
}

export interface NetWorthSnapshot {
  id: number
  snapshot_date: string
  cash_and_bank: number
  investments: number
  mutual_funds: number
  stocks: number
  fixed_deposits: number
  ppf_epf: number
  other_assets: number
  credit_card_outstanding: number
  loans_payable: number
  other_liabilities: number
  total_assets: number
  total_liabilities: number
  net_worth: number
  net_worth_change: number
  net_worth_change_pct: number
  source: string
  created_at: string
}

export interface FYSummary {
  id: number
  fiscal_year: string
  start_date: string
  end_date: string
  total_income: number
  salary_income: number
  bonus_income: number
  investment_income: number
  other_income: number
  total_expenses: number
  tax_paid: number
  investments_made: number
  net_savings: number
  savings_rate: number
  effective_tax_rate: number | null
  yoy_income_change: number | null
  yoy_expense_change: number | null
  yoy_savings_change: number | null
  is_complete: boolean
  created_at: string
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
  created_at: string
}

export interface Budget {
  id: number
  category: string
  subcategory: string | null
  year: number
  month: number
  period_key: string
  budgeted_amount: number
  spent_amount: number
  remaining_amount: number
  usage_pct: number
  is_exceeded: boolean
  alert_threshold: number
  notes: string | null
  created_at: string
  updated_at: string | null
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
  category: string | null
  account: string | null
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
    const response = await apiClient.get<WrappedResponse<MonthlySummary>>('/analytics/v2/monthly-summaries', { params })
    return response.data.data
  },

  // Category Trends
  async getCategoryTrends(params?: {
    category?: string
    subcategory?: string
    limit?: number
    offset?: number
  }) {
    const response = await apiClient.get<WrappedResponse<CategoryTrend>>('/analytics/v2/category-trends', { params })
    return response.data.data
  },

  // Transfer Flows
  async getTransferFlows(params?: { limit?: number; offset?: number }) {
    const response = await apiClient.get<WrappedResponse<TransferFlow>>('/analytics/v2/transfer-flows', { params })
    return response.data.data
  },

  // Recurring Transactions
  async getRecurringTransactions(params?: {
    confirmed_only?: boolean
    active_only?: boolean
    limit?: number
    offset?: number
  }) {
    const response = await apiClient.get<WrappedResponse<RecurringTransaction>>('/analytics/v2/recurring-transactions', {
      params,
    })
    return response.data.data
  },

  // Merchant Intelligence
  async getMerchantIntelligence(params?: {
    category?: string
    min_transactions?: number
    limit?: number
    offset?: number
  }) {
    const response = await apiClient.get<WrappedResponse<MerchantIntelligence>>('/analytics/v2/merchant-intelligence', {
      params,
    })
    return response.data.data
  },

  // Net Worth
  async getNetWorthSnapshots(params?: { limit?: number; offset?: number }) {
    const response = await apiClient.get<WrappedResponse<NetWorthSnapshot>>('/analytics/v2/net-worth', { params })
    return response.data.data
  },

  // Fiscal Year Summaries
  async getFYSummaries(params?: { limit?: number; offset?: number }) {
    const response = await apiClient.get<WrappedResponse<FYSummary>>('/analytics/v2/fy-summaries', { params })
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
    const response = await apiClient.get<WrappedResponse<Anomaly>>('/analytics/v2/anomalies', { params })
    return response.data.data
  },

  async reviewAnomaly(anomalyId: number, data: { dismiss: boolean; notes?: string }) {
    const response = await apiClient.post<Anomaly>(`/analytics/v2/anomalies/${anomalyId}/review`, data)
    return response.data
  },

  // Budgets
  async getBudgets(params?: { year?: number; month?: number; category?: string }) {
    const response = await apiClient.get<WrappedResponse<Budget>>('/analytics/v2/budgets', { params })
    return response.data.data
  },

  async createBudget(data: {
    category: string
    subcategory?: string
    year: number
    month: number
    budgeted_amount: number
    alert_threshold?: number
    notes?: string
  }) {
    const response = await apiClient.post<Budget>('/analytics/v2/budgets', data)
    return response.data
  },

  // Goals
  async getGoals(params?: { goal_type?: string; include_achieved?: boolean }) {
    const response = await apiClient.get<WrappedResponse<FinancialGoal>>('/analytics/v2/goals', { params })
    return response.data.data
  },

  async createGoal(data: {
    name: string
    goal_type: string
    target_amount: number
    target_date: string
    notes?: string
  }) {
    const response = await apiClient.post<FinancialGoal>('/analytics/v2/goals', data)
    return response.data
  },
}
