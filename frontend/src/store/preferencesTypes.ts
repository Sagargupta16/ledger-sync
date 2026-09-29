/**
 * Preferences store types: the display preferences, the income
 * classification partition, and the full store state + actions.
 *
 * Re-exported by `@/store/preferencesStore`, the public import path; import
 * from there rather than from this module.
 */

import type { SalaryComponents, RsuGrant, GrowthAssumptions } from '@/types/salary'

export interface DisplayPreferences {
  numberFormat: 'indian' | 'international'
  currencySymbol: string
  currencySymbolPosition: 'before' | 'after'
  defaultTimeRange: string
}

// Income classification by tax treatment
export interface IncomeClassification {
  taxable: string[]
  investmentReturns: string[]
  nonTaxable: string[]
  other: string[]
}

export interface PreferencesState {
  // Display preferences (for formatters)
  displayPreferences: DisplayPreferences

  // Multi-currency display
  displayCurrency: string
  exchangeRate: number | null
  exchangeRateUpdatedAt: string | null

  // Fiscal year
  fiscalYearStartMonth: number

  // Essential categories
  essentialCategories: string[]

  // Income classification (by tax treatment)
  incomeClassification: IncomeClassification

  // Investment account mappings (account name -> investment type)
  investmentAccountMappings: Record<string, string>

  // Spending rule targets (Needs/Wants/Savings)
  needsTargetPercent: number
  wantsTargetPercent: number
  savingsTargetPercent: number

  // Credit card limits (card name -> limit amount)
  creditCardLimits: Record<string, number>

  // Earning start date
  earningStartDate: string | null
  useEarningStartDate: boolean

  // Salary & Tax Projections
  salaryStructure: Record<string, SalaryComponents>
  rsuGrants: RsuGrant[]
  growthAssumptions: GrowthAssumptions

  // Actions
  setSalaryStructure: (structure: Record<string, SalaryComponents>) => void
  setRsuGrants: (grants: RsuGrant[]) => void
  setGrowthAssumptions: (assumptions: GrowthAssumptions) => void
  setDisplayPreferences: (prefs: Partial<DisplayPreferences>) => void
  setDisplayCurrency: (code: string) => void
  setExchangeRate: (rate: number, updatedAt: string) => void
  setFiscalYearStartMonth: (month: number) => void
  setEssentialCategories: (categories: string[]) => void
  setIncomeClassification: (classification: IncomeClassification) => void
  setInvestmentAccountMappings: (mappings: Record<string, string>) => void
  /** Reset all user-scoped preferences to defaults (called on logout). */
  reset: () => void
  hydrateFromApi: (apiPrefs: {
    number_format: 'indian' | 'international'
    currency_symbol: string
    currency_symbol_position: 'before' | 'after'
    default_time_range: string
    display_currency: string
    fiscal_year_start_month: number
    essential_categories: string[]
    taxable_income_categories: string[]
    investment_returns_categories: string[]
    non_taxable_income_categories: string[]
    other_income_categories: string[]
    investment_account_mappings: Record<string, string>
    needs_target_percent: number
    wants_target_percent: number
    savings_target_percent: number
    credit_card_limits: Record<string, number>
    earning_start_date: string | null
    use_earning_start_date: boolean
    salary_structure: Record<string, SalaryComponents>
    rsu_grants: RsuGrant[]
    growth_assumptions: GrowthAssumptions
  }) => void
}
