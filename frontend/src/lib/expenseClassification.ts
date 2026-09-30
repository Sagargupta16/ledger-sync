/**
 * Expense taxonomy: separates real spending from realised capital losses.
 *
 * WHY THIS EXISTS
 * ---------------
 * Bank/cashbook workbooks routinely book a realised trading loss as an EXPENSE
 * row so the cash column balances. A realised loss is a NEGATIVE INVESTMENT
 * RETURN, not consumption: it never bought goods or services, so counting it as
 * spending inflates every expense total, category ranking, savings rate and
 * budget comparison.
 *
 * ONE RULE, SHARED WITH THE BACKEND (decided 2026-09-30: the backend rule wins)
 * ---------------------------------------------------------------------------
 * Aggregates exclude ONLY the `Category::Subcategory` keys the user classified
 * in the `capital_loss_categories` preference -- the same set
 * `backend/src/ledger_sync/core/expense_class.py` reads, normalised the same way
 * (`classification_key`: trim + lower-case each half). The preference ships
 * EMPTY, so an unclassified ledger counts every Expense row as spending, exactly
 * as `/totals`, `/category-breakdown` and the rollups do.
 *
 * An earlier version of this module decided losses from name patterns on its
 * own. That made client-computed pages drop rows the server still counted, so
 * the same window read two different spending totals depending on which page
 * the user opened. Patterns now power {@link looksLikeCapitalLoss} only: a
 * DETECTION signal that suggests candidates (the Data Health page, mirroring
 * the backend's `capital_loss_candidates`) and never moves an aggregate.
 *
 * FAIL-SAFE DIRECTION
 * -------------------
 * Wrongly excluding a row understates a user's real spending, which is the
 * dangerous error; wrongly including one only leaves today's behaviour
 * unchanged. So a row is a capital loss only when the user said so.
 *
 * MULTI-USER CONSTRAINT (do not regress this)
 * -------------------------------------------
 * No category name is hardcoded here. Classified keys come from the user's own
 * data, and the detection patterns are generic word-boundary regexes so "Trading
 * Losses", "F & O Loss" or "Realised Capital Loss" all raise the signal.
 *
 * SCOPE
 * -----
 * Realised-loss rows are excluded from SPENDING only. They are still real
 * ledger rows, they still left the account (savings subtract them), and under
 * Indian tax law they carry forward against future capital gains, so they are
 * never deleted or hidden -- just not summed as consumption.
 */

import {
  INVESTMENT_CONTEXT_PATTERNS,
  CAPITAL_LOSS_PATTERNS,
  INVESTMENT_COST_PATTERNS,
} from './expenseClassificationPatterns'

/** Consumption = real spending. investment_cost = cost of investing (still an
 *  expense, real cash out). capital_loss = classified negative return, NOT spending. */
export type ExpenseClass = 'consumption' | 'investment_cost' | 'capital_loss'

/**
 * Minimal shape needed to classify; every field is optional so partial rows
 * (demo fixtures, aggregation buckets) classify without a cast. `note` and
 * `account` are deliberately absent: only the row's own taxonomy is read.
 */
export interface ExpenseClassifiable {
  type?: string | null
  amount?: number | null
  category?: string | null
  subcategory?: string | null
}

export interface ExpenseClassificationConfig {
  /**
   * Normalised `category::subcategory` keys the user classified as realised
   * losses. Build it with {@link capitalLossKeySet}; absent or empty means
   * nothing is classified and every Expense row is spending.
   */
  readonly capitalLossKeys?: ReadonlySet<string>
}

/** Separator of the preference keys, matching the four income lists. */
export const KEY_SEPARATOR = '::'

/** Mirrors backend `_norm`: case folding plus trimming, nothing richer. */
const normKey = (value: string | null | undefined): string => (value ?? '').trim().toLowerCase()

/** Normalised `category::subcategory` key for a row (backend `classification_key`). */
export function classificationKey(
  category: string | null | undefined,
  subcategory: string | null | undefined,
): string {
  return `${normKey(category)}${KEY_SEPARATOR}${normKey(subcategory)}`
}

/**
 * Parse stored `capital_loss_categories` into normalised keys (backend
 * `capital_loss_keys`). Non-string and blank entries are skipped; a key without
 * a separator classifies the category's rows that have no subcategory.
 */
export function capitalLossKeySet(categories: readonly unknown[] | null | undefined): ReadonlySet<string> {
  const keys = new Set<string>()
  for (const item of categories ?? []) {
    if (typeof item !== 'string' || !item.trim()) continue
    const at = item.indexOf(KEY_SEPARATOR)
    const category = at === -1 ? item : item.slice(0, at)
    const subcategory = at === -1 ? '' : item.slice(at + KEY_SEPARATOR.length)
    keys.add(classificationKey(category, subcategory))
  }
  return keys
}

/** Config for the aggregates from the raw preference list. */
export function capitalLossConfig(
  categories: readonly unknown[] | null | undefined,
): ExpenseClassificationConfig {
  return { capitalLossKeys: capitalLossKeySet(categories) }
}

/**
 * Lowercase, collapse whitespace, and fold " and " to "&" so "F and O Loss",
 * "F&O  Loss" and "f & o losses" all reach the same detection patterns.
 */
const normalise = (value: string | null | undefined): string =>
  (value ?? '')
    .toLowerCase()
    .replace(/\band\b/g, '&')
    .replace(/\s+/g, ' ')
    .trim()

const matchesAny = (haystack: string, patterns: readonly RegExp[]): boolean =>
  patterns.some((pattern) => pattern.test(haystack))

const taxonomyOf = (tx: ExpenseClassifiable): string =>
  normalise([tx.category, tx.subcategory].filter(Boolean).join(' '))

/**
 * DETECTION ONLY: does this row's taxonomy read like a realised loss?
 *
 * Mirrors backend `looks_like_capital_loss`: the taxonomy must carry an
 * investment signal, a fee signal wins (brokerage on a losing trade is still
 * spending), then a loss signal. Never call this from an aggregate -- its only
 * job is to suggest rows the user may want to classify.
 */
export function looksLikeCapitalLoss(tx: ExpenseClassifiable): boolean {
  const taxonomy = taxonomyOf(tx)
  if (!taxonomy || !matchesAny(taxonomy, INVESTMENT_CONTEXT_PATTERNS)) return false
  if (matchesAny(taxonomy, INVESTMENT_COST_PATTERNS)) return false
  return matchesAny(taxonomy, CAPITAL_LOSS_PATTERNS)
}

/** True when the user classified this row's taxonomy as a realised loss. */
export function isCapitalLoss(tx: ExpenseClassifiable, config?: ExpenseClassificationConfig): boolean {
  const keys = config?.capitalLossKeys
  if (!keys || keys.size === 0) return false
  return keys.has(classificationKey(tx.category, tx.subcategory))
}

/**
 * True when the row should count towards spending totals.
 *
 * Does not check `tx.type` -- callers already filter to expenses, and keeping
 * the type gate at the call site means this stays usable on pre-bucketed rows.
 */
export const isSpending = (tx: ExpenseClassifiable, config?: ExpenseClassificationConfig): boolean =>
  !isCapitalLoss(tx, config)

/**
 * Classify a single expense row. Pure and deterministic.
 *
 * `capital_loss` only for a classified key. Otherwise an investment-flavoured
 * taxonomy (including an UNCLASSIFIED loss-looking one) is a cost of investing
 * and everything else is consumption -- both of which are spending.
 */
export function classifyExpense(
  tx: ExpenseClassifiable,
  config: ExpenseClassificationConfig = {},
): ExpenseClass {
  if (isCapitalLoss(tx, config)) return 'capital_loss'
  const taxonomy = taxonomyOf(tx)
  if (taxonomy && matchesAny(taxonomy, INVESTMENT_CONTEXT_PATTERNS)) return 'investment_cost'
  return 'consumption'
}

export interface ExpenseTotals {
  consumption: number
  investmentCost: number
  capitalLoss: number
  /** consumption + investmentCost: what the app should call "spending". */
  spending: number
  /** Every expense row including classified losses. */
  total: number
}

/**
 * Split expense rows into the three buckets. Only `type === 'Expense'` rows
 * count. Used to report how much of a total is really spending -- call sites
 * that only need a filter use `isSpending` directly.
 */
export function splitExpenseTotals(
  transactions: readonly ExpenseClassifiable[] | null | undefined,
  config?: ExpenseClassificationConfig,
): ExpenseTotals {
  const totals: ExpenseTotals = {
    consumption: 0,
    investmentCost: 0,
    capitalLoss: 0,
    spending: 0,
    total: 0,
  }
  for (const tx of transactions ?? []) {
    if (tx.type !== 'Expense') continue
    const amount = Math.abs(tx.amount ?? 0)
    if (!Number.isFinite(amount)) continue
    totals.total += amount
    const bucket = classifyExpense(tx, config)
    if (bucket === 'capital_loss') totals.capitalLoss += amount
    else if (bucket === 'investment_cost') totals.investmentCost += amount
    else totals.consumption += amount
  }
  totals.spending = totals.consumption + totals.investmentCost
  return totals
}
