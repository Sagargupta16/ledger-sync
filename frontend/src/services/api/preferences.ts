/**
 * User Preferences API Service
 *
 * Handles all user preferences CRUD operations including:
 * - Fiscal year configuration
 * - Essential vs discretionary categories
 * - Investment account mappings
 * - Income source categories
 * - Budget defaults
 * - Display/format preferences
 * - Anomaly detection settings
 * - Recurring transaction settings
 */

import { apiClient } from './client'

// Types
export interface UserPreferences {
  id: number

  // 1. Fiscal Year
  fiscal_year_start_month: number

  // 2. Essential Categories
  essential_categories: string[]

  // 3. Investment Mappings
  investment_account_mappings: Record<string, string>

  // 4. Income Classification (by tax treatment)
  taxable_income_categories: string[]
  investment_returns_categories: string[]
  non_taxable_income_categories: string[]
  other_income_categories: string[]

  // 5. Budget Defaults
  default_budget_alert_threshold: number
  auto_create_budgets: boolean
  budget_rollover_enabled: boolean

  // 6. Display Preferences
  number_format: 'indian' | 'international'
  currency_symbol: string
  currency_symbol_position: 'before' | 'after'
  default_time_range: string

  // 7. Anomaly Settings
  anomaly_expense_threshold: number
  anomaly_types_enabled: string[]
  auto_dismiss_recurring_anomalies: boolean

  // 8. Recurring Settings
  recurring_min_confidence: number
  recurring_auto_confirm_occurrences: number

  // 9. Spending Rule Targets
  needs_target_percent: number
  wants_target_percent: number
  savings_target_percent: number

  // 10. Credit Card Limits
  credit_card_limits: Record<string, number>

  // 11. Earning Start Date
  earning_start_date: string | null
  use_earning_start_date: boolean

  // Metadata
  created_at: string | null
  updated_at: string | null
}

// Partial update type
export type UserPreferencesUpdate = Partial<Omit<UserPreferences, 'id' | 'created_at' | 'updated_at'>>

// Section-specific update types
export interface FiscalYearConfig {
  fiscal_year_start_month: number
}

export interface EssentialCategoriesConfig {
  essential_categories: string[]
}

export interface InvestmentMappingsConfig {
  investment_account_mappings: Record<string, string>
}

export interface IncomeSourcesConfig {
  taxable_income_categories: string[]
  investment_returns_categories: string[]
  non_taxable_income_categories: string[]
  other_income_categories: string[]
}

export interface BudgetDefaultsConfig {
  default_budget_alert_threshold: number
  auto_create_budgets: boolean
  budget_rollover_enabled: boolean
}

export interface DisplayPreferencesConfig {
  number_format: 'indian' | 'international'
  currency_symbol: string
  currency_symbol_position: 'before' | 'after'
  default_time_range: string
}

export interface AnomalySettingsConfig {
  anomaly_expense_threshold: number
  anomaly_types_enabled: string[]
  auto_dismiss_recurring_anomalies: boolean
}

export interface RecurringSettingsConfig {
  recurring_min_confidence: number
  recurring_auto_confirm_occurrences: number
}

export interface SpendingRuleConfig {
  needs_target_percent: number
  wants_target_percent: number
  savings_target_percent: number
}

export interface CreditCardLimitsConfig {
  credit_card_limits: Record<string, number>
}

export interface EarningStartDateConfig {
  earning_start_date: string | null
  use_earning_start_date: boolean
}

// Service
export const preferencesService = {
  /**
   * Get current user preferences
   */
  async getPreferences(): Promise<UserPreferences> {
    const response = await apiClient.get<UserPreferences>('/preferences')
    return response.data
  },

  /**
   * Update user preferences (partial update supported)
   */
  async updatePreferences(updates: UserPreferencesUpdate): Promise<UserPreferences> {
    const response = await apiClient.put<UserPreferences>('/preferences', updates)
    return response.data
  },

  /**
   * Reset all preferences to defaults
   */
  async resetPreferences(): Promise<UserPreferences> {
    const response = await apiClient.post<UserPreferences>('/preferences/reset')
    return response.data
  },

  // Section-specific endpoints for granular updates
  async updateFiscalYear(config: FiscalYearConfig): Promise<UserPreferences> {
    const response = await apiClient.put<UserPreferences>('/preferences/fiscal-year', config)
    return response.data
  },

  async updateEssentialCategories(config: EssentialCategoriesConfig): Promise<UserPreferences> {
    const response = await apiClient.put<UserPreferences>('/preferences/essential-categories', config)
    return response.data
  },

  async updateInvestmentMappings(config: InvestmentMappingsConfig): Promise<UserPreferences> {
    const response = await apiClient.put<UserPreferences>('/preferences/investment-mappings', config)
    return response.data
  },

  async updateIncomeSources(config: IncomeSourcesConfig): Promise<UserPreferences> {
    const response = await apiClient.put<UserPreferences>('/preferences/income-sources', config)
    return response.data
  },

  async updateBudgetDefaults(config: BudgetDefaultsConfig): Promise<UserPreferences> {
    const response = await apiClient.put<UserPreferences>('/preferences/budget-defaults', config)
    return response.data
  },

  async updateDisplayPreferences(config: DisplayPreferencesConfig): Promise<UserPreferences> {
    const response = await apiClient.put<UserPreferences>('/preferences/display', config)
    return response.data
  },

  async updateAnomalySettings(config: AnomalySettingsConfig): Promise<UserPreferences> {
    const response = await apiClient.put<UserPreferences>('/preferences/anomaly-settings', config)
    return response.data
  },

  async updateRecurringSettings(config: RecurringSettingsConfig): Promise<UserPreferences> {
    const response = await apiClient.put<UserPreferences>('/preferences/recurring-settings', config)
    return response.data
  },

  async updateSpendingRule(config: SpendingRuleConfig): Promise<UserPreferences> {
    const response = await apiClient.put<UserPreferences>('/preferences/spending-rule', config)
    return response.data
  },

  async updateCreditCardLimits(config: CreditCardLimitsConfig): Promise<UserPreferences> {
    const response = await apiClient.put<UserPreferences>('/preferences/credit-card-limits', config)
    return response.data
  },

  async updateEarningStartDate(config: EarningStartDateConfig): Promise<UserPreferences> {
    const response = await apiClient.put<UserPreferences>('/preferences/earning-start-date', config)
    return response.data
  },
}
