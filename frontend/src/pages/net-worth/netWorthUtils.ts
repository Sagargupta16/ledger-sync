import { rawColors } from '@/constants/colors'

/** Category display configuration */
export const CATEGORY_CONFIG: Record<string, { label: string; color: string }> = {
  'Cash & Wallets': { label: 'Cash & Wallets', color: rawColors.app.green },
  'Bank Accounts': { label: 'Bank Accounts', color: rawColors.app.blue },
  Investments: { label: 'Investments', color: rawColors.app.purple },
  'Loans/Lended': { label: 'Loans/Lended', color: rawColors.app.red },
  'Credit Cards': { label: 'Credit Cards', color: rawColors.app.orange },
  cashbank: { label: 'Cash & Bank', color: rawColors.app.blue },
  invested: { label: 'Investments', color: rawColors.app.purple },
  lended: { label: 'Lended', color: rawColors.app.teal },
  liability: { label: 'Liabilities', color: rawColors.app.red },
  other: { label: 'Other', color: rawColors.text.tertiary },
}

/** Classify an account based on classifications map, investment mappings, or name heuristics. */
export function resolveAccountType(
  accountName: string,
  classifications: Record<string, string>,
  investmentMappings: Record<string, unknown>,
): string {
  if (classifications[accountName]) {
    if (classifications[accountName] === 'Investments') return 'Investments'
    if (classifications[accountName] === 'Cash' || classifications[accountName] === 'Other Wallets')
      return 'Cash & Wallets'
    return classifications[accountName]
  }
  if (investmentMappings[accountName]) return 'Investments'
  const name = accountName.toLowerCase()
  if (name.includes('credit') || name.includes('card')) return 'Credit Cards'
  if (name.includes('bank')) return 'Bank Accounts'
  if (name.includes('cash') || name.includes('wallet')) return 'Cash & Wallets'
  return 'Other'
}

/** Classify an account into a display category for grouping. */
export function resolveAccountCategory(
  accountName: string,
  classifications: Record<string, string>,
  investmentMappings: Record<string, unknown>,
): string {
  const classification = classifications[accountName]
  if (classification) {
    switch (classification) {
      case 'Cash':
      case 'Other Wallets':
        return 'Cash & Wallets'
      case 'Bank Accounts':
        return 'Bank Accounts'
      case 'Investments':
        return 'Investments'
      case 'Credit Cards':
        return 'Credit Cards'
      case 'Loans':
      case 'Loans/Lended':
        return 'Loans/Lended'
      default:
        return classification
    }
  }
  if (investmentMappings[accountName]) return 'Investments'
  const name = accountName.toLowerCase()
  if (name.includes('credit') || name.includes('card')) return 'Credit Cards'
  if (name.includes('bank')) return 'Bank Accounts'
  if (name.includes('cash') || name.includes('wallet')) return 'Cash & Wallets'
  if (name.includes('loan') || name.includes('emi') || name.includes('lend')) return 'Loans/Lended'
  return 'Other'
}

/** Compute daily cumulative net worth from transactions. */
export function computeNetWorthTimeSeries(
  transactions: Array<{ date: string; type: string; amount: number }>,
  allCategories: string[],
  categoryProportions: Record<string, number>,
): Array<Record<string, number | string>> {
  if (!transactions.length) return []

  const dailyMap: Record<string, { income: number; expense: number }> = {}
  for (const tx of transactions) {
    const day = tx.date.substring(0, 10)
    if (!dailyMap[day]) dailyMap[day] = { income: 0, expense: 0 }
    if (tx.type === 'Income') dailyMap[day].income += tx.amount
    else if (tx.type === 'Expense') dailyMap[day].expense += tx.amount
  }

  const sortedDays = Object.entries(dailyMap).sort(([a], [b]) => a.localeCompare(b))
  let cumNW = 0
  let cumIncome = 0
  let cumExpense = 0

  return sortedDays.map(([date, { income, expense }]) => {
    const flow = income - expense
    cumNW += flow
    cumIncome += income
    cumExpense += expense
    const positiveNW = Math.max(cumNW, 0)

    const point: Record<string, number | string> = {
      date,
      netWorth: cumNW,
      dailyFlow: flow,
      cumulativeIncome: cumIncome,
      cumulativeExpenses: cumExpense,
    }

    allCategories.forEach((cat) => {
      point[cat] = positiveNW * (categoryProportions[cat] || 0)
    })

    return point
  })
}

export function ariaSort(
  activeKey: string | null,
  column: string,
  dir: 'asc' | 'desc',
): 'ascending' | 'descending' | 'none' {
  if (activeKey !== column) return 'none'
  return dir === 'asc' ? 'ascending' : 'descending'
}
