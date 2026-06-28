import { rawColors } from '@/constants/colors'

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
  if (tx.type === 'Transfer' && investmentAccounts.includes(tx.to_account || '')) {
    const toAccount = tx.to_account || ''
    byAccount[toAccount] = (byAccount[toAccount] || 0) + tx.amount
    const category = accountToCategory[toAccount] || 'Mutual Funds'
    byCategory[category] += tx.amount
  }
  if (tx.type === 'Transfer' && investmentAccounts.includes(tx.from_account || '')) {
    const fromAccount = tx.from_account || ''
    byAccount[fromAccount] = (byAccount[fromAccount] || 0) - tx.amount
    const category = accountToCategory[fromAccount] || 'Mutual Funds'
    byCategory[category] -= tx.amount
  }
  if (tx.type === 'Income' && investmentAccounts.includes(tx.account || '')) {
    const account = tx.account || ''
    byAccount[account] = (byAccount[account] || 0) + tx.amount
    const category = accountToCategory[account] || 'Mutual Funds'
    byCategory[category] += tx.amount
  }
  if (tx.type === 'Expense' && investmentAccounts.includes(tx.account || '')) {
    const account = tx.account || ''
    byAccount[account] = (byAccount[account] || 0) - tx.amount
    const category = accountToCategory[account] || 'Mutual Funds'
    byCategory[category] -= tx.amount
  }
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
