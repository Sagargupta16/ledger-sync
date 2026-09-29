/**
 * Analytics V2 -- pre-calculated summaries: daily/monthly/fiscal-year
 * summaries, category trends, transfer flows, merchant intelligence, net worth
 * snapshots, investment holdings and cohort spending.
 */

import { apiClient } from './client'
import { getWrapped } from './analyticsV2Request'

// Types -- these match the actual JSON shapes returned by the backend API

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
  /** Gross funding from non-investment accounts; excludes internal rebalancing. */
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

export const summariesApi = {
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
  //
  // `offset` is NOT declared by the handler (`summaries.py::get_monthly_summaries`
  // takes start_period / end_period / limit) and FastAPI discards a param it does
  // not declare -- no 422, no warning, HTTP 200 with the value dropped. Paging by
  // `offset` here looked like paging and returned page one every time. Same class
  // of dead param as `sort`/`sort_order` on `/api/transactions`, guarded by
  // `services/api/__tests__/analyticsParamContract.test.ts`.
  getMonthlySummaries(params?: { limit?: number }) {
    return getWrapped<MonthlySummary>('/api/analytics/v2/monthly-summaries', params)
  },

  // Category Trends
  //
  // The handler declares category / transaction_type / start_period / end_period
  // / limit. `subcategory` and `offset` were both silently dropped -- so a
  // subcategory-filtered read answered with every subcategory in the category.
  getCategoryTrends(params?: { category?: string; limit?: number }) {
    return getWrapped<CategoryTrend>('/api/analytics/v2/category-trends', params)
  },

  // Transfer Flows
  //
  // The handler declares only min_amount / min_count -- no paging at all, so
  // both `limit` and `offset` were dropped and the response was always the full
  // flow list.
  getTransferFlows() {
    return getWrapped<TransferFlow>('/api/analytics/v2/transfer-flows')
  },

  // Merchant Intelligence
  //
  // The handler declares min_transactions / recurring_only / label_kind / limit.
  // `offset` was dropped.
  getMerchantIntelligence(params?: {
    min_transactions?: number
    recurring_only?: boolean
    limit?: number
  }) {
    return getWrapped<MerchantIntelligence>('/api/analytics/v2/merchant-intelligence', params)
  },

  // Net Worth
  //
  // The handler declares only `limit`. `offset` was dropped.
  getNetWorthSnapshots(params?: { limit?: number }) {
    return getWrapped<NetWorthSnapshot>('/api/analytics/v2/net-worth', params)
  },

  // Fiscal Year Summaries
  //
  // The handler declares NO query params -- it returns every fiscal year. Both
  // `limit` and `offset` were dropped.
  getFYSummaries() {
    return getWrapped<FYSummary>('/api/analytics/v2/fy-summaries')
  },
}
