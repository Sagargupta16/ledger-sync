/**
 * Shared types and constants for the Settings page tabs.
 */

import type { UserPreferences } from '@/services/api/preferences'

// Local preferences shape used across all settings tabs
export type LocalPrefs = Omit<UserPreferences, 'id' | 'created_at' | 'updated_at'>

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
  Cash: 'from-ios-green to-ios-green',
  'Bank Accounts': 'from-ios-blue to-ios-teal',
  'Credit Cards': 'from-ios-orange to-ios-red',
  Investments: 'from-ios-purple to-ios-pink',
  Loans: 'from-ios-red to-ios-orange',
  'Other Wallets': 'from-ios-indigo to-ios-blue',
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
  { value: 'stocks', label: 'Stocks', color: 'from-ios-blue to-ios-blue' },
  { value: 'mutual_funds', label: 'Mutual Funds', color: 'from-ios-purple to-ios-purple' },
  { value: 'fixed_deposits', label: 'Fixed Deposits', color: 'from-ios-orange to-ios-orange' },
  { value: 'ppf_epf', label: 'PPF/EPF', color: 'from-ios-green to-ios-green' },
  { value: 'real_estate', label: 'Real Estate', color: 'from-ios-pink to-ios-pink' },
  { value: 'gold', label: 'Gold', color: 'from-ios-yellow to-ios-yellow' },
  { value: 'crypto', label: 'Crypto', color: 'from-ios-orange to-ios-orange' },
  { value: 'other', label: 'Other', color: 'from-muted-foreground to-text-tertiary' },
]

// Time range options (aligned with AnalyticsViewMode)
export const TIME_RANGE_OPTIONS = [
  { value: 'all_time', label: 'All Time' },
  { value: 'fy', label: 'Financial Year' },
  { value: 'yearly', label: 'Calendar Year' },
  { value: 'monthly', label: 'Monthly' },
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
    color: 'from-ios-red to-ios-orange',
    description: 'Salary, bonus, freelance income',
  },
  {
    value: 'investment',
    label: '📈 Investment Returns',
    color: 'from-ios-green to-ios-green',
    description: 'Dividends, interest, capital gains',
  },
  {
    value: 'non_taxable',
    label: '💳 Cashbacks',
    color: 'from-ios-blue to-ios-teal',
    description: 'Refunds, cashbacks, rewards',
  },
  {
    value: 'other',
    label: '📦 Others',
    color: 'from-ios-purple to-ios-pink',
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
