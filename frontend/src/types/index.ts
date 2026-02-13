// Base API response wrapper
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

// Upload response
export interface UploadStats {
  processed?: number
  inserted: number
  updated: number
  deleted: number
  unchanged: number
}

export interface UploadResponse {
  success: boolean
  message: string
  stats: UploadStats
  file_name: string
}

// Transaction types
export interface Transaction {
  id: string
  date: string
  amount: number
  currency?: string
  type: 'Income' | 'Expense' | 'Transfer' | 'Transfer-In' | 'Transfer-Out'
  category: string
  subcategory?: string
  account: string
  from_account?: string
  to_account?: string
  note?: string
  bucket?: string
  source_file?: string
  last_seen_at?: string
  is_transfer?: boolean
}

export interface TransactionsResponse {
  transactions: Transaction[]
  total: number
  page: number
  limit: number
}

// Meta types
export interface Account {
  id: string
  name: string
  type?: string
}

export interface Category {
  id: string
  name: string
}

export interface Filter {
  types: string[]
  categories: string[]
  accounts: string[]
}

// Analytics types
export interface KPIs {
  total_income: number
  total_expenses: number
  net_savings: number
  savings_rate: number
  top_expense_category: string
  biggest_expense: number
  average_daily_spending: number
}

// Account type classification
export type AccountType = 'investment' | 'deposit' | 'loan'

export interface AccountClassification {
  accountId: string
  accountName: string
  types: AccountType[]
}

// Time range for analytics
// Values must match backend TimeRange enum (ledger_sync.core.time_filter)
export type TimeRange =
  | 'all_time'
  | 'this_month'
  | 'last_month'
  | 'last_3_months'
  | 'last_6_months'
  | 'last_12_months'
  | 'this_year'
  | 'last_year'
  | 'last_decade'

// Authentication types
export interface User {
  id: number
  email: string
  full_name: string | null
  is_active: boolean
  is_verified: boolean
  created_at: string
  last_login: string | null
}

export interface AuthTokens {
  access_token: string
  refresh_token: string
  token_type: string
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterCredentials {
  email: string
  password: string
  full_name?: string
}

// Analytics response types
export interface OverviewResponse {
  total_income: number
  total_expenses: number
  net_change: number
  best_month: { month: string; surplus: number } | null
  worst_month: { month: string; surplus: number } | null
  asset_allocation: Array<{ account: string; balance: number }>
  transaction_count: number
}

export interface KPIsResponse {
  savings_rate: number
  daily_spending_rate: number
  monthly_burn_rate: number
  spending_velocity: number
  category_concentration: number
  consistency_score: number
  lifestyle_inflation: number
  convenience_spending_pct: number
}

export interface TotalsResponse {
  total_income: number
  total_expenses: number
  net_savings: number
  savings_rate: number
  transaction_count: number
}

export interface MonthlyAggregation {
  [monthKey: string]: {
    income: number
    expense: number
    net_savings: number
    transactions: number
  }
}

export interface CategoryBreakdownResponse {
  categories: Record<string, {
    total: number
    count: number
    percentage: number
    subcategories: Record<string, number>
  }>
  total: number
}

export interface AccountBalancesResponse {
  accounts: Record<string, {
    balance: number
    transactions: number
    last_transaction: string | null
  }>
  statistics: {
    total_accounts: number
    total_balance: number
    average_balance: number
    positive_accounts: number
    negative_accounts: number
  }
}

export interface ChartDataResponse {
  data: Array<Record<string, string | number>>
}

export interface BehaviorResponse {
  avg_transaction_size: number
  spending_frequency: number
  convenience_spending_pct: number
  lifestyle_inflation: number
  top_categories: Array<{ category: string; amount: number }>
}

export interface TrendsResponse {
  monthly_trends: Array<{
    month: string
    income: number
    expenses: number
    surplus: number
  }>
  surplus_trend: Array<{ month: string; surplus: number }>
  consistency_score: number
}
