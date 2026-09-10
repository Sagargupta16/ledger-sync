import type React from 'react'

import { weekdayOf } from '@/lib/dateUtils'
import {
  meanRateSubtitle,
  meanVsTypicalSubtitle,
  typicalVsMeanSubtitle,
} from '@/lib/distribution'

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
      // JSON.parse is typed `any`; hold it at `unknown` so the `any` stops
      // flowing, then assert once. Deliberately NOT an Array.isArray guard: a
      // corrupted non-array cannot escape this function either way, because it
      // returns Set|null and never the parsed value. An object/number/bool has
      // no usable `length` (so the >=14 check is false) and then throws inside
      // `new Set(...)` into the catch below; a string is iterable and is
      // consumed character-wise. Both are pre-existing behaviour, and guarding
      // would silently change the string case.
      const parsed: unknown = JSON.parse(raw)
      const arr = parsed as string[]
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

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** Format a "YYYY-MM" period key as e.g. "Dec 2024". */
export function monthLabel(period: string): string {
  const [y, m] = period.split('-')
  return new Date(Number(y), Number(m) - 1).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  })
}

export type { SpendingDateRange as DateRange } from '@/lib/finance/spendingStatistics'

export interface Transaction {
  date: string
  amount: number
  type: string
  category?: string
  subcategory?: string
  to_account?: string
}

// Compatibility exports; calculation policies are shared by all consumers.
export {
  resolveSpanRange,
  computeDaysInRange,
  computeMonthsInRange,
  monthsCovered,
  medianSpendingDay,
  medianSpendingMonth,
} from '@/lib/finance/spendingStatistics'
export { medianOf as computeMedian } from '@/lib/distribution'

export function computeWeekendSplit(transactions: Transaction[]) {
  let weekend = 0
  let weekday = 0
  for (const t of transactions) {
    const day = weekdayOf(t.date)
    const amount = Math.abs(t.amount)
    if (day === 0 || day === 6) weekend += amount
    else weekday += amount
  }
  return { weekend, weekday }
}

export function computePeakDay(transactions: Transaction[]) {
  const spendingByDay = [0, 0, 0, 0, 0, 0, 0]
  for (const t of transactions) {
    spendingByDay[weekdayOf(t.date)] += Math.abs(t.amount)
  }
  const peakIndex = spendingByDay.indexOf(Math.max(...spendingByDay))
  return { name: DAY_NAMES[peakIndex], total: spendingByDay[peakIndex] }
}

export function ageOfMoneyLabel(days: number): string {
  if (days >= 30) return 'Healthy buffer'
  if (days >= 15) return 'Building runway'
  return 'Living paycheck to paycheck'
}

/**
 * Names the load AND the denominator it is a share of. The bare label was
 * unfalsifiable: 168.8% read "High fixed cost load" with nothing to say what the
 * percentage was of, so a wrong denominator was invisible to the reader.
 */
export function recurringCoverageLabel(pct: number): string {
  return `${fixedCostLoad(pct)} fixed cost load vs typical recent month's income`
}

function fixedCostLoad(pct: number): string {
  if (pct > 50) return 'High'
  if (pct > 30) return 'Moderate'
  return 'Low'
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
  // Match by substring, NOT an exact hardcoded category string. The category is
  // user-defined and varies ("Refund & Cashbacks" vs "Refunds & Cashbacks"), so
  // an exact match silently returned 0 cashback for real data that used the
  // plural spelling. A "cashback" subcategory under any refund/cashback category
  // is what we want; refunds (Product/Service Refunds, Deposit Return) are not
  // cashback and stay excluded.
  const cashbackTxs = allTransactions.filter(
    (t) =>
      t.type === 'Income' &&
      (t.subcategory ?? '').toLowerCase().includes('cashback'),
  )
  // "Shared" cashback passed on to others, matched by destination substring so
  // both "Cashback Shared" and "Transfer: X -> Cashback Shared" leg names count.
  const sharedTxs = allTransactions.filter(
    (t) => t.type === 'Transfer' && (t.to_account ?? '').toLowerCase().includes('cashback shared'),
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

export interface InsightDescriptor {
  icon: React.ComponentType<{ className?: string }>
  color: string
  bg: string
  title: string
  value: string
  subtitle?: string
}

export interface QuickInsightsParams {
  totalIncome: number
  totalExpenses: number
  netSavings: number
  savingsRate: number
  incomeChange: string
  expenseChange: string
  savingsChange: string
  ageOfMoney?: number | null
  daysOfBuffering?: number | null
  fixedCommitmentsMonthly: number
  fixedCount: number
  /**
   * Commitments as a share of a typical recent month's income, or `null` when no
   * recent-income baseline is available. Null withholds the card rather than
   * falling back to an all-time mean, which on a growing income overstates
   * coverage several-fold (real ledger: 168.8% against an honest 53.1%).
   */
  recurringCoverage: number | null
}

export interface FunFactsParams {
  topCategory?: [string, CategoryData] | [string, unknown]
  topIncomeSource: [string, number] | null
  netCashback: number
  cashbackCount: number
  biggestTransaction: { amount: number; category?: string }
  medianTransaction: number
  avgTransactionAmount: number
  avgDailySpending: number
  daysInRange: number
  weekendPercent: number
  weekendSpending: number
  weekdaySpending: number
  peakDay: { name: string; total: number }
  monthlyBurnRate: number
  monthsInRange: number
  /**
   * Median spend on the days money actually moved, and median spend in a
   * complete month. Both are `null` when the period series does not cover the
   * selected window, in which case the mean KPIs keep their plain denominator
   * subtitle instead of quoting a typical value computed off partial data.
   */
  medianSpendingDay: number | null
  medianSpendingMonth: number | null
  uniqueCategories: number
  uniqueSubcategories: number
  totalTransfers: number
  transferCount: number
  incomeExpenseRatio: number
  mostExpensiveMonth: { label: string; amount: number } | null
}

type Icon = React.ComponentType<{ className?: string }>

export function buildQuickInsights(
  p: QuickInsightsParams,
  icons: {
    TrendingUp: Icon
    TrendingDown: Icon
    DollarSign: Icon
    Percent: Icon
    Hourglass: Icon
    ShieldCheck: Icon
    Lock: Icon
    Repeat: Icon
  },
  formatCurrency: (n: number) => string,
): InsightDescriptor[] {
  const savingsRateSubtitle =
    p.totalIncome > 0
      ? `${formatCurrency(p.netSavings)} saved of ${formatCurrency(p.totalIncome)}`
      : 'No income recorded'

  const items: InsightDescriptor[] = [
    { icon: icons.TrendingUp, color: 'text-app-green', bg: 'bg-app-green/10', title: 'Total Income', value: formatCurrency(p.totalIncome), subtitle: p.incomeChange },
    { icon: icons.TrendingDown, color: 'text-app-red', bg: 'bg-app-red/10', title: 'Total Expenses', value: formatCurrency(Math.abs(p.totalExpenses)), subtitle: p.expenseChange },
    { icon: icons.DollarSign, color: 'text-app-blue', bg: 'bg-app-blue/10', title: 'Net Savings', value: formatCurrency(p.netSavings), subtitle: p.savingsChange },
    { icon: icons.Percent, color: 'text-app-purple', bg: 'bg-app-purple/10', title: 'Savings Rate', value: `${p.savingsRate.toFixed(1)}%`, subtitle: savingsRateSubtitle },
  ]

  if (p.ageOfMoney != null) {
    items.push({ icon: icons.Hourglass, color: 'text-app-indigo', bg: 'bg-app-indigo/10', title: 'Age of Money', value: `${p.ageOfMoney} days`, subtitle: ageOfMoneyLabel(p.ageOfMoney) })
  }
  if (p.daysOfBuffering != null) {
    items.push({ icon: icons.ShieldCheck, color: 'text-app-teal', bg: 'bg-app-teal/10', title: 'Days of Buffering', value: `${p.daysOfBuffering} days`, subtitle: 'Liquid accounts at current spending' })
  }
  if (p.fixedCommitmentsMonthly > 0) {
    items.push({ icon: icons.Lock, color: 'text-app-orange', bg: 'bg-app-orange/10', title: 'Fixed Commitments', value: formatCurrency(p.fixedCommitmentsMonthly), subtitle: `${p.fixedCount} active recurring` })
    // Coverage is a separate gate: the commitment total stands on its own, but the
    // ratio needs a recent-income denominator it may not have.
    if (p.recurringCoverage != null) {
      items.push({ icon: icons.Repeat, color: 'text-app-yellow', bg: 'bg-app-yellow/10', title: 'Recurring Coverage', value: `${p.recurringCoverage.toFixed(1)}%`, subtitle: recurringCoverageLabel(p.recurringCoverage) })
    }
  }
  return items
}

export function buildFunFacts(
  p: FunFactsParams,
  icons: {
    ShoppingBag: Icon
    Landmark: Icon
    Gift: Icon
    TrendingUp: Icon
    BarChart3: Icon
    Zap: Icon
    Calendar: Icon
    Clock: Icon
    Flame: Icon
    Layers: Icon
    Receipt: Icon
    ArrowLeftRight: Icon
    Scale: Icon
    CalendarRange: Icon
  },
  formatCurrency: (n: number) => string,
): InsightDescriptor[] {
  // Every "average" below is a mean, and on a real ledger the mean expense runs
  // ~10x the median (measured: 796.56 vs 76.00, with the top 1% of rows making
  // up 56.65% of all spend). So the median headlines the "typical" claims, the
  // mean stays where budget math needs it, and each subtitle names which one it
  // is showing plus the other number when the gap is wide enough to mislead.
  const medianSubtitle = typicalVsMeanSubtitle(
    p.avgTransactionAmount,
    p.medianTransaction,
    formatCurrency,
    { skewed: 'Typical spend. Skewed by big-ticket rows: mean is', even: 'Spending is fairly even' },
  )

  const dailySubtitle = meanRateSubtitle(
    p.avgDailySpending,
    p.medianSpendingDay,
    formatCurrency,
    { meanClause: `Total spend spread over ${p.daysInRange} days`, typicalNoun: 'spending day is' },
  )

  // Below one covered month the headline is a PACE extrapolated from a part
  // month, not a mean over months, so the clause says which. Silently rounding
  // the denominator up to 1.0 was the old behaviour and it understated the real
  // July pace by 12.9% on the real ledger.
  const burnClause =
    p.monthsInRange < 1
      ? `Pace from ${Math.round(p.monthsInRange * 100)}% of one month so far`
      : `Mean over ${p.monthsInRange.toFixed(1)} months`
  const burnSubtitle = meanRateSubtitle(
    p.monthlyBurnRate,
    p.medianSpendingMonth,
    formatCurrency,
    { meanClause: burnClause, typicalNoun: 'month is' },
  )

  const items: InsightDescriptor[] = [
    { icon: icons.ShoppingBag, color: 'text-app-purple', bg: 'bg-app-purple/10', title: 'Top Spending Category', value: p.topCategory ? p.topCategory[0] : 'N/A', subtitle: p.topCategory ? formatCurrency(Math.abs((p.topCategory[1] as CategoryData).total)) : '' },
    { icon: icons.Landmark, color: 'text-sky-400', bg: 'bg-sky-500/10', title: 'Top Income Source', value: p.topIncomeSource ? p.topIncomeSource[0] : 'N/A', subtitle: p.topIncomeSource ? formatCurrency(p.topIncomeSource[1]) : '' },
    { icon: icons.Gift, color: 'text-app-green', bg: 'bg-app-green/10', title: 'Net Cashback Earned', value: formatCurrency(p.netCashback), subtitle: `From ${p.cashbackCount} cashback transactions` },
    { icon: icons.TrendingUp, color: 'text-app-red', bg: 'bg-app-red/10', title: 'Biggest Transaction', value: formatCurrency(Math.abs(p.biggestTransaction?.amount || 0)), subtitle: p.biggestTransaction?.category || '' },
    { icon: icons.BarChart3, color: 'text-app-purple', bg: 'bg-app-purple/10', title: 'Median Transaction', value: formatCurrency(p.medianTransaction), subtitle: medianSubtitle },
    { icon: icons.Zap, color: 'text-app-yellow', bg: 'bg-app-yellow/10', title: 'Average Daily Spending', value: formatCurrency(p.avgDailySpending), subtitle: dailySubtitle },
    { icon: icons.Calendar, color: 'text-app-red', bg: 'bg-app-red/10', title: 'Weekend Spending', value: `${p.weekendPercent.toFixed(0)}%`, subtitle: `${formatCurrency(p.weekendSpending)} weekends vs ${formatCurrency(p.weekdaySpending)} weekdays` },
    { icon: icons.Clock, color: 'text-app-orange', bg: 'bg-app-orange/10', title: 'Peak Spending Day', value: p.peakDay.name, subtitle: `${formatCurrency(p.peakDay.total)} total on ${p.peakDay.name}s` },
    { icon: icons.Flame, color: 'text-app-orange', bg: 'bg-app-orange/10', title: 'Monthly Burn Rate', value: formatCurrency(p.monthlyBurnRate), subtitle: burnSubtitle },
    { icon: icons.Layers, color: 'text-app-teal', bg: 'bg-app-teal/10', title: 'Spending Diversity', value: `${p.uniqueCategories} categories`, subtitle: `Across ${p.uniqueSubcategories} subcategories` },
    { icon: icons.Receipt, color: 'text-app-teal', bg: 'bg-app-teal/10', title: 'Avg Transaction', value: formatCurrency(p.avgTransactionAmount), subtitle: meanVsTypicalSubtitle(p.avgTransactionAmount, p.medianTransaction, formatCurrency, 'Per transaction') },
    { icon: icons.ArrowLeftRight, color: 'text-app-indigo', bg: 'bg-app-indigo/10', title: 'Internal Transfers', value: formatCurrency(p.totalTransfers), subtitle: `${p.transferCount} transfers` },
    { icon: icons.Scale, color: 'text-app-blue', bg: 'bg-app-blue/10', title: 'Income vs Expense', value: `${p.incomeExpenseRatio.toFixed(2)}x`, subtitle: incomeExpenseRatioLabel(p.incomeExpenseRatio) },
  ]

  if (p.mostExpensiveMonth) {
    items.push({ icon: icons.CalendarRange, color: 'text-app-red', bg: 'bg-app-red/10', title: 'Most Expensive Month', value: p.mostExpensiveMonth.label, subtitle: formatCurrency(p.mostExpensiveMonth.amount) })
  }
  return items
}
