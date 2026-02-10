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

  // Actions
  setDisplayPreferences: (prefs: Partial<DisplayPreferences>) => void
  setFiscalYearStartMonth: (month: number) => void
  setEssentialCategories: (categories: string[]) => void
  setIncomeClassification: (classification: IncomeClassification) => void
  setInvestmentAccountMappings: (mappings: Record<string, string>) => void
  hydrateFromApi: (apiPrefs: {
    number_format: 'indian' | 'international'
    currency_symbol: string
    currency_symbol_position: 'before' | 'after'
    default_time_range: string
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
        defaultTimeRange: 'all_time',
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

      // Default income classification (by tax treatment)
      // Stored as "Category::Subcategory" format
      incomeClassification: {
        taxable: [
          'Employment Income::Salary',
          'Employment Income::Stipend',
          'Employment Income::Bonuses',
          'Employment Income::RSUs',
          'Business/Self Employment Income::Gig Work Income',
        ],
        investmentReturns: [
          'Investment Income::Dividends',
          'Investment Income::Interest',
          'Investment Income::F&O Income',
          'Investment Income::Stock Market Profits',
        ],
        nonTaxable: [
          'Refund & Cashbacks::Credit Card Cashbacks',
          'Refund & Cashbacks::Other Cashbacks',
          'Refund & Cashbacks::Product/Service Refunds',
          'Refund & Cashbacks::Deposits Return',
          'Employment Income::Expense Reimbursement',
        ],
        other: [
          'One-time Income::Gifts',
          'One-time Income::Pocket Money',
          'One-time Income::Competition/Contest Prizes',
          'Employment Income::EPF Contribution',
          'Other::Other',
        ],
      },

      // Default investment mappings
      investmentAccountMappings: {},

      // Default spending rule targets (50/30/20)
      needsTargetPercent: 50,
      wantsTargetPercent: 30,
      savingsTargetPercent: 20,

      // Default credit card limits
      creditCardLimits: {},

      // Default earning start date
      earningStartDate: null,
      useEarningStartDate: false,

      // Actions
      setDisplayPreferences: (prefs) =>
        set((state) => ({
          displayPreferences: { ...state.displayPreferences, ...prefs },
        })),

      setFiscalYearStartMonth: (month) =>
        set({ fiscalYearStartMonth: month }),

      setEssentialCategories: (categories) =>
        set({ essentialCategories: categories }),

      setIncomeClassification: (classification) =>
        set({ incomeClassification: classification }),

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
          incomeClassification: {
            taxable: apiPrefs.taxable_income_categories || [],
            investmentReturns: apiPrefs.investment_returns_categories || [],
            nonTaxable: apiPrefs.non_taxable_income_categories || [],
            other: apiPrefs.other_income_categories || [],
          },
          investmentAccountMappings: apiPrefs.investment_account_mappings || {},
          needsTargetPercent: apiPrefs.needs_target_percent ?? 50,
          wantsTargetPercent: apiPrefs.wants_target_percent ?? 30,
          savingsTargetPercent: apiPrefs.savings_target_percent ?? 20,
          creditCardLimits: apiPrefs.credit_card_limits || {},
          earningStartDate: apiPrefs.earning_start_date ?? null,
          useEarningStartDate: apiPrefs.use_earning_start_date ?? false,
        }),
    }),
    {
      name: 'ledger-sync-preferences',
      partialize: (state) => ({
        displayPreferences: state.displayPreferences,
        fiscalYearStartMonth: state.fiscalYearStartMonth,
        essentialCategories: state.essentialCategories,
        incomeClassification: state.incomeClassification,
        investmentAccountMappings: state.investmentAccountMappings,
        needsTargetPercent: state.needsTargetPercent,
        wantsTargetPercent: state.wantsTargetPercent,
        savingsTargetPercent: state.savingsTargetPercent,
        creditCardLimits: state.creditCardLimits,
        earningStartDate: state.earningStartDate,
        useEarningStartDate: state.useEarningStartDate,
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

export const selectIncomeClassification = (state: PreferencesState) =>
  state.incomeClassification

export const selectInvestmentMappings = (state: PreferencesState) =>
  state.investmentAccountMappings

export const selectEssentialCategories = (state: PreferencesState) =>
  state.essentialCategories

export const selectFiscalYearStartMonth = (state: PreferencesState) =>
  state.fiscalYearStartMonth

export const selectSpendingTargets = (state: PreferencesState) => ({
  needsTargetPercent: state.needsTargetPercent,
  wantsTargetPercent: state.wantsTargetPercent,
  savingsTargetPercent: state.savingsTargetPercent,
})

export const selectCreditCardLimits = (state: PreferencesState) =>
  state.creditCardLimits

export const selectEarningStartDate = (state: PreferencesState) =>
  state.earningStartDate

export const selectUseEarningStartDate = (state: PreferencesState) =>
  state.useEarningStartDate
