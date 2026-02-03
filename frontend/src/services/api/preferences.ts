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

  // 4. Income Sources
  salary_categories: Record<string, string[]>
  bonus_categories: Record<string, string[]>
  investment_income_categories: Record<string, string[]>
  cashback_categories: Record<string, string[]>

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
  salary_categories: Record<string, string[]>
  bonus_categories: Record<string, string[]>
  investment_income_categories: Record<string, string[]>
  cashback_categories: Record<string, string[]>
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
}
