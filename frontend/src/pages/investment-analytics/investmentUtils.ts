import { rawColors } from '@/constants/colors'
import { addDaysToKey } from '@/lib/dateUtils'
import {
  investmentAccountDeltas,
  type InvestmentAccountTest,
  type InvestmentFlowTransaction,
} from '@/lib/finance/investmentFlows'
import {
  computeInvestmentMetrics,
  type InvestmentReturnTransaction,
} from '@/lib/finance/investmentReturns'

import {
  applyDaySnapshot,
  buildDailyAccountSnapshots,
  investmentAccountTest,
  selectInvestmentTransactions,
  type GrowthTransaction,
} from './dailyAccountBalances'

export const INVESTMENT_CATEGORIES = ['FD/Bonds', 'Mutual Funds', 'PPF/EPF', 'Stocks'] as const
export type InvestmentCategory = (typeof INVESTMENT_CATEGORIES)[number]

export const CATEGORY_COLORS: Record<InvestmentCategory, string> = {
  'FD/Bonds': rawColors.app.pink,
  'Mutual Funds': rawColors.app.purple,
  'PPF/EPF': rawColors.app.orange,
  Stocks: rawColors.app.green,
}

/** Map investment types from preferences to our 4 categories. */
export function mapToCategory(investmentType: string): InvestmentCategory {
  const type = investmentType.toLowerCase().replaceAll(/[_\s]/g, '')
  if (
    type === 'stocks' ||
    type === 'stock' ||
    type.includes('equity') ||
    type.includes('share') ||
    type.includes('demat') ||
    type.includes('rsu')
  ) {
    return 'Stocks'
  }
  if (
    type === 'fixeddeposits' ||
    type === 'fd' ||
    type.includes('bond') ||
    type.includes('deposit')
  ) {
    return 'FD/Bonds'
  }
  if (
    type === 'ppfepf' ||
    type === 'ppf' ||
    type === 'epf' ||
    type.includes('provident') ||
    type.includes('nps') ||
    type.includes('pension')
  ) {
    return 'PPF/EPF'
  }
  if (
    type === 'mutualfunds' ||
    type === 'mf' ||
    type.includes('fund') ||
    type.includes('mutual')
  ) {
    return 'Mutual Funds'
  }
  return 'Mutual Funds'
}

export function processInvestmentTransaction(
  tx: InvestmentFlowTransaction,
  isInvestment: InvestmentAccountTest,
  accountToCategory: Record<string, InvestmentCategory>,
  byAccount: Record<string, number>,
  byCategory: Record<InvestmentCategory, number>,
) {
  for (const { account, amount } of investmentAccountDeltas(tx, isInvestment)) {
    byAccount[account] = (byAccount[account] || 0) + amount
    const category = accountToCategory[account] || 'Mutual Funds'
    byCategory[category] += amount
  }
}

/** One forward-filled day of the stacked growth chart. */
export type GrowthPoint = Record<string, string | number>

export type { GrowthTransaction }

/**
 * Sum the forward-filled per-account balances into the four chart categories.
 *
 * Totals are NOT clamped at zero. A running cumulative of contributions minus
 * withdrawals legitimately goes negative when an account is drawn down past what
 * this ledger recorded going in (a holding opened before the ledger starts, or a
 * transfer mis-classified upstream). Clamping hid that at the exact moment the
 * chart should show it, and made the stack disagree with every other total on
 * the page.
 */
function categoryTotalsFor(
  lastKnown: Record<string, number>,
  investmentAccounts: readonly string[],
  accountToCategory: Record<string, InvestmentCategory>,
): Record<InvestmentCategory, number> {
  const categoryTotals: Record<InvestmentCategory, number> = {
    'FD/Bonds': 0,
    'Mutual Funds': 0,
    'PPF/EPF': 0,
    Stocks: 0,
  }
  for (const account of investmentAccounts) {
    categoryTotals[accountToCategory[account] || 'Mutual Funds'] += lastKnown[account]
  }
  return categoryTotals
}

/**
 * Build the forward-filled daily investment-value series for the stacked
 * growth chart: one point per calendar day between the first and last
 * investment transaction, each carrying a per-category total.
 *
 * Extracted from `useInvestmentAnalytics` so the running-balance rules are
 * testable without mounting the hook's three queries. The per-account half of
 * those rules, and the defects each guard exists to prevent, live in
 * `./dailyAccountBalances`.
 */
export function buildDailyGrowthSeries(
  transactions: readonly GrowthTransaction[],
  investmentAccounts: readonly string[],
  accountToCategory: Record<string, InvestmentCategory>,
): GrowthPoint[] {
  const isInvestment = investmentAccountTest(investmentAccounts)
  const investmentTransactions = selectInvestmentTransactions(transactions, isInvestment)
  if (investmentTransactions.length === 0) return []

  const snapshotMap = buildDailyAccountSnapshots(
    investmentTransactions,
    investmentAccounts,
    isInvestment,
  )
  if (snapshotMap.size === 0) return []

  const days = [...snapshotMap.keys()]
  const firstDay = days[0]
  const lastDay = days.at(-1) as string

  const lastKnown: Record<string, number> = {}
  for (const acc of investmentAccounts) lastKnown[acc] = 0

  const series: GrowthPoint[] = []
  // Key-space day stepping: `new Date(key)` + `toISOString()` reintroduced the
  // UTC/local mix this file used to have, which dropped or duplicated the
  // boundary day for any user east of UTC.
  for (let date = firstDay; date <= lastDay; date = addDaysToKey(date, 1)) {
    const snapshot = snapshotMap.get(date)
    if (snapshot) applyDaySnapshot(lastKnown, snapshot, investmentAccounts)

    const categoryTotals = categoryTotalsFor(lastKnown, investmentAccounts, accountToCategory)
    const point: GrowthPoint = { date, fullDate: date }
    for (const cat of INVESTMENT_CATEGORIES) point[cat] = categoryTotals[cat]
    series.push(point)
  }

  return series
}

export function computeNetInvestmentPL(transactions: readonly InvestmentReturnTransaction[]): number {
  return computeInvestmentMetrics(transactions).netProfitLoss
}
