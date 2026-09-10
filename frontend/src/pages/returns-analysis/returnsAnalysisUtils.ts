/** Presentation adapter for recorded investment outcomes, not market returns. */
import { formatMonthKey } from '@/lib/dateUtils'
import {
  groupInvestmentReturnsByMonth,
  type InvestmentReturnTransaction,
} from '@/lib/finance/investmentReturns'

export { computeInvestmentMetrics, countRealisedEvents } from '@/lib/finance/investmentReturns'
export type TxLike = InvestmentReturnTransaction

/** Format the shared monthly P&L series for the chart. */
export function groupTransactionsByMonth(
  transactions: readonly (InvestmentReturnTransaction & { date: string })[],
): Array<{ month: string; income: number; expenses: number; net: number; cumulative: number }> {
  return groupInvestmentReturnsByMonth(transactions).map((row) => ({
    month: formatMonthKey(row.month, { month: 'short', year: '2-digit' }),
    income: Math.round(row.income),
    expenses: Math.round(row.expenses),
    net: Math.round(row.net),
    cumulative: Math.round(row.cumulative),
  }))
}
