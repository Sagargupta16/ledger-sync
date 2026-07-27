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

// ─── Hydration helpers (extracted to reduce cognitive complexity) ─────────────

/**
 * Elements are FILTERED to strings, not merely checked for array-ness.
 * `Array.isArray(v) ? v : []` returned `any[]` while promising `string[]`, so a
 * stored `[1, 2]` (these columns are TEXT holding JSON written by an earlier
 * schema) flowed into `classifySpendingType` and `.toLowerCase()` threw on a
 * number. `arrayOrDefault` below then also mis-read a numeric list as
 * "configured" and suppressed the shipped defaults.
 */
function ensureArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((item): item is string => typeof item === 'string') : []
}

/**
 * Resolve a list-valued preference from the API, keeping the shipped default
 * when the server says "not configured".
 *
 * The backend stores these as JSON text whose column default is `"[]"`, and
 * three write paths put that there for a user who has expressed no opinion (the
 * model default, `_get_or_create_preferences`, and `POST /api/preferences/reset`).
 * So an empty array off the wire cannot be distinguished from an untouched row.
 * Overwriting the defaults with it left `essentialCategories` empty, which made
 * `classifySpendingType` in `preferencesUtils` label 100% of spend
 * discretionary -- measured on the owner's 5,015-row expense ledger, essential
 * share went from 70.34% to 0.00%. The backend accessors
 * (`AnalyticsEngineBase._configured_json`) apply the same rule, so the two
 * surfaces now agree.
 *
 * Only for lists where empty has no meaning (essential categories, income
 * classification). `investmentAccountMappings` / `creditCardLimits` /
 * `salaryStructure` keep using the plain `ensure*` helpers because for those,
 * empty is a real state ("I have none of these") whose default is empty anyway.
 */
function arrayOrDefault(v: unknown, fallback: readonly string[]): string[] {
  const parsed = ensureArray(v).filter(Boolean)
  return parsed.length > 0 ? parsed : [...fallback]
}

/**
 * The four income-classification keys as they arrive from the API.
 *
 * Structural, not `Record<string, unknown>`: `UserPreferences` is an interface,
 * and interfaces get no implicit index signature, so a Record parameter would
 * reject the very payload the call sites hold.
 */
export interface IncomeListPayload {
  taxable_income_categories?: unknown
  investment_returns_categories?: unknown
  non_taxable_income_categories?: unknown
  other_income_categories?: unknown
}

/**
 * Apply the income-classification group rule to an already-built classification.
 *
 * The four income lists are a PARTITION, not four independent settings:
 * `IncomeClassificationSection.handleClassify` removes an item from all four
 * lists and appends it to exactly one. So "taxable is empty because I filed
 * every income item as non-taxable" is a state the Settings UI produces, and
 * injecting the shipped defaults into that empty list would RE-TAX income the
 * user explicitly marked non-taxable.
 *
 * Hence the rule is decided for the GROUP: defaults apply only when no list
 * holds a user choice (genuinely untouched, which is what the backend column
 * default and `_get_or_create_preferences` leave behind), and an individual
 * empty list is honoured as deliberate the moment a sibling holds one.
 * `essentialCategories` has no sibling partition, so it keeps the plain
 * per-field `arrayOrDefault` rule. Mirrors
 * `AnalyticsEngineBase._any_income_list_configured` on the backend.
 *
 * "A user choice" excludes a list that is exactly the shipped default for its
 * own field, because `POST /api/preferences/reset` PERSISTS the 9 non-taxable
 * defaults verbatim while writing `[]` for the other three. Counting that as
 * configuration would treat a reset user's taxable/investment/other lists as
 * deliberately empty and re-open this bug for them.
 *
 * Exported because `useTaxPlanning` and `useIncomeExpenseFlow` build the
 * camelCase shape themselves and only the downstream utils are editable -- see
 * `resolveEssentialCategories` for why forwarding a raw wire value bypasses the
 * store default entirely.
 */
export function withIncomeClassificationDefaults(
  classification: IncomeClassification,
): IncomeClassification {
  const defaults = DEFAULT_USER_PREFS.incomeClassification
  const pairs = [
    [ensureArray(classification.taxable).filter(Boolean), defaults.taxable],
    [ensureArray(classification.investmentReturns).filter(Boolean), defaults.investmentReturns],
    [ensureArray(classification.nonTaxable).filter(Boolean), defaults.nonTaxable],
    [ensureArray(classification.other).filter(Boolean), defaults.other],
  ] as const
  const isShippedDefault = (parsed: readonly string[], shipped: readonly string[]): boolean => {
    const a = new Set(parsed)
    return a.size === new Set(shipped).size && shipped.every((s) => a.has(s))
  }
  const groupConfigured = pairs.some(
    ([parsed, shipped]) => parsed.length > 0 && !isShippedDefault(parsed, shipped),
  )
  const pick = (parsed: readonly string[], fallback: readonly string[]): string[] => {
    if (parsed.length > 0) return [...parsed]
    // A sibling carries a user choice, so this empty list is deliberate.
    return groupConfigured ? [] : [...fallback]
  }
  return {
    taxable: pick(pairs[0][0], pairs[0][1]),
    investmentReturns: pick(pairs[1][0], pairs[1][1]),
    nonTaxable: pick(pairs[2][0], pairs[2][1]),
    other: pick(pairs[3][0], pairs[3][1]),
  }
}

/**
 * Resolve all four income-classification lists from a raw API payload.
 *
 * Thin snake_case-to-camelCase adapter over
 * `withIncomeClassificationDefaults` so the group rule has one implementation.
 */
export function resolveIncomeClassification(apiPrefs: IncomeListPayload): IncomeClassification {
  return withIncomeClassificationDefaults({
    taxable: ensureArray(apiPrefs.taxable_income_categories),
    investmentReturns: ensureArray(apiPrefs.investment_returns_categories),
    nonTaxable: ensureArray(apiPrefs.non_taxable_income_categories),
    other: ensureArray(apiPrefs.other_income_categories),
  })
}

/**
 * Resolve the essential-expense categories from a raw API payload.
 *
 * Exported for CALL SITES, not just the store. `preferencesUtils` takes the
 * category list as an optional override argument (`custom ?? getPrefs().x`), so
 * a page that passed `preferences.essential_categories` straight from
 * `usePreferences()` short-circuited the store default with the raw `[]` and got
 * 100% discretionary regardless of what the store held. Pages must resolve the
 * payload through this helper (or omit the argument) rather than forwarding the
 * wire value.
 */
export function resolveEssentialCategories(v: unknown): string[] {
  return arrayOrDefault(v, DEFAULT_USER_PREFS.essentialCategories)
}

function clampPercent(v: unknown, fallback: number): number {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : fallback
}

function ensureObject<T>(v: unknown, fallback: T): T {
  return v && typeof v === 'object' ? (v as T) : fallback
}

function ensureString(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback
}

/** Parse and validate API preferences into store-ready state. */
function parseApiPreferences(apiPrefs: Record<string, unknown>): Partial<PreferencesState> {
  const fySm = Number(apiPrefs.fiscal_year_start_month)

  return {
    displayPreferences: {
      numberFormat: apiPrefs.number_format === 'international' ? 'international' : 'indian',
      currencySymbol: ensureString(apiPrefs.currency_symbol, '₹'),
      currencySymbolPosition: apiPrefs.currency_symbol_position === 'after' ? 'after' : 'before',
      defaultTimeRange: ensureString(apiPrefs.default_time_range, 'all_time'),
    },
    displayCurrency: typeof apiPrefs.display_currency === 'string' && apiPrefs.display_currency in CURRENCIES
      ? apiPrefs.display_currency : BASE_CURRENCY,
    fiscalYearStartMonth: fySm >= 1 && fySm <= 12 ? fySm : 4,
    essentialCategories: arrayOrDefault(
      apiPrefs.essential_categories,
      DEFAULT_USER_PREFS.essentialCategories,
    ),
    incomeClassification: resolveIncomeClassification(apiPrefs),
    investmentAccountMappings: ensureObject(apiPrefs.investment_account_mappings, {}),
    needsTargetPercent: clampPercent(apiPrefs.needs_target_percent, 50),
    wantsTargetPercent: clampPercent(apiPrefs.wants_target_percent, 30),
    savingsTargetPercent: clampPercent(apiPrefs.savings_target_percent, 20),
    creditCardLimits: ensureObject(apiPrefs.credit_card_limits, {}),
    earningStartDate: ensureString(apiPrefs.earning_start_date, '') || null,
    useEarningStartDate: apiPrefs.use_earning_start_date === true,
    salaryStructure: ensureObject(apiPrefs.salary_structure, {}),
    rsuGrants: Array.isArray(apiPrefs.rsu_grants) ? apiPrefs.rsu_grants : [],
    growthAssumptions: apiPrefs.growth_assumptions && typeof apiPrefs.growth_assumptions === 'object'
      ? { ...DEFAULT_GROWTH_ASSUMPTIONS, ...(apiPrefs.growth_assumptions as Record<string, unknown>) }
      : { ...DEFAULT_GROWTH_ASSUMPTIONS },
  }
}

/**
 * Default user-scoped preference values. Shared by the store initializer and
 * `reset()` (called on logout) so a fresh build and a post-logout reset stay in
 * sync. Excludes the live exchange rate (transient, cleared separately).
 */
const DEFAULT_USER_PREFS = {
  displayPreferences: {
    numberFormat: 'indian' as const,
    currencySymbol: '₹',
    currencySymbolPosition: 'before' as const,
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
  // Income classification (by tax treatment), "Category::Subcategory" format.
  //
  // These are EXACT-MATCH keys (see `matchesClassification` in preferencesUtils):
  // a key that no transaction carries silently contributes zero, so a wrong
  // spelling does not error -- it just makes a KPI read 0. Several defaults here
  // drifted from the category names real exports actually use, so both the
  // drifted key and the real one are listed. An unmatched key costs nothing;
  // a missing one costs money.
  //
  // Names verified against a real exported ledger. Notably:
  //  - "Refunds & Cashbacks" (PLURAL) is what the data carries. The
  //    "Refund & Cashbacks" singular default matched 0 rows, so the cashback KPI
  //    read 0 for a ledger with a material amount of it.
  //  - "Deposit Return" (singular Deposit), not "Deposits Return".
  //  - "Stock Market Profit" (singular) and "F&O Profits", not "Stock Market
  //    Profits" / "F&O Income": realised market profit was falling through to
  //    "other" instead of investment returns.
  //  - Gifts and Pocket Money live under "Other Income", not "One-time Income".
  //    NOTE: the `other` list is INERT for classification -- `classifyIncomeType`
  //    already returns 'other' as its final fallback, so an unlisted key lands in
  //    the same bucket as a listed one and these keys move no money. They exist
  //    so the Settings classification UI shows them as assigned rather than
  //    unclassified, and so `withIncomeClassificationDefaults`' group rule can
  //    tell a reset row from a user choice.
  // Absolute amounts stay out of tracked source (this repo is public); the
  // measurements live in the untracked study notes under .claude/docs/studies/.
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
      'Investment Income::F&O Profits',
      'Investment Income::Stock Market Profits',
      'Investment Income::Stock Market Profit',
    ],
    nonTaxable: [
      'Refund & Cashbacks::Credit Card Cashbacks',
      'Refund & Cashbacks::Other Cashbacks',
      'Refund & Cashbacks::Product/Service Refunds',
      'Refund & Cashbacks::Deposits Return',
      'Refunds & Cashbacks::Credit Card Cashbacks',
      'Refunds & Cashbacks::Other Cashbacks',
      'Refunds & Cashbacks::Product/Service Refunds',
      'Refunds & Cashbacks::Deposit Return',
      'Employment Income::Expense Reimbursement',
    ],
    other: [
      'One-time Income::Gifts',
      'One-time Income::Pocket Money',
      'One-time Income::Competition/Contest Prizes',
      'Other Income::Gifts',
      'Other Income::Pocket Money',
      'Other Income::Freelance Income',
      'Other Income::Uncategorised',
      'Employment Income::EPF Contribution',
      'Other::Other',
    ],
  },
  investmentAccountMappings: {},
  needsTargetPercent: 50,
  wantsTargetPercent: 30,
  savingsTargetPercent: 20,
  creditCardLimits: {},
  earningStartDate: null,
  useEarningStartDate: false,
  salaryStructure: {},
  rsuGrants: [],
}

/** Build a fresh copy of the defaults (deep-ish; arrays/objects re-created). */
function freshDefaults() {
  return {
    ...DEFAULT_USER_PREFS,
    displayPreferences: { ...DEFAULT_USER_PREFS.displayPreferences },
    essentialCategories: [...DEFAULT_USER_PREFS.essentialCategories],
    incomeClassification: {
      taxable: [...DEFAULT_USER_PREFS.incomeClassification.taxable],
      investmentReturns: [...DEFAULT_USER_PREFS.incomeClassification.investmentReturns],
      nonTaxable: [...DEFAULT_USER_PREFS.incomeClassification.nonTaxable],
      other: [...DEFAULT_USER_PREFS.incomeClassification.other],
    },
    investmentAccountMappings: {},
    creditCardLimits: {},
    salaryStructure: {},
    rsuGrants: [],
    growthAssumptions: { ...DEFAULT_GROWTH_ASSUMPTIONS },
  }
}

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
