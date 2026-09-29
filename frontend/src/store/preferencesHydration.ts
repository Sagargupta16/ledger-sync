/**
 * Hydration helpers: validate and normalize the preferences API payload
 * into store-ready state, including the shipped-default rules for list
 * preferences the backend stores as `"[]"` when untouched.
 *
 * Re-exported by `@/store/preferencesStore`, the public import path; import
 * from there rather than from this module.
 */

import { CURRENCIES, BASE_CURRENCY } from '@/constants/currencies'
import { DEFAULT_GROWTH_ASSUMPTIONS } from '@/types/salary'
import { DEFAULT_USER_PREFS } from './preferencesDefaults'
import type { IncomeClassification, PreferencesState } from './preferencesTypes'

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
export function parseApiPreferences(apiPrefs: Record<string, unknown>): Partial<PreferencesState> {
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
