/**
 * Pure helpers for Returns Analysis -- keyword-based investment income/cost
 * classification, CAGR, and monthly P&L grouping. No React, no data fetching;
 * all functions are deterministic and unit-testable.
 */

import { formatMonthKey } from '@/lib/dateUtils'

export const calculateCAGR = (endingValue: number, beginningValue: number, years: number): number => {
  if (beginningValue <= 0 || years <= 0) return 0
  return (Math.pow(endingValue / beginningValue, 1 / years) - 1) * 100
}

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

export function txText(tx: TxLike) { return `${tx.category} ${tx.note || ''} ${tx.subcategory || ''}`.toLowerCase() }

export function filterByKeyword(transactions: TxLike[], type: string, test: (lower: string) => boolean, investOnly = false): number {
  return transactions
    .filter((tx) => {
      if (tx.type !== type) return false
      const lower = txText(tx)
      if (investOnly) {
        const cat = tx.category.toLowerCase()
        if (!cat.includes('investment') && !cat.includes('stock') && !cat.includes('trading')) return false
      }
      return test(lower)
    })
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0)
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
