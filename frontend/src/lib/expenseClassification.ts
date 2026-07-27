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
 * Sibling rows in the same category ARE genuine expenses -- brokerage, STT,
 * demat AMC and advisory fees are the cost of doing business as an investor.
 * So this is never a whole-category move; classification is per row.
 *
 * MULTI-USER CONSTRAINT (do not regress this)
 * -------------------------------------------
 * This app is generic and multi-user. One user's category names are NEVER the
 * source of truth. Classification is therefore pattern-based (word-boundary
 * regexes) plus an optional per-user `overrides` map, so a ledger that spells
 * it "Trading Losses", "F & O Loss", "Realised Capital Loss" or something in
 * another taxonomy still classifies. Never add a rule that only works for one
 * specific ledger's spelling.
 *
 * TAXONOMY-ONLY WINDOW
 * --------------------
 * Only `category` + `subcategory` are read. `note` and `account` are free text
 * that a user writes for their own reasons, and reading them let unrelated
 * signals combine across fields: a gadget bought on a broker-linked account
 * with the note "replacement for loss" scored an investment signal from the
 * account and a loss signal from the note, and got dropped from spending. The
 * row's own taxonomy must state BOTH "investment" and "loss" for it to count as
 * a realised loss.
 *
 * FAIL-SAFE DIRECTION
 * -------------------
 * Unknown rows resolve to an expense class, never to `capital_loss`. Wrongly
 * excluding a row understates a user's real spending, which is the dangerous
 * error; wrongly including one only leaves today's behaviour unchanged. For
 * the same reason a fee signal beats a loss signal on the same row.
 *
 * SCOPE
 * -----
 * Realised-loss rows are excluded from SPENDING only. They are still real
 * ledger rows and belong in investment P&L / returns views, and under Indian
 * tax law they carry forward against future capital gains (8 assessment
 * years; speculative intraday losses 4), so they must never be deleted or
 * hidden -- just not summed as consumption.
 *
 * Known limitation: a user who books actual investment PURCHASES as expenses
 * still gets them counted as spending (`investment_cost`). That is a separate
 * defect about investment outflow detection, deliberately not handled here.
 */

import {
  INVESTMENT_CONTEXT_PATTERNS,
  CAPITAL_LOSS_PATTERNS,
  INVESTMENT_COST_PATTERNS,
} from './expenseClassificationPatterns'

/** Consumption = real spending. investment_cost = cost of investing (still an
 *  expense, real cash out). capital_loss = negative return, NOT spending. */
export type ExpenseClass = 'consumption' | 'investment_cost' | 'capital_loss'

/**
 * Minimal shape needed to classify; every field is optional so partial rows
 * (demo fixtures, aggregation buckets) classify without a cast. `note` and
 * `account` are deliberately absent -- see the TAXONOMY-ONLY WINDOW note above.
 */
export interface ExpenseClassifiable {
  type?: string | null
  amount?: number | null
  category?: string | null
  subcategory?: string | null
}

export interface ExpenseClassificationConfig {
  /**
   * Per-user escape hatch. Keys are matched case-insensitively and
   * whitespace-normalised, most specific first: `"Category::Subcategory"`,
   * then bare subcategory, then bare category.
   */
  readonly overrides?: Readonly<Record<string, ExpenseClass>>
  /** Extra "this row is a realised loss" signals for unusual taxonomies. */
  readonly extraLossPatterns?: readonly RegExp[]
  /** Extra "this row sits in an investment context" signals. */
  readonly extraInvestmentPatterns?: readonly RegExp[]
}

/**
 * Lowercase, collapse whitespace, and fold " and " to "&" so "F and O Loss",
 * "F&O  Loss" and "f & o losses" all reach the same patterns.
 */
const normalise = (value: string | null | undefined): string =>
  (value ?? '')
    .toLowerCase()
    .replace(/\band\b/g, '&')
    .replace(/\s+/g, ' ')
    .trim()

const matchesAny = (haystack: string, patterns: readonly RegExp[]): boolean =>
  patterns.some((pattern) => pattern.test(haystack))

/** Override keys, most specific first. */
const overrideKeys = (tx: ExpenseClassifiable): string[] => {
  const category = normalise(tx.category)
  const subcategory = normalise(tx.subcategory)
  const keys: string[] = []
  if (category && subcategory) keys.push(`${category}::${subcategory}`)
  if (subcategory) keys.push(subcategory)
  if (category) keys.push(category)
  return keys
}

const lookupOverride = (
  tx: ExpenseClassifiable,
  overrides: Readonly<Record<string, ExpenseClass>> | undefined,
): ExpenseClass | null => {
  if (!overrides) return null
  const normalised = new Map(
    Object.entries(overrides).map(([key, value]) => [normalise(key), value]),
  )
  for (const key of overrideKeys(tx)) {
    const hit = normalised.get(key)
    if (hit) return hit
  }
  return null
}

/**
 * Classify a single expense row. Pure and deterministic.
 *
 * Order: explicit override -> require an investment signal in the row's own
 * taxonomy -> fee signal wins (fail-safe) -> loss signal -> residual
 * investment-flavoured rows are a cost of investing -> everything else is
 * consumption.
 *
 * Only category + subcategory are read. Free-text `note`/`account` are ignored
 * on purpose so an investment signal in one field cannot combine with a loss
 * word in another and silently drop a consumption row out of spending.
 */
export function classifyExpense(
  tx: ExpenseClassifiable,
  config: ExpenseClassificationConfig = {},
): ExpenseClass {
  const override = lookupOverride(tx, config.overrides)
  if (override) return override

  const taxonomy = normalise([tx.category, tx.subcategory].filter(Boolean).join(' '))
  if (!taxonomy) return 'consumption'

  const investmentPatterns = [
    ...INVESTMENT_CONTEXT_PATTERNS,
    ...(config.extraInvestmentPatterns ?? []),
  ]
  if (!matchesAny(taxonomy, investmentPatterns)) return 'consumption'

  if (matchesAny(taxonomy, INVESTMENT_COST_PATTERNS)) return 'investment_cost'

  const lossPatterns = [...CAPITAL_LOSS_PATTERNS, ...(config.extraLossPatterns ?? [])]
  if (matchesAny(taxonomy, lossPatterns)) return 'capital_loss'

  return 'investment_cost'
}

/** True when the row is a realised capital loss and must NOT be summed as spending. */
export const isCapitalLoss = (
  tx: ExpenseClassifiable,
  config?: ExpenseClassificationConfig,
): boolean => classifyExpense(tx, config) === 'capital_loss'

/**
 * True when the row should count towards spending totals.
 *
 * Does not check `tx.type` -- callers already filter to expenses, and keeping
 * the type gate at the call site means this stays usable on pre-bucketed rows.
 */
export const isSpending = (
  tx: ExpenseClassifiable,
  config?: ExpenseClassificationConfig,
): boolean => !isCapitalLoss(tx, config)

export interface ExpenseTotals {
  consumption: number
  investmentCost: number
  capitalLoss: number
  /** consumption + investmentCost: what the app should call "spending". */
  spending: number
  /** Every expense row including losses: matches the pre-fix inflated total. */
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
