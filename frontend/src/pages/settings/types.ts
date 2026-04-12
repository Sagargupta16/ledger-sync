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
  Cash: 'from-app-green to-app-green',
  'Bank Accounts': 'from-app-blue to-app-teal',
  'Credit Cards': 'from-app-orange to-app-red',
  Investments: 'from-app-purple to-app-pink',
  Loans: 'from-app-red to-app-orange',
  'Other Wallets': 'from-app-indigo to-app-blue',
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
  { value: 'stocks', label: 'Stocks', color: 'from-app-blue to-app-blue' },
  { value: 'mutual_funds', label: 'Mutual Funds', color: 'from-app-purple to-app-purple' },
  { value: 'fixed_deposits', label: 'Fixed Deposits', color: 'from-app-orange to-app-orange' },
  { value: 'ppf_epf', label: 'PPF/EPF', color: 'from-app-green to-app-green' },
  { value: 'real_estate', label: 'Real Estate', color: 'from-app-pink to-app-pink' },
  { value: 'gold', label: 'Gold', color: 'from-app-yellow to-app-yellow' },
  { value: 'crypto', label: 'Crypto', color: 'from-app-orange to-app-orange' },
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
    value: 'taxable' as const,
    label: '💰 Taxable Income',
    color: 'from-app-red to-app-orange',
    description: 'Salary, bonus, freelance income',
  },
  {
    value: 'investment' as const,
    label: '📈 Investment Returns',
    color: 'from-app-green to-app-green',
    description: 'Dividends, interest, capital gains',
  },
  {
    value: 'non_taxable' as const,
    label: '💳 Cashbacks',
    color: 'from-app-blue to-app-teal',
    description: 'Refunds, cashbacks, rewards',
  },
  {
    value: 'other' as const,
    label: '📦 Others',
    color: 'from-app-purple to-app-pink',
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
