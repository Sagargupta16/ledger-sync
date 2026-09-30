/**
 * Preferences Store
 *
 * Zustand store for user preferences that need to be accessed
 * synchronously across the app (e.g., for formatting).
 *
 * This store is hydrated from the API on app load and updated
 * when the user changes settings.
 *
 * Types, defaults and API hydration live in sibling modules
 * (`preferencesTypes`, `preferencesDefaults`, `preferencesHydration`) and are
 * re-exported here, so this stays the single import path.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { BASE_CURRENCY, getCurrencyMeta } from '@/constants/currencies'
import { freshDefaults } from './preferencesDefaults'
import { parseApiPreferences } from './preferencesHydration'
import type { PreferencesState } from './preferencesTypes'

export type { DisplayPreferences, IncomeClassification, PreferencesState } from './preferencesTypes'
export {
  resolveEssentialCategories,
  resolveIncomeClassification,
  withIncomeClassificationDefaults,
  type IncomeListPayload,
} from './preferencesHydration'

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      ...freshDefaults(),

      // Actions
      setDisplayPreferences: (prefs) =>
        set((state) => ({
          displayPreferences: { ...state.displayPreferences, ...prefs },
        })),

      setDisplayCurrency: (code) => {
        const meta = getCurrencyMeta(code)
        set((state) => ({
          displayCurrency: code,
          displayPreferences: {
            numberFormat: meta.numberFormat,
            currencySymbol: meta.symbol,
            currencySymbolPosition: meta.symbolPosition,
            defaultTimeRange: state.displayPreferences.defaultTimeRange,
          },
          // A held rate belongs to the currency it was fetched for. Kept across a
          // switch between two foreign currencies, the first frame showed the new
          // symbol at the old rate until useExchangeRate's effect ran; cleared,
          // the formatters render honest base-currency figures for that frame.
          // Re-selecting the current foreign currency keeps its rate, because the
          // effect would not re-run to restore it.
          ...(code === BASE_CURRENCY || code !== state.displayCurrency
            ? { exchangeRate: null, exchangeRateUpdatedAt: null }
            : {}),
        }))
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

      reset: () => set(freshDefaults()),

      setSalaryStructure: (structure) => set({ salaryStructure: structure }),
      setRsuGrants: (grants) => set({ rsuGrants: grants }),
      setGrowthAssumptions: (assumptions) => set({ growthAssumptions: assumptions }),

      // Hydrate from API response (with validation)
      hydrateFromApi: (apiPrefs) => {
        if (!apiPrefs || typeof apiPrefs !== 'object') return
        set(parseApiPreferences(apiPrefs))
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
