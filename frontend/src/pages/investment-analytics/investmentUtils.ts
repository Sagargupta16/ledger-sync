import { rawColors } from '@/constants/colors'
import { addDaysToKey } from '@/lib/dateUtils'

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
  tx: {
    type: string
    to_account?: string
    from_account?: string
    account?: string
    amount: number
  },
  investmentAccounts: string[],
  accountToCategory: Record<string, InvestmentCategory>,
  byAccount: Record<string, number>,
  byCategory: Record<InvestmentCategory, number>,
) {
  if (tx.type === 'Transfer' && investmentAccounts.includes(tx.to_account ?? '')) {
    const toAccount = tx.to_account ?? ''
    byAccount[toAccount] = (byAccount[toAccount] || 0) + tx.amount
    const category = accountToCategory[toAccount] || 'Mutual Funds'
    byCategory[category] += tx.amount
  }
  if (tx.type === 'Transfer' && investmentAccounts.includes(tx.from_account ?? '')) {
    const fromAccount = tx.from_account ?? ''
    byAccount[fromAccount] = (byAccount[fromAccount] || 0) - tx.amount
    const category = accountToCategory[fromAccount] || 'Mutual Funds'
    byCategory[category] -= tx.amount
  }
  if (tx.type === 'Income' && investmentAccounts.includes(tx.account ?? '')) {
    const account = tx.account ?? ''
    byAccount[account] = (byAccount[account] || 0) + tx.amount
    const category = accountToCategory[account] || 'Mutual Funds'
    byCategory[category] += tx.amount
  }
  if (tx.type === 'Expense' && investmentAccounts.includes(tx.account ?? '')) {
    const account = tx.account ?? ''
    byAccount[account] = (byAccount[account] || 0) - tx.amount
    const category = accountToCategory[account] || 'Mutual Funds'
    byCategory[category] -= tx.amount
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

type TransactionLike = {
  type: string
  category: string
  note?: string
  subcategory?: string
  amount: number
}

export function computeNetInvestmentPL(transactions: TransactionLike[]): number {
  const txText = (tx: TransactionLike) =>
    `${tx.category} ${tx.note ?? ''} ${tx.subcategory ?? ''}`.toLowerCase()

  const filterSum = (type: string, test: (l: string) => boolean, investOnly = false) =>
    transactions
      .filter((tx) => {
        if (tx.type !== type) return false
        const lower = txText(tx)
        if (investOnly) {
          const cat = tx.category.toLowerCase()
          if (!cat.includes('investment') && !cat.includes('stock') && !cat.includes('trading'))
            return false
        }
        return test(lower)
      })
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0)

  const dividendIncome = filterSum('Income', (l) => l.includes('dividend') || l.includes('divid'))
  const interestIncome = filterSum(
    'Income',
    (l) => l.includes('interest') || l.includes('int.') || l.includes('int cr'),
  )
  const investmentProfit = filterSum(
    'Income',
    (l) => l.includes('profit') || l.includes('gain') || l.includes('realized'),
  )
  const brokerFees = filterSum(
    'Expense',
    (l) =>
      (l.includes('broker') && (l.includes('charge') || l.includes('fee'))) ||
      l.includes('brokerage') ||
      (l.includes('demat') && l.includes('charge')) ||
      (l.includes('trading') && (l.includes('charge') || l.includes('fee'))) ||
      (l.includes('transaction') && l.includes('charge')),
    true,
  )
  const investmentLoss = filterSum(
    'Expense',
    (l) =>
      !l.includes('broker') &&
      !l.includes('brokerage') &&
      (l.includes('loss') || l.includes('write')),
    true,
  )

  return investmentProfit + dividendIncome + interestIncome - (investmentLoss + brokerFees)
}
