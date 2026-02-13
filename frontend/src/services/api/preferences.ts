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

// Helper to create section-specific updaters
function createSectionUpdater<T>(endpoint: string) {
  return async (config: T): Promise<UserPreferences> => {
    const response = await apiClient.put<UserPreferences>(`/preferences/${endpoint}`, config)
    return response.data
  }
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
  updateFiscalYear: createSectionUpdater<FiscalYearConfig>('fiscal-year'),
  updateEssentialCategories: createSectionUpdater<EssentialCategoriesConfig>('essential-categories'),
  updateInvestmentMappings: createSectionUpdater<InvestmentMappingsConfig>('investment-mappings'),
  updateIncomeSources: createSectionUpdater<IncomeSourcesConfig>('income-sources'),
  updateBudgetDefaults: createSectionUpdater<BudgetDefaultsConfig>('budget-defaults'),
  updateDisplayPreferences: createSectionUpdater<DisplayPreferencesConfig>('display'),
  updateAnomalySettings: createSectionUpdater<AnomalySettingsConfig>('anomaly-settings'),
  updateRecurringSettings: createSectionUpdater<RecurringSettingsConfig>('recurring-settings'),
  updateSpendingRule: createSectionUpdater<SpendingRuleConfig>('spending-rule'),
  updateCreditCardLimits: createSectionUpdater<CreditCardLimitsConfig>('credit-card-limits'),
  updateEarningStartDate: createSectionUpdater<EarningStartDateConfig>('earning-start-date'),
}
