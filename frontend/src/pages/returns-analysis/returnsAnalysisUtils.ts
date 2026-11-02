/** Presentation adapter for recorded investment outcomes, not market returns. */
import { formatMonthKey } from '@/lib/dateUtils'
import {
  groupInvestmentReturnsByMonth,
  type InvestmentReturnRules,
  type InvestmentReturnTransaction,
} from '@/lib/finance/investmentReturns'

export { computeInvestmentMetrics } from '@/lib/finance/investmentReturns'

const toPaise = (value: number) => Math.round(value * 100) / 100

/** Format the shared monthly P&L series for the chart. */
export function groupTransactionsByMonth(
  transactions: readonly (InvestmentReturnTransaction & { date: string })[],
  rules?: InvestmentReturnRules,
): Array<{ month: string; income: number; expenses: number; net: number; cumulative: number }> {
  return groupInvestmentReturnsByMonth(transactions, rules).map((row) => ({
    month: formatMonthKey(row.month, { month: 'short', year: '2-digit' }),
    income: toPaise(row.income),
    expenses: toPaise(row.expenses),
    net: toPaise(row.net),
    cumulative: toPaise(row.cumulative),
  }))
}
