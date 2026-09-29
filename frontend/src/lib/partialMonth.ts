/**
 * Partial-month handling: how far through the current month we are, and
 * the helpers that keep an in-progress month out of month-vs-month
 * comparisons.
 *
 * Re-exported by `@/lib/dateUtils`, the public import path for every date
 * helper; import from there rather than from this module.
 */

import type { AnalyticsDateRange } from './dateRanges'
import { daysInMonth, formatMonthKey, toLocalDateKey } from './dateKeys'

/**
 * How far through a `YYYY-MM` month we are, as elapsed / total days.
 *
 * A month in the past is complete (`isPartial: false`, `fraction: 1`); a future
 * month has no elapsed days. Only the CURRENT month is partial -- and not on its
 * final day, where every calendar day already exists.
 */
export interface PeriodProgress {
  /** True only for the in-progress month -- the one whose totals are incomplete. */
  readonly isPartial: boolean
  /** Days of the month that have already happened (1..daysTotal). */
  readonly daysElapsed: number
  /** Calendar length of the month. */
  readonly daysTotal: number
  /** `daysElapsed / daysTotal`, in (0, 1]. */
  readonly fraction: number
}

export const getMonthProgress = (monthKey: string, now: Date = new Date()): PeriodProgress => {
  const daysTotal = daysInMonth(monthKey)
  const currentMonth = toLocalDateKey(now).slice(0, 7)
  const month = monthKey.slice(0, 7)

  if (month < currentMonth) {
    return { isPartial: false, daysElapsed: daysTotal, daysTotal, fraction: 1 }
  }
  if (month > currentMonth) {
    return { isPartial: false, daysElapsed: 0, daysTotal, fraction: 0 }
  }
  // On the last day of the month every calendar day exists, so the month is
  // complete for comparison purposes. Calling it partial there would delete a
  // whole real month from every trend on the 31st, and `PartialPeriodNotice`
  // (which hides itself at daysElapsed >= daysTotal) would not explain the gap.
  const daysElapsed = now.getDate()
  return {
    isPartial: daysElapsed < daysTotal,
    daysElapsed,
    daysTotal,
    fraction: daysElapsed / daysTotal,
  }
}

/**
 * Whether a `YYYY-MM` month is still in progress.
 *
 * Comparing a partial month against complete ones is the single most common
 * way a finance dashboard lies: on the 26th of a month where salary lands on
 * the 30th, income is near zero while rent has already been paid, so a naive
 * savings rate reads several hundred percent negative. Callers must either
 * exclude the partial month, annotate it, or run its totals through
 * `projectPartialMonth`.
 */
export const isPartialMonth = (monthKey: string, now: Date = new Date()): boolean =>
  getMonthProgress(monthKey, now).isPartial

/**
 * Drop the trailing partial month from a chronologically sorted month series.
 *
 * Use for any chart that compares months to each other (MoM bars, savings-rate
 * trend, seasonality). Do NOT use where the user is asking "how am I doing so
 * far this month" -- annotate there instead.
 */
export const dropPartialMonth = <T>(
  rows: readonly T[],
  key: keyof T,
  now: Date = new Date()
): T[] => {
  const rowMonth = (row: T): string | null => {
    const raw = row[key]
    if (raw instanceof Date) return toLocalDateKey(raw).slice(0, 7)
    return typeof raw === 'string' ? raw.slice(0, 7) : null
  }
  return rows.filter((row) => {
    const month = rowMonth(row)
    return month === null || !isPartialMonth(month, now)
  })
}

/**
 * Scale a partial month's running total to a full-month estimate.
 *
 * Straight-line extrapolation (`total / fraction`) is only honest for flows
 * that accrue steadily, so it is NOT appropriate for salary income (one lump
 * on a fixed day) or rent. Use it for day-to-day expense pace, and always
 * label the result as a projection.
 */
export const projectPartialMonth = (
  total: number,
  monthKey: string,
  now: Date = new Date()
): number => {
  const { fraction } = getMonthProgress(monthKey, now)
  return fraction > 0 ? total / fraction : total
}

/** Last calendar day of the month BEFORE `now`, as a local `YYYY-MM-DD` key. */
export const endOfPreviousMonth = (now: Date = new Date()): string =>
  toLocalDateKey(new Date(now.getFullYear(), now.getMonth(), 0))

/**
 * The in-progress month that a selected analytics window overlaps, if any.
 *
 * Everything a page needs to say "this period is incomplete" in one shape:
 * the `YYYY-MM` key for filtering, a human label, and the elapsed/total day
 * counts `PartialPeriodNotice` renders.
 */
export interface PartialPeriod {
  /** `YYYY-MM` of the in-progress month. */
  readonly monthKey: string
  /** Human label, e.g. "Jul 2026". */
  readonly label: string
  /** Days of the month that have already happened. */
  readonly daysElapsed: number
  /** Calendar length of the month. */
  readonly daysTotal: number
}

/**
 * Resolve the in-progress month covered by an analytics date range.
 *
 * Returns `null` when the window ends before the current month (a past monthly
 * or FY selection: nothing incomplete on screen) and also on the LAST day of
 * the month, where every calendar day exists even though the clock has not run
 * out -- dropping a month on its 31st would delete a complete month of data.
 *
 * `null` start/end mean unbounded (the all-time view), which always overlaps
 * the current month.
 */
export const resolvePartialPeriod = (
  range: AnalyticsDateRange,
  now: Date = new Date()
): PartialPeriod | null => {
  const todayKey = toLocalDateKey(now)
  const monthKey = todayKey.slice(0, 7)
  const { daysElapsed, daysTotal } = getMonthProgress(monthKey, now)
  if (daysElapsed >= daysTotal) return null

  const monthStart = `${monthKey}-01`
  const monthEnd = `${monthKey}-${String(daysTotal).padStart(2, '0')}`
  const start = range.start_date?.slice(0, 10)
  const end = range.end_date?.slice(0, 10)
  if (start && start > monthEnd) return null
  if (end && end < monthStart) return null

  return { monthKey, label: formatMonthKey(monthKey), daysElapsed, daysTotal }
}

/**
 * Narrow a date range so it stops at the last COMPLETE month.
 *
 * Any per-month rate or average (savings rate, needs/wants share of income,
 * average monthly spend, month-over-month delta) is meaningless when one of
 * its months is 26 days into 31: fixed costs have all debited but salary has
 * not landed, so the real ledger reports a -697% savings rate and a 745%
 * "essential share" for the month in progress. Feed those computations this
 * range instead of the raw one.
 *
 * Do NOT use for a current-period TOTAL -- "spent so far this month" is a
 * number the user genuinely wants. Pair with `resolvePartialPeriod` +
 * `PartialPeriodNotice` so a narrowed window is stated, never silent.
 *
 * Returns `null` when the window contains no complete month at all (the user
 * explicitly selected the current month); callers should then fall back to the
 * raw range and lean on the notice.
 */
export const toCompleteMonthsRange = <T extends AnalyticsDateRange>(
  range: T,
  now: Date = new Date()
): T | null => {
  if (resolvePartialPeriod(range, now) === null) return range
  const cutoff = endOfPreviousMonth(now)
  if (range.start_date && range.start_date.slice(0, 10) > cutoff) return null
  if (range.end_date !== null && range.end_date <= cutoff) return range
  return { ...range, end_date: cutoff }
}
