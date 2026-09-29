import type { CohortSpendingData, DailySummary } from '@/services/api/analyticsV2'
import type { DailyNetWorthData } from '@/services/api/calculations'
import type { Transaction } from '@/types'

import { filterByDateRange, isExpense, isIncome, isTransfer } from './demoHelpers'

/** Day- and calendar-bucketed demo reads (cohorts, daily rollups, daily series). */

export function generateDemoCohortSpending(txs: Transaction[]): CohortSpendingData {
  const expenses = txs.filter(isExpense)
  const build = (
    keyOf: (d: Date) => number,
    domain: number[],
  ): { bucket: number; total: number; occurrences: number; avg: number }[] => {
    const totals = new Map<number, number>()
    const days = new Map<number, Set<string>>()
    for (const t of expenses) {
      const d = new Date(`${t.date}T00:00:00`)
      const k = keyOf(d)
      totals.set(k, (totals.get(k) ?? 0) + t.amount)
      if (!days.has(k)) days.set(k, new Set())
      days.get(k)?.add(t.date)
    }
    return domain
      .filter((b) => totals.has(b))
      .map((b) => {
        const total = totals.get(b) ?? 0
        const occ = days.get(b)?.size ?? 1
        return { bucket: b, total, occurrences: occ, avg: total / occ }
      })
  }
  return {
    day_of_week: build((d) => d.getDay(), [0, 1, 2, 3, 4, 5, 6]),
    day_of_month: build(
      (d) => d.getDate(),
      Array.from({ length: 31 }, (_, i) => i + 1),
    ),
    month_of_year: build(
      (d) => d.getMonth() + 1,
      Array.from({ length: 12 }, (_, i) => i + 1),
    ),
  }
}

/** A `YYYY-MM-DD` query param, or undefined when the caller did not send one. */
function dayParam(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value.slice(0, 10) : undefined
}

/** Rows grouped by calendar day, every day with any row (transfer-only too). */
function groupByDay(txs: readonly Transaction[]): Map<string, Transaction[]> {
  const byDate = new Map<string, Transaction[]>()
  for (const t of txs) {
    if (!byDate.has(t.date)) byDate.set(t.date, [])
    byDate.get(t.date)?.push(t)
  }
  return byDate
}

/** Default page of `/analytics/v2/daily-summaries` (`limit` defaults to 1500). */
const DAILY_SUMMARIES_DEFAULT_LIMIT = 1500

/**
 * Mirrors `get_daily_summaries` in `analytics_v2_impl/summaries.py`: inclusive
 * `start_date`/`end_date` bounds, the MOST RECENT `limit` days, returned oldest
 * first.
 */
export function generateDemoDailySummaries(
  txs: Transaction[],
  params: Record<string, unknown> = {},
): DailySummary[] {
  const limit = Number(params.limit) || DAILY_SUMMARIES_DEFAULT_LIMIT
  const inWindow = filterByDateRange(txs, dayParam(params.start_date), dayParam(params.end_date))
  return [...groupByDay(inWindow).entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, limit)
    .reverse()
    .map(([date, rows]) => {
      const income = rows.filter(isIncome).reduce((s, t) => s + t.amount, 0)
      const expense = rows.filter(isExpense).reduce((s, t) => s + t.amount, 0)
      const catTotals = new Map<string, number>()
      for (const t of rows.filter(isExpense)) {
        catTotals.set(t.category, (catTotals.get(t.category) ?? 0) + t.amount)
      }
      const top = [...catTotals.entries()].sort((a, b) => b[1] - a[1])[0]
      return {
        date,
        income,
        expense,
        net: income - expense,
        income_count: rows.filter(isIncome).length,
        expense_count: rows.filter(isExpense).length,
        transfer_count: rows.filter(isTransfer).length,
        total_transactions: rows.length,
        top_category: top?.[0] ?? null,
      }
    })
}

/** Income adds, Expense subtracts, Transfer moves nothing. */
function cashFlow(t: Transaction): number {
  if (isIncome(t)) return t.amount
  if (isExpense(t)) return -t.amount
  return 0
}

/**
 * Mirrors `get_daily_net_worth` in `api/calculations.py`: one entry per day in
 * the window (transfer-only days included, at zero), every Expense row counted,
 * and the running series seeded with the cash flow before `start_date`.
 */
export function generateDemoDailyNetWorth(
  txs: Transaction[],
  params: Record<string, unknown> = {},
): DailyNetWorthData {
  const start = dayParam(params.start_date)
  const openingBalance = start
    ? txs.filter((t) => t.date < start).reduce((s, t) => s + cashFlow(t), 0)
    : 0

  const dailyData: DailyNetWorthData['daily_data'] = {}
  const cumulativeData: DailyNetWorthData['cumulative_data'] = []
  let netWorth = openingBalance
  const days = [...groupByDay(filterByDateRange(txs, start, dayParam(params.end_date))).entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
  for (const [date, rows] of days) {
    const income = rows.filter(isIncome).reduce((s, t) => s + t.amount, 0)
    const expense = rows.filter(isExpense).reduce((s, t) => s + t.amount, 0)
    dailyData[date] = { income, expense, date }
    netWorth += income - expense
    cumulativeData.push({ date, net_worth: netWorth, income, expense })
  }
  return { daily_data: dailyData, cumulative_data: cumulativeData, opening_balance: openingBalance }
}

/** Trailing per-category monthly totals aligned to the requested month keys. */
export function generateDemoCategoryMonthlyHistory(
  txs: Transaction[],
  months: string[],
  transactionType: 'income' | 'expense',
): Record<string, number[]> {
  const wanted = transactionType === 'income' ? isIncome : isExpense
  const out: Record<string, number[]> = {}
  for (const t of txs) {
    if (!wanted(t)) continue
    const idx = months.indexOf(t.date.slice(0, 7))
    if (idx === -1) continue
    if (!out[t.category]) out[t.category] = new Array(months.length).fill(0) as number[]
    out[t.category][idx] += t.amount
  }
  return out
}

export function generateDemoCategoryDailySeries(
  txs: Transaction[],
  params: Record<string, unknown>,
): { data: { date: string; category: string; subcategory: string; amount: number }[]; transaction_count: number } {
  let rows = txs.filter(params.transaction_type === 'income' ? isIncome : isExpense)
  if (params.start_date) rows = rows.filter((t) => t.date >= (params.start_date as string))
  if (params.end_date) rows = rows.filter((t) => t.date <= (params.end_date as string))
  if (params.category) rows = rows.filter((t) => t.category === params.category)
  const agg = new Map<string, number>()
  for (const t of rows) {
    const key = `${t.date}|${t.category}|${t.subcategory ?? ''}`
    agg.set(key, (agg.get(key) ?? 0) + t.amount)
  }
  return {
    data: [...agg.entries()].map(([key, amount]) => {
      const [date, category, subcategory] = key.split('|')
      return { date, category, subcategory, amount }
    }),
    transaction_count: rows.length,
  }
}
