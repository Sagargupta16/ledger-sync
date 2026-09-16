import { toLocalDateKey } from '@/lib/dateUtils'
import { resolveAnalysisPeriod, resolveEarningStart } from '@/lib/finance/analysisPeriod'
import type { Transaction } from '@/types'

import { classifyTransaction, computeAnalysis, createEmptyBucket } from './healthScoreAnalysis'
import type { BalancePosition, MonthlyBucket } from './healthScoreTypes'

/** Keep recent cashflow and lifetime balance proxies as separate inputs. */
export function computeCurrentHealth(
  transactions: readonly Transaction[],
  isInvestmentAccount: (name: string) => boolean,
  {
    earningStartDate,
    fixedCategories,
    balances = null,
    now = new Date(),
  }: {
    earningStartDate?: string | null
    fixedCategories?: Set<string>
    balances?: BalancePosition | null
    now?: Date
  } = {},
) {
  const today = toLocalDateKey(now)
  const historical = transactions.filter((tx) => tx.date.slice(0, 10) <= today)
  if (historical.length < 10) return null
  const earningStart = resolveEarningStart(earningStartDate, historical, now)
  const period = resolveAnalysisPeriod(historical.map((tx) => tx.date.slice(0, 7)), {
    earningStartDate: earningStart.date, recentMonths: 24, now,
  })
  if (period.months.length < 3) return null

  const monthly: Record<string, MonthlyBucket> = Object.fromEntries(
    period.months.map((month) => [month, createEmptyBucket()]),
  )
  const lifetime = createEmptyBucket()
  for (const tx of historical) {
    classifyTransaction(tx, lifetime, isInvestmentAccount, fixedCategories)
    const date = tx.date.slice(0, 10)
    if (date < period.startDate! || date > period.endDate!) continue
    classifyTransaction(tx, monthly[date.slice(0, 7)], isInvestmentAccount, fixedCategories)
  }
  const balanceFlowTotals = {
    cumulativeNetSavings: lifetime.income - lifetime.expense,
    netInvestments: lifetime.investmentInflow - lifetime.investmentOutflow,
    totalDebtOutstanding: lifetime.debt,
  }
  return {
    analysis: computeAnalysis(period.months, monthly, balances, balanceFlowTotals),
    period,
    earningStart,
  }
}
