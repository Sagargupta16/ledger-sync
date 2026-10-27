/**
 * Demo ports of the backend's baseline anomaly detectors, run over the demo
 * transactions: high-expense months and single expenses
 * (`core/analytics/anomaly_detectors.py`) and large transfers
 * (`anomaly_baselines.py`); unusual category months are in
 * `demoAnomalyCategories.ts`, the statistics in `demoAnomalyStats.ts`. Same
 * rules and thresholds as the backend, over rows held in memory.
 */

import { medianOf } from '@/lib/distribution'
import type { AnomalyTypeValue } from '@/services/api/analyticsV2Anomalies'
import type { Transaction } from '@/types'

import { grade, lowerBound, passesLogGate, sortedMedian } from './demoAnomalyStats'

export interface DemoFinding {
  type: AnomalyTypeValue
  severity: 'high' | 'medium'
  description: string
  transaction_id: string | null
  period_key: string | null
  expected_value: number | null
  actual_value: number | null
  deviation_pct: number | null
  /** `YYYY-MM-DD` the finding is about, for newest-first ordering. */
  when: string
  autoDismiss?: string
}

export const MIN_HISTORY = 5
const WINDOW_DAYS = 365

export const money = (value: number) => `₹${Math.round(value).toLocaleString('en-US')}`

/** Python's `%b`, fixed: ICU's short month for September is "Sept" in some locales. */
export const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

export const dayIndex = (date: string) =>
  Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) /
  86_400_000

export const monthIndex = (date: string) =>
  Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1

export const periodOf = (month: number) =>
  `${Math.floor(month / 12)}-${String((month % 12) + 1).padStart(2, '0')}`

export function groupBy<T, K>(rows: readonly T[], key: (row: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>()
  for (const row of rows) {
    const k = key(row)
    const list = groups.get(k)
    if (list) list.push(row)
    else groups.set(k, [row])
  }
  return groups
}

export const total = (rows: readonly Transaction[]) => rows.reduce((sum, t) => sum + t.amount, 0)

/** Median monthly spend over the 12 months ending at a month (`SpendScale`). */
export function spendScale(expenses: readonly Transaction[]): (month: number) => number {
  const monthly = [...groupBy(expenses, (t) => monthIndex(t.date))].map(
    ([month, rows]) => [month, total(rows)] as const,
  )
  return (month) =>
    medianOf(monthly.filter(([m]) => m <= month && m >= month - 11).map(([, v]) => v))
}

/**
 * Visit each group's rows that pass *keep*, with the amounts of the group's
 * rows strictly older than them (by day) within a year, ascending. A group is
 * sorted once and walked with two forward-only indexes; the window stays
 * sorted as rows enter and leave, so a median is a lookup instead of a filter
 * and sort of the whole group per row. *window* is live: read it during the
 * call only.
 */
function eachWithTrailingYear(
  rows: readonly Transaction[],
  key: (t: Transaction) => string,
  keep: (t: Transaction) => boolean,
  visit: (t: Transaction, window: readonly number[]) => void,
): void {
  for (const group of groupBy(rows, key).values()) {
    const sorted = [...group].sort((a, b) => a.date.localeCompare(b.date))
    const days = sorted.map((t) => dayIndex(t.date))
    const window: number[] = []
    let start = 0
    let end = 0
    sorted.forEach((t, i) => {
      for (; days[end] < days[i]; end++) {
        window.splice(lowerBound(window, sorted[end].amount), 0, sorted[end].amount)
      }
      for (; days[start] < days[i] - WINDOW_DAYS; start++) {
        window.splice(lowerBound(window, sorted[start].amount), 1)
      }
      if (window.length >= MIN_HISTORY && keep(t)) visit(t, window)
    })
  }
}

export function highExpenseMonths(expenses: readonly Transaction[]): DemoFinding[] {
  const months = [...groupBy(expenses, (t) => t.date.slice(0, 7))]
    .map(([period, rows]) => [period, total(rows)] as const)
    .sort(([a], [b]) => a.localeCompare(b))
  return months.flatMap(([period, sum], i): DemoFinding[] => {
    const window = months.slice(Math.max(0, i - 12), i).map(([, v]) => v)
    const med = medianOf(window)
    const severity = window.length >= MIN_HISTORY && med > 0 ? grade(sum, window) : null
    if (!severity) return []
    const description = `Unusually high expenses in ${period}: ${money(sum)} vs trailing median ${money(med)}`
    return [
      {
        type: 'high_expense',
        severity,
        description,
        transaction_id: null,
        period_key: period,
        expected_value: med,
        actual_value: sum,
        deviation_pct: ((sum - med) / med) * 100,
        when: `${period}-01`,
      },
    ]
  })
}

export function largeTransactions(expenses: readonly Transaction[]): DemoFinding[] {
  const months = [...groupBy(expenses, (t) => t.date.slice(0, 7)).values()].map(total)
  const floor = 0.01 * medianOf(months)
  const found: DemoFinding[] = []
  const judge = (t: Transaction, window: readonly number[]) => {
    const base = sortedMedian(window)
    const ratio = t.amount / base
    if (base <= 0 || ratio < 3 || !passesLogGate(t.amount, window)) return
    found.push({
      type: 'high_expense',
      severity: ratio >= 5 ? 'high' : 'medium',
      description: `Large ${t.category} expense: ${money(t.amount)} vs rolling median ${money(base)}`,
      transaction_id: t.id,
      period_key: null,
      expected_value: base,
      actual_value: t.amount,
      deviation_pct: (ratio - 1) * 100,
      when: t.date,
    })
  }
  eachWithTrailingYear(expenses, (t) => t.category, (t) => t.amount >= floor, judge)
  return found
}

export function largeTransfers(
  transfers: readonly Transaction[],
  scale: (month: number) => number,
): DemoFinding[] {
  const source = (t: Transaction) => t.from_account ?? t.account
  const material = (t: Transaction) => t.amount >= 0.1 * scale(monthIndex(t.date))
  const found: DemoFinding[] = []
  const judge = (t: Transaction, window: readonly number[]) => {
    const base = sortedMedian(window)
    const ratio = t.amount / base
    if (base <= 0 || ratio < 3 || !passesLogGate(t.amount, window)) return
    const route = `from ${source(t)} to ${t.to_account ?? 'another account'}`
    found.push({
      type: 'large_transfer',
      severity: ratio >= 5 ? 'high' : 'medium',
      description: `Large transfer ${route}: ${money(t.amount)} vs a usual ${money(base)} from this account`,
      transaction_id: t.id,
      period_key: t.date.slice(0, 7),
      expected_value: base,
      actual_value: t.amount,
      deviation_pct: (ratio - 1) * 100,
      when: t.date,
    })
  }
  eachWithTrailingYear(transfers, (t) => source(t).toLowerCase(), material, judge)
  return found
}
