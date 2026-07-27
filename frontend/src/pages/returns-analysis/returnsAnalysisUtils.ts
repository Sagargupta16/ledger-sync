/**
 * Pure helpers for Returns Analysis -- keyword-based investment income/cost
 * classification and monthly P&L grouping. No React, no data fetching; all
 * functions are deterministic and unit-testable.
 *
 * There is deliberately no CAGR/ROI helper here. `calculateCAGR` used to live in
 * this file, and its only caller fed it monthly TOTAL INCOME (salary) as the
 * begin/end values, so the "portfolio CAGR" it produced was a salary ratio. The
 * statements this app ingests carry cost basis only -- no NAV, no unit price --
 * so no rate of return is computable from them at all. Do not re-add one without
 * a real market-value input.
 */

import { formatMonthKey } from '@/lib/dateUtils'

export function isInvestmentIncome(lower: string): boolean {
  return lower.includes('dividend') || lower.includes('divid') ||
    lower.includes('interest') || lower.includes('int.') ||
    lower.includes('int cr') || lower.includes('int credit') ||
    lower.includes('profit') || lower.includes('gain') ||
    lower.includes('realized')
}

export function isBrokerFee(lower: string): boolean {
  return (lower.includes('broker') && (lower.includes('charge') || lower.includes('fee'))) ||
    lower.includes('brokerage') ||
    (lower.includes('demat') && lower.includes('charge')) ||
    (lower.includes('trading') && (lower.includes('charge') || lower.includes('fee'))) ||
    (lower.includes('transaction') && lower.includes('charge'))
}

export function isInvestmentLoss(lower: string): boolean {
  return !lower.includes('broker') && !lower.includes('brokerage') &&
    (lower.includes('loss') || lower.includes('write'))
}

export type TxLike = { type: string; amount: number; category: string; note?: string; subcategory?: string }

export function txText(tx: TxLike) { return `${tx.category} ${tx.note ?? ''} ${tx.subcategory ?? ''}`.toLowerCase() }

function matchesKeyword(tx: TxLike, type: string, test: (lower: string) => boolean, investOnly: boolean): boolean {
  if (tx.type !== type) return false
  const lower = txText(tx)
  if (investOnly) {
    const cat = tx.category.toLowerCase()
    if (!cat.includes('investment') && !cat.includes('stock') && !cat.includes('trading')) return false
  }
  return test(lower)
}

export function filterByKeyword(transactions: TxLike[], type: string, test: (lower: string) => boolean, investOnly = false): number {
  return transactions
    .filter((tx) => matchesKeyword(tx, type, test, investOnly))
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0)
}

/**
 * How many transactions actually booked investment income or cost in the window.
 *
 * Replaces the removed CAGR/ROI tiles with something the ledger can prove: the
 * P&L headline is a sum over N rows, and N tells the user whether that headline
 * rests on one stray fee or a real trading history.
 */
export function countRealisedEvents(transactions: TxLike[]): number {
  return transactions.filter(
    (tx) =>
      matchesKeyword(tx, 'Income', isInvestmentIncome, false) ||
      matchesKeyword(tx, 'Expense', isBrokerFee, true) ||
      matchesKeyword(tx, 'Expense', isInvestmentLoss, true),
  ).length
}

export function computeInvestmentMetrics(transactions: TxLike[]) {
  const dividendIncome = filterByKeyword(transactions, 'Income', l => l.includes('dividend') || l.includes('divid'))
  const interestIncome = filterByKeyword(transactions, 'Income', l => l.includes('interest') || l.includes('int.') || l.includes('int cr'))
  const investmentProfit = filterByKeyword(transactions, 'Income', l => l.includes('profit') || l.includes('gain') || l.includes('realized'))
  const brokerFees = filterByKeyword(transactions, 'Expense', isBrokerFee, true)
  const investmentLoss = filterByKeyword(transactions, 'Expense', isInvestmentLoss, true)
  const totalIncome = investmentProfit + dividendIncome + interestIncome
  const totalExpenses = investmentLoss + brokerFees
  return { dividendIncome, brokerFees, interestIncome, investmentProfit, investmentLoss, netProfitLoss: totalIncome - totalExpenses }
}

/** Group transactions by month for the combo chart (monthly net + cumulative). */
export function groupTransactionsByMonth(
  transactions: Array<{ date: string } & TxLike>,
): Array<{ month: string; income: number; expenses: number; net: number; cumulative: number }> {
  const monthly: Record<string, { income: number; expenses: number }> = {}
  for (const tx of transactions) {
    const monthKey = tx.date.substring(0, 7)
    if (!monthly[monthKey]) monthly[monthKey] = { income: 0, expenses: 0 }
    const lower = txText(tx)
    const cat = tx.category.toLowerCase()
    const amount = Math.abs(tx.amount)
    if (tx.type === 'Income' && isInvestmentIncome(lower)) monthly[monthKey].income += amount
    const isInvCat = cat.includes('investment') || cat.includes('stock') || cat.includes('trading')
    if (tx.type === 'Expense' && isInvCat && (isBrokerFee(lower) || isInvestmentLoss(lower))) monthly[monthKey].expenses += amount
  }
  const sorted = Object.keys(monthly).sort((a, b) => a.localeCompare(b))
  let cumulative = 0
  return sorted.map(m => {
    const net = monthly[m].income - monthly[m].expenses
    cumulative += net
    return {
      month: formatMonthKey(m, { month: 'short', year: '2-digit' }),
      income: Math.round(monthly[m].income),
      expenses: Math.round(monthly[m].expenses),
      net: Math.round(net),
      cumulative: Math.round(cumulative),
    }
  })
}
