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
  /** Only populated when type is 'Transfer', 'Transfer-In', or 'Transfer-Out' */
  from_account?: string
  /** Only populated when type is 'Transfer', 'Transfer-In', or 'Transfer-Out' */
  to_account?: string
  note?: string
  bucket?: string
  source_file?: string
  last_seen_at?: string
  is_transfer?: boolean
  /** Optional: /all omits real values and demo fixtures may lack it */
  tags?: string[]
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

/**
 * Local heuristic account-type slugs, re-exported from their single declaration
 * in `@/constants/accountTypes` -- the module that owns `inferAccountType`.
 *
 * This file used to DECLARE a competing `'investment' | 'deposit' | 'loan'`
 * union. It was a strict subset (no `'credit_card'`) and nominally distinct, so
 * `inferAccountType()`'s return value was NOT assignable to it:
 *   Type '.../constants/accountTypes").AccountType[]' is not assignable to type
 *   '.../types/index").AccountType[]'.
 *
 * Note this is the CLIENT-side slug vocabulary, not the wire vocabulary. Backend
 * `AccountType` enum VALUES ('Cash', 'Bank Accounts', 'Credit Cards', ...) live
 * in `ACCOUNT_TYPE_VALUES` / `AccountTypeValue` in
 * `@/services/api/accountClassifications`. Use that one for anything that
 * compares against, or sends, an API value.
 */
export type { AccountType } from '@/constants/accountTypes'

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
  auth_provider: string | null
  created_at: string
  last_login: string | null
}

export interface AuthTokens {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in?: number
}

// OAuth types
export interface OAuthProviderConfig {
  provider: string
  client_id: string
  authorize_url: string
  scope: string
  redirect_uri: string
  state: string
}

export interface OAuthCallbackRequest {
  code: string
  state?: string
}

export interface MonthlyAggregation {
  [monthKey: string]: {
    income: number
    expense: number
    net_savings: number
    transactions: number
  }
}

/**
 * `GET /api/calculations/account-balances`, matching `_compute_account_statistics`
 * in `backend/src/ledger_sync/api/calculations_helpers.py` key for key. The five
 * summary numbers are NESTED under `statistics`; anything that flattens them
 * reads `undefined` at runtime. `services/api/calculations.ts` aliases this as
 * `AccountBalances`, so this is the single definition of the wire shape.
 */
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
