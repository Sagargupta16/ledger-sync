/**
 * Constants and helper functions for the Settings page.
 */

import type { IncomeClassificationType } from './types'
import { INCOME_CLASSIFICATION_KEY_MAP } from './types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const PAYDAY_OPTIONS = Array.from({ length: 31 }, (_, i) => i + 1)

export const DAYS_AHEAD_OPTIONS = [
  { value: 3, label: '3 days' },
  { value: 5, label: '5 days' },
  { value: 7, label: '7 days' },
  { value: 14, label: '14 days' },
]

export const DASHBOARD_WIDGETS = [
  { key: 'savings_rate', label: 'Savings Rate' },
  { key: 'top_spending', label: 'Top Spending Category' },
  { key: 'top_income', label: 'Top Income Source' },
  { key: 'burn_rate', label: 'Monthly Burn Rate' },
  { key: 'daily_spending', label: 'Average Daily Spending' },
  { key: 'biggest_transaction', label: 'Biggest Transaction' },
  { key: 'cashback', label: 'Net Cashback Earned' },
  { key: 'total_transactions', label: 'Total Transactions' },
  { key: 'median_transaction', label: 'Median Transaction' },
  { key: 'weekend_spending', label: 'Weekend Spending' },
  { key: 'peak_day', label: 'Peak Spending Day' },
  { key: 'spending_diversity', label: 'Spending Diversity' },
  { key: 'avg_transaction', label: 'Avg Transaction Amount' },
  { key: 'total_transfers', label: 'Total Internal Transfers' },
] as const

/**
 * Widgets shown by default on first visit. The Dashboard has 14 possible
 * Quick Insight widgets in total, but showing them all makes the page feel
 * cluttered and none of them feel important. These six are the ones an
 * advisor would actually look at first; the rest are available via Settings
 * > Dashboard Widgets for power users who want more.
 */
export const DEFAULT_VISIBLE_WIDGETS: readonly string[] = [
  'savings_rate',
  'top_spending',
  'top_income',
  'burn_rate',
  'daily_spending',
  'biggest_transaction',
] as const

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

// Keyword-to-classification lookup tables (ordered by priority).
//
// Credit-card keywords are intentionally generous -- cards in India are often
// branded ("Swiggy HDFC", "Amazon Pay ICICI", "Flipkart Axis", "Jupiter Edge",
// "OneCard", "Slice", "Uni"). Bank names overlap heavily with card names, so
// we disambiguate later using the account's balance sign.
const ACCOUNT_CLASSIFICATION_RULES: Array<{ keywords: string[]; endsWith?: string[]; classification: string }> = [
  {
    keywords: [
      'credit card', ' cc', 'cc ', 'amex', 'diners',
      'jupiter edge', 'onecard', 'slice', ' uni ',
      'millennia', 'simplyclick', 'simply click', 'regalia',
      'swiggy hdfc', 'amazon pay icici', 'amazon pay ', 'flipkart axis',
    ],
    classification: 'Credit Cards',
  },
  {
    keywords: [
      'epf', 'ppf', 'nps', 'mutual fund', ' mf', 'groww', 'zerodha', 'kuvera',
      'stock', 'demat', 'shares', 'fixed deposit', ' fd', 'investment', 'gold', 'crypto',
    ],
    endsWith: [' mf', ' fd'],
    classification: 'Investments',
  },
  { keywords: ['loan', 'debt', 'emi', 'mortgage'], classification: 'Loans/Lended' },
  {
    keywords: [
      'bank', 'checking', 'salary', 'savings', 'saving',
      'hdfc', 'icici', 'sbi', 'axis', 'kotak', 'bob', 'pnb', 'canara', 'idfc',
      'yes bank', 'indusind', 'rbl', 'federal', 'bandhan', 'union bank', 'jupiter',
    ],
    classification: 'Bank Accounts',
  },
  { keywords: ['cash', 'wallet'], classification: 'Cash' },
]

function matchClassification(lower: string, rules: Array<{ keywords: string[]; endsWith?: string[]; classification: string }>): string | null {
  for (const rule of rules) {
    if (rule.keywords.some((kw) => lower.includes(kw))) return rule.classification
    if (rule.endsWith?.some((kw) => lower.endsWith(kw))) return rule.classification
  }
  return null
}

export interface AccountStats {
  balance: number
  transactions: number
}

/**
 * Apply balance-sign heuristics for accounts that keyword matching couldn't
 * classify, or where keywords conflict with the observed behavior.
 *
 * Rationale -- in Indian personal-finance software:
 *   - Credit cards typically show a negative balance (what you owe the bank)
 *   - Bank accounts, cash, and investments show positive balances
 *   - Dormant accounts (0 balance, very few transactions) don't need a strong
 *     guess; "Other Wallets" is the honest default
 *
 * Keyword rules always win when they match. This pass only fires for names
 * the keyword layer left at "Other Wallets". That keeps the behaviour
 * backwards-compatible for users whose accounts followed the old convention.
 */
function refineWithBalance(
  keywordGuess: string,
  stats: AccountStats | undefined,
): string {
  if (keywordGuess !== 'Other Wallets' || !stats) return keywordGuess
  if (stats.transactions === 0) return keywordGuess

  // Consistent liability signal -- default to Credit Cards rather than Loans
  // because cards outnumber personal loans for most users; loans also usually
  // have the word "loan" in the name and would already have matched.
  if (stats.balance < 0) return 'Credit Cards'

  // Positive balance with meaningful activity -- most likely a bank/wallet
  // that just doesn't match any of our keyword dictionaries. Picking
  // "Bank Accounts" over "Cash" because real users rarely have large cash
  // holdings but often have bank accounts with non-obvious names.
  if (stats.balance > 0 && stats.transactions >= 3) return 'Bank Accounts'

  return keywordGuess
}

/**
 * Derive default account classifications.
 *
 * Two-pass heuristic:
 *   1. Match each account name against the keyword rule table.
 *   2. For anything still "Other Wallets", look at the account's observed
 *      balance + transaction count (if provided) and use balance sign as a
 *      fallback signal.
 *
 * `accountStats` is optional so existing call sites that only have names
 * keep working unchanged; the balance-based refinement simply doesn't fire.
 */
export function getDefaultClassifications(
  accountNames: string[],
  accountStats?: Record<string, AccountStats>,
): Record<string, string> {
  const defaults: Record<string, string> = {}
  for (const name of accountNames) {
    const keywordGuess =
      matchClassification(name.toLowerCase(), ACCOUNT_CLASSIFICATION_RULES) ?? 'Other Wallets'
    defaults[name] = refineWithBalance(keywordGuess, accountStats?.[name])
  }
  return defaults
}

const INCOME_CLASSIFICATION_RULES: Array<{ keywords: string[]; bucket: IncomeClassificationType }> = [
  { keywords: ['salary', 'stipend', 'bonus', 'freelance', 'gig work', 'consulting', 'rsus', 'self employment', 'rental', 'employment income'], bucket: 'taxable' },
  { keywords: ['dividend', 'interest', 'capital gain', 'f&o', 'stock market', 'investment', 'mutual fund', 'trading'], bucket: 'investment' },
  { keywords: ['cashback', 'refund', 'reward', 'reimbursement', 'deposit return'], bucket: 'non_taxable' },
  { keywords: ['gift', 'prize', 'pocket money', 'epf contribution', 'one-time', 'other', 'modified balancing'], bucket: 'other' },
]

/**
 * Suggest a tax bucket for one income subcategory by keyword matching.
 *
 * Single source of truth for the keyword rules: both the first-run default
 * seeding (`getDefaultIncomeClassifications`) and the unclassified-income
 * prompt (`auditIncomeClassification`) read it, so a suggestion the user sees
 * in Settings is the same one the defaults would have picked.
 *
 * Returns `null` when nothing matches -- an honest "we don't know", which the
 * UI must surface rather than guess at.
 */
export function suggestIncomeBucket(
  category: string,
  subcategory: string,
): IncomeClassificationType | null {
  const subLower = subcategory.toLowerCase()
  const catLower = category.toLowerCase()
  // Check subcategory first (specific), then category (broad) to avoid
  // broad keywords like 'employment income' swallowing specific subcategories
  const matched =
    INCOME_CLASSIFICATION_RULES.find((rule) => rule.keywords.some((kw) => subLower.includes(kw))) ??
    INCOME_CLASSIFICATION_RULES.find((rule) => rule.keywords.some((kw) => catLower.includes(kw)))
  return matched?.bucket ?? null
}

/**
 * Classify income subcategory items (format: "Category::Subcategory") into
 * tax-based buckets using keyword matching. Returns defaults only for items
 * not already classified by the user.
 */
export function getDefaultIncomeClassifications(
  allIncomeCategories: Record<string, string[]>,
  existing: {
    taxable: string[]
    investment: string[]
    non_taxable: string[]
    other: string[]
  },
): { taxable: string[]; investment: string[]; non_taxable: string[]; other: string[] } {
  const alreadyClassified = new Set([
    ...existing.taxable, ...existing.investment,
    ...existing.non_taxable, ...existing.other,
  ])

  const result = {
    taxable: [...existing.taxable],
    investment: [...existing.investment],
    non_taxable: [...existing.non_taxable],
    other: [...existing.other],
  }

  for (const [cat, subs] of Object.entries(allIncomeCategories)) {
    for (const sub of subs) {
      const item = `${cat}::${sub}`
      if (alreadyClassified.has(item)) continue

      const bucket = suggestIncomeBucket(cat, sub)
      if (bucket) result[bucket].push(item)
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Income classification audit
// ---------------------------------------------------------------------------

/** One "Category::Subcategory" income bucket as it exists in the ledger. */
export interface IncomeFacet {
  category: string
  subcategory: string
  count: number
  total: number
}

/** A ledger income bucket that no classification list claims. */
export interface UnclassifiedIncomeItem {
  key: string
  category: string
  subcategory: string
  count: number
  total: number
  /** Keyword-derived bucket, or `null` when no rule matches. */
  suggested: IncomeClassificationType | null
}

/** A saved classification key that matches zero ledger rows. */
export interface DeadIncomeKey {
  key: string
  classification: IncomeClassificationType
}

export interface IncomeClassificationAudit {
  unclassified: UnclassifiedIncomeItem[]
  deadKeys: DeadIncomeKey[]
  /** Money sitting in unclassified buckets -- the cost of leaving the prompt alone. */
  unclassifiedTotal: number
  /** Transaction count behind `unclassifiedTotal`. */
  unclassifiedRows: number
}

type IncomeClassificationLists = Record<IncomeClassificationType, string[]>

/**
 * Reconcile the four saved classification lists against the ledger's actual
 * income buckets.
 *
 * Why this exists: the lists are EXACT-MATCH key sets and a stored non-empty
 * list is honoured verbatim by the backend (`core/analytics/base.py`). So a
 * partially-configured list has two silent failure modes, neither of which
 * raises anything:
 *   - a ledger bucket in NO list falls through every consumer's classification
 *     chain (`classifyIncomeType` returns 'other', `_is_taxable_income` returns
 *     false), so the money quietly leaves every classified total; and
 *   - a saved key no transaction carries contributes zero, so a drifted
 *     spelling reads as a configured-and-working bucket while summing nothing.
 *
 * Matching is case-insensitive to mirror `matchesClassification` in
 * `lib/preferencesUtils.ts` -- a key differing only in case is honoured by the
 * consumers, so flagging it here would be a false alarm.
 */
export function auditIncomeClassification(
  facets: IncomeFacet[],
  lists: IncomeClassificationLists,
): IncomeClassificationAudit {
  const claimedBy = new Map<string, IncomeClassificationType>()
  for (const type of Object.keys(INCOME_CLASSIFICATION_KEY_MAP) as IncomeClassificationType[]) {
    for (const key of lists[type]) {
      const lower = key.toLowerCase()
      // First list wins, matching the fixed resolution order consumers use.
      if (!claimedBy.has(lower)) claimedBy.set(lower, type)
    }
  }

  const ledgerKeys = new Set(
    facets.map((f) => `${f.category}::${f.subcategory}`.toLowerCase()),
  )

  const unclassified: UnclassifiedIncomeItem[] = []
  for (const facet of facets) {
    const key = `${facet.category}::${facet.subcategory}`
    if (claimedBy.has(key.toLowerCase())) continue
    unclassified.push({
      key,
      category: facet.category,
      subcategory: facet.subcategory,
      count: facet.count,
      total: facet.total,
      suggested: suggestIncomeBucket(facet.category, facet.subcategory),
    })
  }
  // Biggest money impact first -- that is the row worth fixing.
  unclassified.sort((a, b) => b.total - a.total)

  const deadKeys: DeadIncomeKey[] = []
  for (const type of Object.keys(INCOME_CLASSIFICATION_KEY_MAP) as IncomeClassificationType[]) {
    for (const key of lists[type]) {
      if (!ledgerKeys.has(key.toLowerCase())) deadKeys.push({ key, classification: type })
    }
  }

  return {
    unclassified,
    deadKeys,
    unclassifiedTotal: unclassified.reduce((sum, item) => sum + item.total, 0),
    unclassifiedRows: unclassified.reduce((sum, item) => sum + item.count, 0),
  }
}

const INVESTMENT_MAPPING_RULES: Array<{ keywords: string[]; endsWith?: string[]; type: string }> = [
  { keywords: ['epf', 'ppf', 'nps'], type: 'ppf_epf' },
  { keywords: ['mutual fund', ' mf', 'groww', 'kuvera'], endsWith: [' mf'], type: 'mutual_funds' },
  { keywords: ['stock', 'demat', 'shares', 'zerodha'], type: 'stocks' },
  { keywords: ['fixed deposit', ' fd'], endsWith: [' fd'], type: 'fixed_deposits' },
  { keywords: ['gold'], type: 'gold' },
  { keywords: ['crypto'], type: 'crypto' },
  { keywords: ['real estate', 'property'], type: 'real_estate' },
]

/** Derive default investment type mappings from account names by keyword matching */
export function getDefaultInvestmentMappings(accountNames: string[]): Record<string, string> {
  const mappings: Record<string, string> = {}
  for (const name of accountNames) {
    const lower = name.toLowerCase()
    const matched = INVESTMENT_MAPPING_RULES.find(
      (rule) => rule.keywords.some((kw) => lower.includes(kw)) || rule.endsWith?.some((kw) => lower.endsWith(kw)),
    )
    mappings[name] = matched?.type ?? 'other'
  }
  return mappings
}

/** Safely coerce stored value (may be JSON string or array) to string[] */
export function normalizeArray(value: string[] | string): string[] {
  if (Array.isArray(value)) return value
  if (typeof value === 'string' && value.length > 0) {
    try {
      // JSON.parse is typed `any`; keep it at `unknown` and narrow.
      const parsed: unknown = JSON.parse(value)
      return Array.isArray(parsed) ? (parsed as string[]) : []
    } catch {
      return []
    }
  }
  return []
}

export function getStoredWidgets(): string[] {
  try {
    const raw = localStorage.getItem('ledger-sync-visible-widgets')
    // JSON.parse is typed `any`; keep it at `unknown` and narrow. A stored
    // non-array (corrupted value) previously returned as-is; it now falls
    // through to the default set instead of poisoning callers with a non-array.
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed as string[]
    }
  } catch {
    // localStorage unavailable or corrupted
  }
  // First-time users see a focused 6-widget set instead of all 14. Power users
  // can turn on the rest via Settings > Dashboard Widgets.
  return [...DEFAULT_VISIBLE_WIDGETS]
}

/** Build a deep-cloned LocalPrefs from server preferences data */
export function buildInitialLocalPrefs(p: Record<string, unknown>): Record<string, unknown> {
  // These fields arrive as `unknown` and may legitimately be absent, so each
  // `?? []` guard is load-bearing. Casting to a bare `string[]` claimed they
  // were always present, which made the guards look dead to the type checker;
  // the `| undefined` keeps the assertion honest without changing runtime.
  const list = (value: unknown) => value as string[] | undefined
  // `Array.isArray` narrows an `unknown` to `any[]`, so spreading the result
  // re-introduced an implicit any. Copy through a typed view instead; the
  // non-array branch (a JSON string, or absent) is passed along untouched.
  const copyIfArray = (value: unknown): unknown =>
    Array.isArray(value) ? [...(value as unknown[])] : (value ?? [])
  return {
    fiscal_year_start_month: p.fiscal_year_start_month,
    essential_categories: [...(list(p.essential_categories) ?? [])],
    investment_account_mappings: { ...(p.investment_account_mappings as Record<string, string>) },
    taxable_income_categories: [...(list(p.taxable_income_categories) ?? [])],
    investment_returns_categories: [...(list(p.investment_returns_categories) ?? [])],
    non_taxable_income_categories: [...(list(p.non_taxable_income_categories) ?? [])],
    other_income_categories: [...(list(p.other_income_categories) ?? [])],
    default_budget_alert_threshold: p.default_budget_alert_threshold,
    auto_create_budgets: p.auto_create_budgets,
    budget_rollover_enabled: p.budget_rollover_enabled,
    number_format: p.number_format,
    display_currency: p.display_currency ?? 'INR',
    currency_symbol: p.currency_symbol,
    currency_symbol_position: p.currency_symbol_position,
    default_time_range: p.default_time_range,
    anomaly_expense_threshold: p.anomaly_expense_threshold,
    anomaly_types_enabled: [...(list(p.anomaly_types_enabled) ?? [])],
    auto_dismiss_recurring_anomalies: p.auto_dismiss_recurring_anomalies,
    recurring_min_confidence: p.recurring_min_confidence,
    recurring_auto_confirm_occurrences: p.recurring_auto_confirm_occurrences,
    needs_target_percent: p.needs_target_percent ?? 50,
    wants_target_percent: p.wants_target_percent ?? 30,
    savings_target_percent: p.savings_target_percent ?? 20,
    credit_card_limits: { ...(p.credit_card_limits as Record<string, number>) },
    earning_start_date: p.earning_start_date ?? null,
    use_earning_start_date: p.use_earning_start_date ?? false,
    fixed_expense_categories: copyIfArray(p.fixed_expense_categories),
    savings_goal_percent: p.savings_goal_percent ?? 20,
    monthly_investment_target: p.monthly_investment_target ?? 0,
    payday: p.payday ?? 1,
    preferred_tax_regime: p.preferred_tax_regime ?? 'new',
    excluded_accounts: copyIfArray(p.excluded_accounts),
    notify_budget_alerts: p.notify_budget_alerts ?? true,
    notify_anomalies: p.notify_anomalies ?? true,
    notify_upcoming_bills: p.notify_upcoming_bills ?? true,
    notify_days_ahead: p.notify_days_ahead ?? 7,
    show_tds_schedule: p.show_tds_schedule ?? false,
    epf_withdrawal_taxable: p.epf_withdrawal_taxable ?? false,
    epf_taxable_percent: p.epf_taxable_percent ?? 100,
    salary_is_net_of_tds: p.salary_is_net_of_tds ?? true,
  }
}
