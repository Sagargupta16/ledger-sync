import type React from 'react'

import {
  addMonthsToKey,
  daysInMonth,
  monthKeysBetween,
  MS_PER_DAY,
  weekdayOf,
} from '@/lib/dateUtils'
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

/**
 * The window the mean-rate divisors run on: the explicit filter when there is
 * one, else the data's own min/max span, with the END capped at today.
 *
 * The cap is the point of this helper. `max_date` comes off the rows uncapped and
 * a forward-dated accrual pushes it past now, so the elapsed period a rate is
 * quoted "per" grows while the numerator cannot. All-time is the shipped default
 * view and `getAnalyticsDateRange` returns `{null, null}` for it, so
 * `capEndDateAtToday` never runs on this path -- this is the only place it can be
 * applied. Measured on the real ledger on 2026-07-27: one row dated 2026-07-31
 * (an income accrual) stretched the all-time span to 2,769 days against the 2,765
 * elapsed, diluting Average Daily Spending 1,444.76 -> 1,442.67 and Monthly Burn
 * Rate 43,960.70 -> 43,898.37 on 3,994,751.41 of spend. Small only because that
 * row is four days out; a user with a year of forward-booked SIPs inflates the
 * divisor by the whole horizon while the numerator cannot follow.
 *
 * An explicit `end_date` is capped too: the filter presets already cap
 * themselves, so a future end can only arrive from a hand-picked custom range,
 * where the same dilution applies for the same reason.
 */
export function resolveSpanRange(
  dateRange: DateRange,
  dataSpan: { min_date?: string | null; max_date?: string | null } | undefined,
  today: string,
): DateRange {
  const end = dateRange.end_date ?? dataSpan?.max_date ?? undefined
  return {
    start_date: dateRange.start_date ?? dataSpan?.min_date ?? undefined,
    end_date: end && end.slice(0, 10) > today ? today : end,
  }
}

/**
 * Days spanned by a window, counting both endpoints.
 *
 * The endpoints are INCLUSIVE: the backend filters `date >= start AND
 * date <= end`, so the numerator these divisors serve (`total_spending`) already
 * contains both the first and the last day. Differencing the two dates alone
 * returns an exclusive span and drops one day from the denominator, which
 * inflated every mean by a full day's worth of spend -- measured on the real
 * ledger, June 2026 divided 108,508.01 by 29 and reported 3,741.66/day for a
 * 30-day month whose real rate is 3,616.93 (+3.45%), and the subtitle read
 * "spread over 29 days" for a month that has 30. February 2026 was +3.70%.
 */
function inclusiveDaySpan(startMs: number, endMs: number): number {
  return Math.max(Math.ceil((endMs - startMs) / MS_PER_DAY) + 1, 1)
}

export function computeDaysInRange(dateRange: DateRange, transactions: Transaction[]): number {
  if (!dateRange.start_date || !dateRange.end_date) {
    if (transactions.length > 0) {
      const dates = transactions.map(t => new Date(t.date).getTime())
      return inclusiveDaySpan(Math.min(...dates), Math.max(...dates))
    }
    return 30
  }
  const start = new Date(dateRange.start_date)
  const end = new Date(dateRange.end_date)
  return inclusiveDaySpan(start.getTime(), end.getTime())
}

/**
 * How many calendar months a window covers, counting a partial month as the
 * fraction of ITS OWN month that is inside the window.
 *
 * Two defects this replaces, both of which pushed Monthly Burn Rate the wrong
 * way, and both measured on the real ledger on 2026-07-27:
 *
 * 1. `Math.max(days / 30.44, 1)` floored a partial month at a whole one. The
 *    monthly view (July capped at today, 27 of 31 days) billed 27 days as 1.0000
 *    months and published a burn rate of 107,651.65 where the pace those 27 days
 *    set is 123,600.04 -- a 12.9% understatement, worst on the 1st of the month
 *    and self-correcting only on the 31st. The same floor divided the
 *    recurring-coverage income denominator by 1.0 instead of 0.871, making fixed
 *    commitments look like a larger share of income than they are.
 *
 * 2. The 30.44-day average month was wrong in the other direction for COMPLETE
 *    months of any length but 30.44. A finished 30-day June came out 0.9855
 *    months and reported 110,099.46 against a real June spend of 108,508.01;
 *    a 28-day February reported 106,483.19 against 97,947.74 (+8.7%). A month is
 *    one month regardless of how many days it holds, so the fraction is taken per
 *    month against that month's own length.
 *
 * Guarded at a small positive floor so a same-day window cannot divide by zero.
 */
export function monthsCovered(startKey: string, endKey: string): number {
  const start = startKey.slice(0, 10)
  const end = endKey.slice(0, 10)
  if (end < start) return monthsCovered(end, start)

  let months = 0
  // Shared month walk (`@/lib/dateUtils`), so the December wrap has one owner
  // rather than a copy here and another in `spendingAnalysisUtils`.
  for (const monthKey of monthKeysBetween(start, end)) {
    const total = daysInMonth(monthKey)
    const firstDay = monthKey === start.slice(0, 7) ? Number(start.slice(8, 10)) : 1
    const lastDay = monthKey === end.slice(0, 7) ? Number(end.slice(8, 10)) : total
    months += (lastDay - firstDay + 1) / total
  }
  // A single day is a real fraction of a month, not zero and not a whole one.
  return Math.max(months, 1 / 31)
}

export function computeMonthsInRange(dateRange: DateRange, transactions: Transaction[]): number {
  if (!dateRange.start_date || !dateRange.end_date) {
    if (transactions.length > 0) {
      const keys = transactions.map((t) => t.date.slice(0, 10))
      return monthsCovered(
        keys.reduce((min, k) => (k < min ? k : min), keys[0]),
        keys.reduce((max, k) => (k > max ? k : max), keys[0]),
      )
    }
    return 1
  }
  return monthsCovered(dateRange.start_date, dateRange.end_date)
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

/**
 * Median spend on the days money actually moved, from a daily rollup series.
 *
 * Zero-spend days are dropped on purpose: including them answers "what does a
 * random calendar day cost", not "what does a typical spending day cost". On the
 * real ledger that distinction is stark -- 1,389 of the 2,769 calendar days in
 * the span have no expense at all, so an every-calendar-day median is 0.00.
 * Restricting to the 1,380 active days in this series gives 404.07 against a
 * 2,872.42 mean.
 *
 * Returns `null` when the series does not cover the requested window, so the
 * caller falls back to the plain mean subtitle instead of quoting a median
 * measured over the wrong period. `dailySummaries` is capped server-side (1,500
 * most recent days), which makes that check load-bearing for long histories.
 */
export function medianSpendingDay(
  rows: readonly { date: string; expense: number }[] | undefined,
  range: DateRange,
): number | null {
  if (!rows?.length) return null
  // The coverage check the "typical day" claim rests on. `daily-summaries` is
  // capped server-side (1,500 most recent days) and the cap silently truncates
  // the OLDEST days, so a window that starts before the first row returned is
  // only partly covered and its median describes a different period than the
  // label promises. Measured on the real ledger (1,519 stored days, so the cap
  // drops 2019-01-01..2019-06-08): the yearly-2019 window reads a typical day of
  // 53.00 against a true 81.50 (-35.0%), and FY 2019-20 reads 72.00 against
  // 91.50 (-21.3%). Returning null degrades to the mean-only subtitle, which is
  // the documented contract, instead of quoting a wrong number confidently.
  const earliestCovered = rows.reduce((min, r) => (r.date < min ? r.date : min), rows[0].date)
  if (range.start_date && range.start_date < earliestCovered) return null
  const inRange = rows.filter(
    (r) =>
      (!range.start_date || r.date >= range.start_date) &&
      (!range.end_date || r.date <= range.end_date),
  )
  const spendingDays = inRange.map((r) => Math.abs(r.expense)).filter((v) => v > 0)
  if (spendingDays.length === 0) return null
  return computeMedian(spendingDays)
}

/**
 * Median spend in a complete CALENDAR month, from a monthly aggregation map.
 *
 * The month in progress is excluded because a partial month always reads low
 * and would drag the "typical month" claim down -- the same reason Copilot
 * Money leaves the current month out of its average monthly spend
 * (https://help.copilot.money/en/articles/6918427-understanding-key-metrics-for-spending).
 * Returns `null` below two complete months, where a median is not meaningful.
 *
 * A month you spent NOTHING in stays in the median, because it is still a month.
 * This matters for consistency, not just for correctness on its own: the mean
 * beside it (`monthlyBurnRate`, whose divisor is `monthsCovered`) counts every
 * calendar month in the window, and both halves render through one
 * `meanRateSubtitle` template. Filtering `v > 0` here shipped two different
 * definitions of "typical month is X" -- the sibling
 * `monthlySpendShape.median` on the Expense Analysis page keeps zeros, so the
 * same phrase disagreed across pages. Reproduced this session on four calendar
 * months with spend in two (10,000 / 0 / 0 / 30,000): a 4-month divisor, mean
 * 10,000, and a typical month of 20,000 here against 5,000 there. The zeros are
 * only implicit ones when the rollup omits the key entirely, which is why the
 * span is reconstructed from the covered months rather than read off
 * `Object.keys`.
 */
export function medianSpendingMonth(
  monthly: Record<string, { expense?: number }> | undefined,
  now: Date = new Date(),
): number | null {
  if (!monthly) return null
  const cutoff = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const complete = Object.entries(monthly).filter(([key]) => key < cutoff)
  if (complete.length === 0) return null
  const byMonth = new Map(complete.map(([key, m]) => [key, Math.abs(m.expense ?? 0)]))
  const keys = [...byMonth.keys()].sort((a, b) => a.localeCompare(b))
  // Zero-fill the gaps the rollup left out entirely, so a month with no rows and
  // a month with a 0 total are counted the same way.
  const totals = monthKeysInclusive(keys[0], keys[keys.length - 1]).map(
    (key) => byMonth.get(key) ?? 0,
  )
  if (totals.length < 2) return null
  return computeMedian(totals)
}

/**
 * Every "YYYY-MM" from `first` to `last` inclusive, gaps filled in.
 *
 * Stepped with `addMonthsToKey`, which clamps rather than overflowing -- the
 * `setMonth` idiom turns 31 Jan + 1 month into 3 March and would skip a calendar
 * month out of the divisor. Anchored on day 01 so the clamp never has to fire.
 */
function monthKeysInclusive(first: string, last: string): string[] {
  const keys: string[] = []
  let cursor = `${first}-01`
  for (let guard = 0; guard < 1200 && cursor.slice(0, 7) <= last; guard++) {
    keys.push(cursor.slice(0, 7))
    cursor = addMonthsToKey(cursor, 1)
  }
  return keys
}

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
  const load = pct > 50 ? 'High' : pct > 30 ? 'Moderate' : 'Low'
  return `${load} fixed cost load vs typical recent month's income`
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
