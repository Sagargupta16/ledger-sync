/**
 * Preferences Store
 *
 * Zustand store for user preferences that need to be accessed
 * synchronously across the app (e.g., for formatting).
 *
 * This store is hydrated from the API on app load and updated
 * when the user changes settings.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface DisplayPreferences {
  numberFormat: 'indian' | 'international'
  currencySymbol: string
  currencySymbolPosition: 'before' | 'after'
  defaultTimeRange: string
}

// Income categories mapped by category -> subcategories
export interface IncomeCategories {
  salary: Record<string, string[]>
  bonus: Record<string, string[]>
  investmentIncome: Record<string, string[]>
  cashback: Record<string, string[]>
}

export interface PreferencesState {
  // Display preferences (for formatters)
  displayPreferences: DisplayPreferences

  // Fiscal year
  fiscalYearStartMonth: number

  // Essential categories
  essentialCategories: string[]

  // Income categories
  incomeCategories: IncomeCategories

  // Investment account mappings (account name -> investment type)
  investmentAccountMappings: Record<string, string>

  // Actions
  setDisplayPreferences: (prefs: Partial<DisplayPreferences>) => void
  setFiscalYearStartMonth: (month: number) => void
  setEssentialCategories: (categories: string[]) => void
  setIncomeCategories: (categories: IncomeCategories) => void
  setInvestmentAccountMappings: (mappings: Record<string, string>) => void
  hydrateFromApi: (apiPrefs: {
    number_format: 'indian' | 'international'
    currency_symbol: string
    currency_symbol_position: 'before' | 'after'
    default_time_range: string
    fiscal_year_start_month: number
    essential_categories: string[]
    salary_categories: Record<string, string[]>
    bonus_categories: Record<string, string[]>
    investment_income_categories: Record<string, string[]>
    cashback_categories: Record<string, string[]>
    investment_account_mappings: Record<string, string>
  }) => void
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      // Default display preferences
      displayPreferences: {
        numberFormat: 'indian',
        currencySymbol: '₹',
        currencySymbolPosition: 'before',
        defaultTimeRange: 'last_12_months',
      },

      fiscalYearStartMonth: 4,
      essentialCategories: [
        'Housing',
        'Healthcare',
        'Transportation',
        'Food & Dining',
        'Education',
        'Family',
        'Utilities',
      ],

      // Default income categories
      incomeCategories: {
        salary: {},
        bonus: {},
        investmentIncome: {},
        cashback: {},
      },

      // Default investment mappings
      investmentAccountMappings: {},

      // Actions
      setDisplayPreferences: (prefs) =>
        set((state) => ({
          displayPreferences: { ...state.displayPreferences, ...prefs },
        })),

      setFiscalYearStartMonth: (month) =>
        set({ fiscalYearStartMonth: month }),

      setEssentialCategories: (categories) =>
        set({ essentialCategories: categories }),

      setIncomeCategories: (categories) =>
        set({ incomeCategories: categories }),

      setInvestmentAccountMappings: (mappings) =>
        set({ investmentAccountMappings: mappings }),

      // Hydrate from API response
      hydrateFromApi: (apiPrefs) =>
        set({
          displayPreferences: {
            numberFormat: apiPrefs.number_format,
            currencySymbol: apiPrefs.currency_symbol,
            currencySymbolPosition: apiPrefs.currency_symbol_position,
            defaultTimeRange: apiPrefs.default_time_range,
          },
          fiscalYearStartMonth: apiPrefs.fiscal_year_start_month,
          essentialCategories: apiPrefs.essential_categories,
          incomeCategories: {
            salary: apiPrefs.salary_categories || {},
            bonus: apiPrefs.bonus_categories || {},
            investmentIncome: apiPrefs.investment_income_categories || {},
            cashback: apiPrefs.cashback_categories || {},
          },
          investmentAccountMappings: apiPrefs.investment_account_mappings || {},
        }),
    }),
    {
      name: 'ledger-sync-preferences',
      partialize: (state) => ({
        displayPreferences: state.displayPreferences,
        fiscalYearStartMonth: state.fiscalYearStartMonth,
        essentialCategories: state.essentialCategories,
        incomeCategories: state.incomeCategories,
        investmentAccountMappings: state.investmentAccountMappings,
      }),
    }
  )
)

// Selectors for convenience
export const selectNumberFormat = (state: PreferencesState) =>
  state.displayPreferences.numberFormat

export const selectCurrencySymbol = (state: PreferencesState) =>
  state.displayPreferences.currencySymbol

export const selectCurrencyPosition = (state: PreferencesState) =>
  state.displayPreferences.currencySymbolPosition

export const selectIncomeCategories = (state: PreferencesState) =>
  state.incomeCategories

export const selectInvestmentMappings = (state: PreferencesState) =>
  state.investmentAccountMappings

export const selectEssentialCategories = (state: PreferencesState) =>
  state.essentialCategories

export const selectFiscalYearStartMonth = (state: PreferencesState) =>
  state.fiscalYearStartMonth
