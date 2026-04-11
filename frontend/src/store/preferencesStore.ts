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
import { CURRENCIES, BASE_CURRENCY, getCurrencyMeta } from '@/constants/currencies'
import type { SalaryComponents, RsuGrant, GrowthAssumptions } from '@/types/salary'
import { DEFAULT_GROWTH_ASSUMPTIONS } from '@/types/salary'

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

      displayCurrency: BASE_CURRENCY,
      exchangeRate: null,
      exchangeRateUpdatedAt: null,

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

      // Default salary & tax projections
      salaryStructure: {},
      rsuGrants: [],
      growthAssumptions: { ...DEFAULT_GROWTH_ASSUMPTIONS },

      // Actions
      setDisplayPreferences: (prefs) =>
        set((state) => ({
          displayPreferences: { ...state.displayPreferences, ...prefs },
        })),

      setDisplayCurrency: (code) => {
        const meta = getCurrencyMeta(code)
        set({
          displayCurrency: code,
          displayPreferences: {
            numberFormat: meta.numberFormat,
            currencySymbol: meta.symbol,
            currencySymbolPosition: meta.symbolPosition,
            defaultTimeRange: usePreferencesStore.getState().displayPreferences.defaultTimeRange,
          },
          ...(code === BASE_CURRENCY ? { exchangeRate: null, exchangeRateUpdatedAt: null } : {}),
        })
      },

      setExchangeRate: (rate, updatedAt) =>
        set({ exchangeRate: rate, exchangeRateUpdatedAt: updatedAt }),

      setFiscalYearStartMonth: (month) =>
        set({ fiscalYearStartMonth: month }),

      setEssentialCategories: (categories) =>
        set({ essentialCategories: categories }),

      setIncomeClassification: (classification) =>
        set({ incomeClassification: classification }),

      setInvestmentAccountMappings: (mappings) =>
        set({ investmentAccountMappings: mappings }),

      setSalaryStructure: (structure) => set({ salaryStructure: structure }),
      setRsuGrants: (grants) => set({ rsuGrants: grants }),
      setGrowthAssumptions: (assumptions) => set({ growthAssumptions: assumptions }),

      // Hydrate from API response (with validation)
      hydrateFromApi: (apiPrefs) => {
        if (!apiPrefs || typeof apiPrefs !== 'object') return

        const ensureArray = (v: unknown): string[] => Array.isArray(v) ? v : []
        const fySm = Number(apiPrefs.fiscal_year_start_month)
        const clampPercent = (v: unknown, fallback: number) => {
          const n = Number(v)
          return Number.isFinite(n) && n >= 0 && n <= 100 ? n : fallback
        }

        set({
          displayPreferences: {
            numberFormat: apiPrefs.number_format === 'international' ? 'international' : 'indian',
            currencySymbol: typeof apiPrefs.currency_symbol === 'string' ? apiPrefs.currency_symbol : '₹',
            currencySymbolPosition: apiPrefs.currency_symbol_position === 'after' ? 'after' : 'before',
            defaultTimeRange: typeof apiPrefs.default_time_range === 'string' ? apiPrefs.default_time_range : 'all_time',
          },
          displayCurrency: typeof apiPrefs.display_currency === 'string' && apiPrefs.display_currency in CURRENCIES
            ? apiPrefs.display_currency : BASE_CURRENCY,
          fiscalYearStartMonth: fySm >= 1 && fySm <= 12 ? fySm : 4,
          essentialCategories: ensureArray(apiPrefs.essential_categories),
          incomeClassification: {
            taxable: ensureArray(apiPrefs.taxable_income_categories),
            investmentReturns: ensureArray(apiPrefs.investment_returns_categories),
            nonTaxable: ensureArray(apiPrefs.non_taxable_income_categories),
            other: ensureArray(apiPrefs.other_income_categories),
          },
          investmentAccountMappings: apiPrefs.investment_account_mappings && typeof apiPrefs.investment_account_mappings === 'object'
            ? apiPrefs.investment_account_mappings : {},
          needsTargetPercent: clampPercent(apiPrefs.needs_target_percent, 50),
          wantsTargetPercent: clampPercent(apiPrefs.wants_target_percent, 30),
          savingsTargetPercent: clampPercent(apiPrefs.savings_target_percent, 20),
          creditCardLimits: apiPrefs.credit_card_limits && typeof apiPrefs.credit_card_limits === 'object'
            ? apiPrefs.credit_card_limits : {},
          earningStartDate: typeof apiPrefs.earning_start_date === 'string' ? apiPrefs.earning_start_date : null,
          useEarningStartDate: apiPrefs.use_earning_start_date === true,
          salaryStructure:
            apiPrefs.salary_structure && typeof apiPrefs.salary_structure === 'object'
              ? apiPrefs.salary_structure
              : {},
          rsuGrants: Array.isArray(apiPrefs.rsu_grants) ? apiPrefs.rsu_grants : [],
          growthAssumptions:
            apiPrefs.growth_assumptions && typeof apiPrefs.growth_assumptions === 'object'
              ? { ...DEFAULT_GROWTH_ASSUMPTIONS, ...apiPrefs.growth_assumptions }
              : { ...DEFAULT_GROWTH_ASSUMPTIONS },
        })
      },
    }),
    {
      name: 'ledger-sync-preferences',
      partialize: (state) => ({
        displayPreferences: state.displayPreferences,
        displayCurrency: state.displayCurrency,
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
        salaryStructure: state.salaryStructure,
        rsuGrants: state.rsuGrants,
        growthAssumptions: state.growthAssumptions,
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

// Individual selectors for spending targets to avoid creating new objects on every call.
// Use these separately or combine with useShallow from zustand/react/shallow.
export const selectNeedsTargetPercent = (state: PreferencesState) =>
  state.needsTargetPercent
export const selectWantsTargetPercent = (state: PreferencesState) =>
  state.wantsTargetPercent
export const selectSavingsTargetPercent = (state: PreferencesState) =>
  state.savingsTargetPercent

export const selectCreditCardLimits = (state: PreferencesState) =>
  state.creditCardLimits

export const selectEarningStartDate = (state: PreferencesState) =>
  state.earningStartDate

export const selectUseEarningStartDate = (state: PreferencesState) =>
  state.useEarningStartDate

export const selectDisplayCurrency = (state: PreferencesState) =>
  state.displayCurrency

export const selectExchangeRate = (state: PreferencesState) =>
  state.exchangeRate

export const selectSalaryStructure = (state: PreferencesState) => state.salaryStructure
export const selectRsuGrants = (state: PreferencesState) => state.rsuGrants
export const selectGrowthAssumptions = (state: PreferencesState) => state.growthAssumptions
