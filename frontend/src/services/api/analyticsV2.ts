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
  is_active: boolean
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
  target_date: string | null
  is_achieved: boolean
  achieved_date: string | null
  notes: string | null
  created_at: string
  updated_at: string | null
}

export interface DailySummary {
  date: string
  income: number
  expense: number
  net: number
  income_count: number
  expense_count: number
  transfer_count: number
  total_transactions: number
  top_category: string | null
}

export interface InvestmentHolding {
  id: number
  account: string
  investment_type: string
  instrument_name: string | null
  invested_amount: number
  current_value: number
  realized_gains: number
  unrealized_gains: number
  is_active: boolean
  last_updated: string | null
}

export interface CohortBucket {
  /** day_of_week: 0=Sun..6=Sat; day_of_month: 1..31; month_of_year: 1..12 */
  bucket: number
  total: number
  occurrences: number
  /** total / occurrences, precomputed with the occurrence-correct divisor */
  avg: number
}

export interface CohortSpendingData {
  day_of_week: CohortBucket[]
  day_of_month: CohortBucket[]
  month_of_year: CohortBucket[]
}

// API functions

// All V2 list endpoints wrap data in { data: T[], count: number, ... }
interface WrappedResponse<T> {
  data: T[]
  count: number
}

/**
 * GET a V2 list endpoint and unwrap the `{ data, count }` envelope down to
 * the bare `T[]`. Every list endpoint shares this shape, so this keeps the
 * unwrap in one place instead of repeating `response.data.data` per method.
 */
async function getWrapped<T>(url: string, params?: Record<string, unknown>): Promise<T[]> {
  const response = await apiClient.get<WrappedResponse<T>>(url, { params })
  return response.data.data
}

export const analyticsV2Service = {
  // Daily Summaries
  getDailySummaries(params?: { start_date?: string; end_date?: string; limit?: number }) {
    return getWrapped<DailySummary>('/api/analytics/v2/daily-summaries', params)
  },

  // Cohort Spending (day-of-week / day-of-month / month-of-year averages)
  async getCohortSpending(): Promise<CohortSpendingData> {
    const response = await apiClient.get<{ data: CohortSpendingData }>(
      '/api/analytics/v2/cohort-spending',
    )
    return response.data.data
  },

  // Investment Holdings
  getInvestmentHoldings(params?: { active_only?: boolean }) {
    return getWrapped<InvestmentHolding>('/api/analytics/v2/investment-holdings', params)
  },

  // Monthly Summaries
  getMonthlySummaries(params?: { limit?: number; offset?: number }) {
    return getWrapped<MonthlySummary>('/api/analytics/v2/monthly-summaries', params)
  },

  // Category Trends
  getCategoryTrends(params?: {
    category?: string
    subcategory?: string
    limit?: number
    offset?: number
  }) {
    return getWrapped<CategoryTrend>('/api/analytics/v2/category-trends', params)
  },

  // Transfer Flows
  getTransferFlows(params?: { limit?: number; offset?: number }) {
    return getWrapped<TransferFlow>('/api/analytics/v2/transfer-flows', params)
  },

  // Recurring Transactions
  getRecurringTransactions(params?: {
    active_only?: boolean
    min_confidence?: number
    limit?: number
    offset?: number
  }) {
    return getWrapped<RecurringTransaction>('/api/analytics/v2/recurring-transactions', params)
  },

  async updateRecurringTransaction(
    id: number,
    body: {
      pattern_name?: string
      frequency?: string
      expected_amount?: number
      is_confirmed?: boolean
      is_active?: boolean
    },
  ) {
    const response = await apiClient.patch<{ status: string; id: number }>(
      `/api/analytics/v2/recurring-transactions/${id}`,
      body,
    )
    return response.data
  },

  async createRecurringTransaction(body: {
    name: string
    type: string
    frequency: string
    amount: number
    category?: string
    expected_day?: number
  }) {
    const response = await apiClient.post<{ status: string; id: number }>(
      '/api/analytics/v2/recurring-transactions',
      body,
    )
    return response.data
  },

  async deleteRecurringTransaction(id: number) {
    const response = await apiClient.delete<{ status: string; id: number }>(
      `/api/analytics/v2/recurring-transactions/${id}`,
    )
    return response.data
  },

  // Merchant Intelligence
  getMerchantIntelligence(params?: {
    min_transactions?: number
    recurring_only?: boolean
    limit?: number
    offset?: number
  }) {
    return getWrapped<MerchantIntelligence>('/api/analytics/v2/merchant-intelligence', params)
  },

  // Net Worth
  getNetWorthSnapshots(params?: { limit?: number; offset?: number }) {
    return getWrapped<NetWorthSnapshot>('/api/analytics/v2/net-worth', params)
  },

  // Fiscal Year Summaries
  getFYSummaries(params?: { limit?: number; offset?: number }) {
    return getWrapped<FYSummary>('/api/analytics/v2/fy-summaries', params)
  },

  // Anomalies
  getAnomalies(params?: {
    type?: string
    severity?: string
    include_reviewed?: boolean
    limit?: number
    offset?: number
  }) {
    return getWrapped<Anomaly>('/api/analytics/v2/anomalies', params)
  },

  async reviewAnomaly(anomalyId: number, data: { dismiss: boolean; notes?: string }) {
    const response = await apiClient.post(`/api/analytics/v2/anomalies/${anomalyId}/review`, null, {
      params: data,
    })
    return response.data
  },

  // Budgets
  getBudgets(params?: { active_only?: boolean }) {
    return getWrapped<Budget>('/api/analytics/v2/budgets', params)
  },

  async createBudget(data: {
    category: string
    subcategory?: string
    monthly_limit: number
    alert_threshold?: number
  }) {
    const response = await apiClient.post('/api/analytics/v2/budgets', data)
    return response.data
  },

  // Goals
  getGoals(params?: { goal_type?: string; include_achieved?: boolean }) {
    return getWrapped<FinancialGoal>('/api/analytics/v2/goals', params)
  },

  async createGoal(data: {
    name: string
    goal_type: string
    target_amount: number
    target_date: string
    notes?: string
  }) {
    const response = await apiClient.post('/api/analytics/v2/goals', data)
    return response.data
  },
}
