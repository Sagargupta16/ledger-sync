// Base API response wrapper
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

// Upload response
export interface UploadStats {
  inserted: number
  updated: number
  deleted: number
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
  type: 'Income' | 'Expense' | 'Transfer'
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
export type TimeRange =
  | 'all_time'
  | 'current_month'
  | 'last_month'
  | 'last_3_months'
  | 'last_6_months'
  | 'last_12_months'
  | 'current_year'
  | 'last_year'
