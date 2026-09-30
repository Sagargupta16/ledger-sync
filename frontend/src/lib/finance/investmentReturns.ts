import { withIncomeClassificationDefaults, type IncomeClassification } from '@/store/preferencesStore'

/** Recorded investment outcomes only. Transfers and account values are not returns. */
export interface InvestmentReturnTransaction {
  type: string
  amount: number
  category: string
  subcategory?: string | null
  note?: string | null
}

export type InvestmentReturnKind =
  | 'dividendIncome'
  | 'interestIncome'
  | 'investmentProfit'
  | 'brokerFees'
  | 'investmentLoss'

export interface InvestmentReturnMetrics {
  dividendIncome: number
  interestIncome: number
  investmentProfit: number
  brokerFees: number
  investmentLoss: number
  totalIncome: number
  totalExpenses: number
  netProfitLoss: number
  eventCount: number
}

function incomeKind(text: string): InvestmentReturnKind | null {
  if (/\bdivid(?:end)?s?\b/i.test(text)) return 'dividendIncome'
  if (/\binterest\b|\bint\.|\bint\s+(?:cr|credit)\b/i.test(text)) return 'interestIncome'
  if (/\b(?:profits?|gains?|reali[sz]ed)\b/i.test(text)) return 'investmentProfit'
  return null
}

function costKind(text: string): InvestmentReturnKind | null {
  const lower = text.toLowerCase()
  const broker = ['broker', 'demat', 'trading', 'transaction'].some((word) => lower.includes(word))
  const fee = ['charge', 'fee'].some((word) => lower.includes(word))
  if (lower.includes('brokerage') || (broker && fee)) return 'brokerFees'
  if (!lower.includes('broker') && /\bloss(?:es)?\b|\bwrite\b/i.test(lower)) return 'investmentLoss'
  return null
}

/**
 * Default investment-income vocabulary (interest, dividends, capital gains,
 * mutual fund gains, returns), the backend `metric_rules._INVESTMENT_INCOME_RE`
 * twin. "returns" is plural only: "Deposit Return" is money coming back.
 */
const INVESTMENT_INCOME_PATTERN =
  /\b(?:interest|dividends?|capital[\s-]?gains?|mutual[\s-]?funds?[\s-]?gains?|returns)\b/i

/** Which income rows are investment income, resolved once per preference set. */
export interface InvestmentReturnRules {
  /** The user's investment-return keys, normalised `category::subcategory`. */
  readonly keys: ReadonlySet<string>
  /** Keyword fallback: on only while the user has not chosen their own list. */
  readonly useKeywords: boolean
  /** Keys the user filed under another income list; a keyword never re-claims them. */
  readonly otherKeys: ReadonlySet<string>
}

/** Backend `classification_key` twin: trimmed, lower-cased on both halves. */
const classificationKey = (category: string | null | undefined, subcategory: string | null | undefined): string =>
  `${(category ?? '').trim().toLowerCase()}::${(subcategory ?? '').trim().toLowerCase()}`

const keySet = (items: readonly string[]): Set<string> =>
  new Set(items.filter(Boolean).map((item) => {
    const [category, ...rest] = item.split('::')
    return classificationKey(category, rest.join('::'))
  }))

const EMPTY_CLASSIFICATION: IncomeClassification = { taxable: [], investmentReturns: [], nonTaxable: [], other: [] }

/**
 * The user's `investment_returns_categories` keys (case-insensitive whole key).
 * While that list is empty or still the shipped defaults, the default keywords
 * also count, on the category or subcategory and never the note.
 */
export function investmentReturnRules(
  classification: IncomeClassification = EMPTY_CLASSIFICATION,
): InvestmentReturnRules {
  const resolved = withIncomeClassificationDefaults(classification)
  const keys = keySet(resolved.investmentReturns)
  const shipped = keySet(withIncomeClassificationDefaults(EMPTY_CLASSIFICATION).investmentReturns)
  const useKeywords = keys.size === 0 || (keys.size === shipped.size && [...keys].every((key) => shipped.has(key)))
  return {
    keys,
    useKeywords,
    otherKeys: useKeywords
      ? keySet([...resolved.taxable, ...resolved.nonTaxable, ...resolved.other])
      : new Set(),
  }
}

let defaultRules: InvestmentReturnRules | null = null
const unconfiguredRules = (): InvestmentReturnRules => (defaultRules ??= investmentReturnRules())

function isInvestmentIncome(tx: InvestmentReturnTransaction, rules: InvestmentReturnRules): boolean {
  const key = classificationKey(tx.category, tx.subcategory)
  if (rules.keys.has(key)) return true
  if (!rules.useKeywords || rules.otherKeys.has(key)) return false
  return INVESTMENT_INCOME_PATTERN.test(tx.category) || INVESTMENT_INCOME_PATTERN.test(tx.subcategory ?? '')
}

/**
 * Exactly one bucket per row. Income membership comes from `rules`; the
 * subtype comes from the subcategory, then the category, and is a realised
 * profit when neither names interest or dividends. The note is never income
 * evidence.
 */
export function classifyInvestmentReturn(
  tx: InvestmentReturnTransaction,
  rules: InvestmentReturnRules = unconfiguredRules(),
): InvestmentReturnKind | null {
  if (tx.type === 'Income') {
    if (!isInvestmentIncome(tx, rules)) return null
    return incomeKind(tx.subcategory ?? '') ?? incomeKind(tx.category) ?? 'investmentProfit'
  }
  if (tx.type !== 'Expense') return null
  const category = tx.category.toLowerCase()
  if (!['investment', 'stock', 'trading'].some((word) => category.includes(word))) return null
  // Fee context can span fields, such as category "Trading" and subcategory "Charges".
  return costKind(tx.subcategory ?? '') ??
    costKind(tx.category) ??
    costKind(tx.note ?? '') ??
    costKind(`${tx.category} ${tx.subcategory ?? ''} ${tx.note ?? ''}`)
}

export function computeInvestmentMetrics(
  transactions: readonly InvestmentReturnTransaction[],
  rules: InvestmentReturnRules = unconfiguredRules(),
): InvestmentReturnMetrics {
  const totals: InvestmentReturnMetrics = {
    dividendIncome: 0,
    interestIncome: 0,
    investmentProfit: 0,
    brokerFees: 0,
    investmentLoss: 0,
    totalIncome: 0,
    totalExpenses: 0,
    netProfitLoss: 0,
    eventCount: 0,
  }
  for (const tx of transactions) {
    const kind = classifyInvestmentReturn(tx, rules)
    if (!kind) continue
    totals[kind] += Math.abs(tx.amount)
    totals.eventCount += 1
  }
  totals.totalIncome = totals.dividendIncome + totals.interestIncome + totals.investmentProfit
  totals.totalExpenses = totals.brokerFees + totals.investmentLoss
  totals.netProfitLoss = totals.totalIncome - totals.totalExpenses
  return totals
}

export function countRealisedEvents(
  transactions: readonly InvestmentReturnTransaction[],
  rules: InvestmentReturnRules = unconfiguredRules(),
): number {
  return computeInvestmentMetrics(transactions, rules).eventCount
}

export interface MonthlyInvestmentReturn {
  month: string
  income: number
  expenses: number
  net: number
  cumulative: number
}

/** Keep calendar keys and exact amounts in the domain result; format at the chart. */
export function groupInvestmentReturnsByMonth(
  transactions: readonly (InvestmentReturnTransaction & { date: string })[],
  rules: InvestmentReturnRules = unconfiguredRules(),
): MonthlyInvestmentReturn[] {
  const monthly: Record<string, { income: number; expenses: number }> = {}
  for (const tx of transactions) {
    const month = tx.date.substring(0, 7)
    monthly[month] ??= { income: 0, expenses: 0 }
    if (!classifyInvestmentReturn(tx, rules)) continue
    if (tx.type === 'Income') monthly[month].income += Math.abs(tx.amount)
    else monthly[month].expenses += Math.abs(tx.amount)
  }
  let cumulative = 0
  return Object.keys(monthly).sort((a, b) => a.localeCompare(b)).map((month) => {
    const { income, expenses } = monthly[month]
    const net = income - expenses
    cumulative += net
    return { month, income, expenses, net, cumulative }
  })
}
