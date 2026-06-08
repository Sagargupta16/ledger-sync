import { MS_PER_DAY } from '@/lib/dateUtils'

/** Maps insight titles to widget keys used in Settings → Dashboard Widgets */
const TITLE_TO_WIDGET_KEY: Record<string, string> = {
  'Savings Rate': 'savings_rate',
  'Top Spending Category': 'top_spending',
  'Top Income Source': 'top_income',
  'Net Cashback Earned': 'cashback',
  'Total Transactions': 'total_transactions',
  'Biggest Transaction': 'biggest_transaction',
  'Median Transaction': 'median_transaction',
  'Average Daily Spending': 'daily_spending',
  'Weekend Spending': 'weekend_spending',
  'Peak Spending Day': 'peak_day',
  'Monthly Burn Rate': 'burn_rate',
  'Spending Diversity': 'spending_diversity',
  'Avg Transaction Amount': 'avg_transaction',
  'Total Internal Transfers': 'total_transfers',
  // New insights - always visible (not in legacy widget settings)
  'Total Income': 'total_income',
  'Total Expenses': 'total_expenses',
  'Net Savings': 'net_savings',
  'Age of Money': 'age_of_money',
  'Days of Buffering': 'days_of_buffering',
  'Fixed Commitments': 'fixed_commitments',
  'Recurring Coverage': 'recurring_coverage',
  'Income vs Expense': 'income_expense_ratio',
  'Most Expensive Month': 'most_expensive_month',
  'Total Tax Paid': 'total_tax_paid',
  'Effective Tax Rate': 'effective_tax_rate',
  'Highest Tax Year': 'highest_tax_year',
}

export function getVisibleWidgetKeys(): Set<string> | null {
  try {
    const raw = localStorage.getItem('ledger-sync-visible-widgets')
    if (raw) {
      const arr = JSON.parse(raw) as string[]
      // If most widgets are visible, treat as "no filter"
      if (arr.length >= 14) return null
      return new Set(arr)
    }
  } catch (e) { console.warn('[getVisibleWidgetKeys] Failed to read localStorage:', e) }
  return null // null = show all
}

/** Legacy widget keys that users may have toggled in Settings */
const LEGACY_WIDGET_KEYS = new Set([
  'savings_rate', 'top_spending', 'top_income', 'cashback',
  'total_transactions', 'biggest_transaction', 'median_transaction',
  'daily_spending', 'weekend_spending', 'peak_day', 'burn_rate',
  'spending_diversity', 'avg_transaction', 'total_transfers',
])

export function filterByVisibility<T extends { title: string }>(items: T[], visibleKeys: Set<string> | null): T[] {
  if (!visibleKeys) return items
  return items.filter((i) => {
    const key = TITLE_TO_WIDGET_KEY[i.title]
    if (!key || !LEGACY_WIDGET_KEYS.has(key)) return true
    return visibleKeys.has(key)
  })
}

export interface CategoryData {
  total: number
  count: number
  percentage: number
  subcategories: Record<string, number>
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export interface DateRange {
  start_date?: string
  end_date?: string
}

export interface Transaction {
  date: string
  amount: number
  type: string
  category?: string
  subcategory?: string
  to_account?: string
}

export function computeDaysInRange(dateRange: DateRange, transactions: Transaction[]): number {
  if (!dateRange.start_date || !dateRange.end_date) {
    if (transactions.length > 0) {
      const dates = transactions.map(t => new Date(t.date).getTime())
      const earliest = Math.min(...dates)
      const latest = Math.max(...dates)
      return Math.ceil((latest - earliest) / MS_PER_DAY) || 1
    }
    return 30
  }
  const start = new Date(dateRange.start_date)
  const end = new Date(dateRange.end_date)
  return Math.ceil((end.getTime() - start.getTime()) / MS_PER_DAY) || 1
}

export function computeMonthsInRange(dateRange: DateRange, transactions: Transaction[]): number {
  if (!dateRange.start_date || !dateRange.end_date) {
    if (transactions.length > 0) {
      const dates = transactions.map(t => new Date(t.date).getTime())
      const earliest = Math.min(...dates)
      const latest = Math.max(...dates)
      const days = Math.ceil((latest - earliest) / MS_PER_DAY)
      return Math.max(days / 30.44, 1)
    }
    return 1
  }
  const start = new Date(dateRange.start_date)
  const end = new Date(dateRange.end_date)
  const days = Math.ceil((end.getTime() - start.getTime()) / MS_PER_DAY)
  return Math.max(days / 30.44, 1)
}

export function computeMedian(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  }
  return sorted[mid]
}

export function computeWeekendSplit(transactions: Transaction[]) {
  let weekend = 0
  let weekday = 0
  for (const t of transactions) {
    const day = new Date(t.date).getDay()
    const amount = Math.abs(t.amount)
    if (day === 0 || day === 6) weekend += amount
    else weekday += amount
  }
  return { weekend, weekday }
}

export function computePeakDay(transactions: Transaction[]) {
  const spendingByDay = [0, 0, 0, 0, 0, 0, 0]
  for (const t of transactions) {
    spendingByDay[new Date(t.date).getDay()] += Math.abs(t.amount)
  }
  const peakIndex = spendingByDay.indexOf(Math.max(...spendingByDay))
  return { name: DAY_NAMES[peakIndex], total: spendingByDay[peakIndex] }
}

export function ageOfMoneyLabel(days: number): string {
  if (days >= 30) return 'Healthy buffer'
  if (days >= 15) return 'Building runway'
  return 'Living paycheck to paycheck'
}

export function recurringCoverageLabel(pct: number): string {
  if (pct > 50) return 'High fixed cost load'
  if (pct > 30) return 'Moderate fixed costs'
  return 'Low fixed costs'
}

export function incomeExpenseRatioLabel(ratio: number): string {
  if (ratio < 0.7) return 'Great! Spending well below income'
  if (ratio < 0.9) return 'Spending close to income'
  return 'Spending nearly all income'
}

export function computeTopByCategory(transactions: Transaction[]) {
  const byCat: Record<string, number> = {}
  for (const t of transactions) {
    const cat = t.category || 'Other'
    byCat[cat] = (byCat[cat] || 0) + Math.abs(t.amount)
  }
  return Object.entries(byCat).sort(([, a], [, b]) => b - a)[0] ?? null
}

export function computeMostExpensiveMonth(transactions: Transaction[]) {
  const byMonth: Record<string, number> = {}
  for (const t of transactions) {
    const key = t.date.slice(0, 7)
    byMonth[key] = (byMonth[key] || 0) + Math.abs(t.amount)
  }
  const entries = Object.entries(byMonth)
  if (entries.length === 0) return null
  const [monthKey, amount] = entries.reduce((max, cur) => cur[1] > max[1] ? cur : max, entries[0])
  const [y, m] = monthKey.split('-')
  const label = new Date(Number(y), Number(m) - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  return { label, amount }
}

export function computeNetCashback(allTransactions: Transaction[]) {
  const cashbackTxs = allTransactions.filter(
    (t) =>
      t.category === 'Refund & Cashbacks' &&
      t.type === 'Income' &&
      (t.subcategory === 'Credit Card Cashbacks' || t.subcategory === 'Other Cashbacks'),
  )
  const sharedTxs = allTransactions.filter(
    (t) => t.type === 'Transfer' && t.to_account === 'Cashback Shared',
  )
  const totalCashback = cashbackTxs.reduce((sum, t) => sum + Math.abs(t.amount), 0)
  const totalShared = sharedTxs.reduce((sum, t) => sum + Math.abs(t.amount), 0)
  return { netCashback: totalCashback - totalShared, cashbackCount: cashbackTxs.length }
}

export function fmtChange(v: number | undefined, label: string) {
  if (v == null) return ''
  const sign = v > 0 ? '+' : ''
  return `${sign}${v}% ${label}`
}
