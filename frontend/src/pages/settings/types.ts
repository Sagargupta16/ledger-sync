/**
 * Shared types and constants for the Settings page tabs.
 */

// Local preferences shape used across all settings tabs
export interface LocalPrefs {
  fiscal_year_start_month: number
  essential_categories: string[]
  investment_account_mappings: Record<string, string>
  taxable_income_categories: string[]
  investment_returns_categories: string[]
  non_taxable_income_categories: string[]
  other_income_categories: string[]
  default_budget_alert_threshold: number
  auto_create_budgets: boolean
  budget_rollover_enabled: boolean
  number_format: 'indian' | 'international'
  currency_symbol: string
  currency_symbol_position: 'before' | 'after'
  default_time_range: string
  anomaly_expense_threshold: number
  anomaly_types_enabled: string[]
  auto_dismiss_recurring_anomalies: boolean
  recurring_min_confidence: number
  recurring_auto_confirm_occurrences: number
}

// Typed key for updating local prefs generically
export type LocalPrefKey = keyof LocalPrefs

// Account classification types
export const ACCOUNT_TYPES = [
  'Cash',
  'Bank Accounts',
  'Credit Cards',
  'Investments',
  'Loans/Lended',
  'Other Wallets',
]

export const CATEGORY_COLORS: Record<string, string> = {
  Cash: 'from-green-500 to-emerald-600',
  'Bank Accounts': 'from-blue-500 to-cyan-600',
  'Credit Cards': 'from-orange-500 to-red-600',
  Investments: 'from-purple-500 to-pink-600',
  Loans: 'from-red-500 to-orange-600',
  'Other Wallets': 'from-indigo-500 to-blue-600',
}

// Month names for fiscal year dropdown
export const MONTHS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
]

// Investment types
export const INVESTMENT_TYPES = [
  { value: 'stocks', label: 'Stocks', color: 'from-blue-500 to-blue-600' },
  { value: 'mutual_funds', label: 'Mutual Funds', color: 'from-purple-500 to-purple-600' },
  { value: 'fixed_deposits', label: 'Fixed Deposits', color: 'from-amber-500 to-amber-600' },
  { value: 'ppf_epf', label: 'PPF/EPF', color: 'from-green-500 to-green-600' },
  { value: 'real_estate', label: 'Real Estate', color: 'from-pink-500 to-pink-600' },
  { value: 'gold', label: 'Gold', color: 'from-yellow-500 to-yellow-600' },
  { value: 'crypto', label: 'Crypto', color: 'from-orange-500 to-orange-600' },
  { value: 'other', label: 'Other', color: 'from-gray-500 to-gray-600' },
]

// Time range options
export const TIME_RANGE_OPTIONS = [
  { value: 'last_3_months', label: 'Last 3 Months' },
  { value: 'last_6_months', label: 'Last 6 Months' },
  { value: 'last_12_months', label: 'Last 12 Months' },
  { value: 'current_fy', label: 'Current Fiscal Year' },
  { value: 'all_time', label: 'All Time' },
]

// Anomaly types
export const ANOMALY_TYPES = [
  { value: 'high_expense', label: 'High Expense Months' },
  { value: 'unusual_category', label: 'Unusual Category Spending' },
  { value: 'large_transfer', label: 'Large Transfers' },
  { value: 'budget_exceeded', label: 'Budget Exceeded' },
]

// Income classification types
export const INCOME_CLASSIFICATION_TYPES = [
  {
    value: 'taxable',
    label: '💰 Taxable Income',
    color: 'from-red-500 to-orange-600',
    description: 'Salary, bonus, freelance income',
  },
  {
    value: 'investment',
    label: '📈 Investment Returns',
    color: 'from-green-500 to-emerald-600',
    description: 'Dividends, interest, capital gains',
  },
  {
    value: 'non_taxable',
    label: '💳 Cashbacks',
    color: 'from-blue-500 to-cyan-600',
    description: 'Refunds, cashbacks, rewards',
  },
  {
    value: 'other',
    label: '📦 Others',
    color: 'from-purple-500 to-pink-600',
    description: 'Gifts, prizes, miscellaneous',
  },
]

// Income classification type mapping
export type IncomeClassificationType = 'taxable' | 'investment' | 'non_taxable' | 'other'

export const INCOME_CLASSIFICATION_KEY_MAP: Record<
  IncomeClassificationType,
  | 'taxable_income_categories'
  | 'investment_returns_categories'
  | 'non_taxable_income_categories'
  | 'other_income_categories'
> = {
  taxable: 'taxable_income_categories',
  investment: 'investment_returns_categories',
  non_taxable: 'non_taxable_income_categories',
  other: 'other_income_categories',
}
