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

const NON_RETURN_INCOME = [
  /\b(?:salary|stipend|bonus|bonuses|rsu|rsus|vesting)\b/i,
  /\b(?:contribution|contributions|redemption|redemptions|withdrawal|withdrawals|principal)\b/i,
  /\bsale proceeds\b|\bunreali[sz]ed\b/i,
]

function isNonReturnIncome(text: string): boolean {
  return NON_RETURN_INCOME.some((pattern) => pattern.test(text))
}

/**
 * Exactly one bucket per row. Explicit subcategory/category beats note fallback,
 * so "Interest" with a note saying "realized interest" is still one interest event.
 */
export function classifyInvestmentReturn(
  tx: InvestmentReturnTransaction,
): InvestmentReturnKind | null {
  if (tx.type === 'Income') {
    const classification = `${tx.category} ${tx.subcategory ?? ''}`
    if (isNonReturnIncome(classification)) return null
    const explicit = incomeKind(tx.subcategory ?? '') ?? incomeKind(tx.category)
    if (explicit) return explicit
    const note = tx.note ?? ''
    return isNonReturnIncome(note) ? null : incomeKind(note)
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
    const kind = classifyInvestmentReturn(tx)
    if (!kind) continue
    totals[kind] += Math.abs(tx.amount)
    totals.eventCount += 1
  }
  totals.totalIncome = totals.dividendIncome + totals.interestIncome + totals.investmentProfit
  totals.totalExpenses = totals.brokerFees + totals.investmentLoss
  totals.netProfitLoss = totals.totalIncome - totals.totalExpenses
  return totals
}

export function countRealisedEvents(transactions: readonly InvestmentReturnTransaction[]): number {
  return computeInvestmentMetrics(transactions).eventCount
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
): MonthlyInvestmentReturn[] {
  const monthly: Record<string, { income: number; expenses: number }> = {}
  for (const tx of transactions) {
    const month = tx.date.substring(0, 7)
    monthly[month] ??= { income: 0, expenses: 0 }
    if (!classifyInvestmentReturn(tx)) continue
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
