import { monthKeysBetween } from '@/lib/dateUtils'
import { currentMonthKey, isCompleteMonth } from '@/lib/savingsRate'

/**
 * THE monthly-average definition for the whole app (owner decision, 2026-09-30):
 * complete calendar months only, a month with no rows counts as 0, and the
 * in-progress month is excluded. Dashboard burn rate, Spending Analysis
 * "Monthly Avg", the health score's monthly averages, and the average monthly
 * savings on Goals and Net Worth all divide by the months this module returns.
 *
 * "In progress" is `isCompleteMonth`'s answer, so the last calendar day of a
 * month counts as complete exactly as it does everywhere else in the app.
 */

/** Calendar window for an average. Missing bounds fall back to the observed months. */
export interface MonthWindow {
  readonly start?: string | null
  readonly end?: string | null
  /** Keep only the most recent N complete months. */
  readonly trailingMonths?: number
}

export interface CompleteMonthAverage {
  readonly average: number
  readonly total: number
  /** Divisor months, oldest first, empty months included. */
  readonly months: readonly string[]
  /** Per-month totals aligned with `months`; a month with no rows is 0. */
  readonly values: readonly number[]
}

/** Trailing window behind "average monthly savings" on Goals and Net Worth. */
export const SAVINGS_TRAILING_MONTHS = 12

/**
 * Complete calendar months from the window start (or first observed month) to
 * the window end (or last observed month), gaps included. Empty when none of
 * those months carries an observation: an all-zero divisor is no evidence, and
 * callers then keep their labelled running pace for the month in progress.
 */
export function completeMonthSpine(
  observedMonths: readonly string[],
  window: MonthWindow = {},
  now: Date = new Date(),
): string[] {
  const observed = observedMonths.map((key) => key.slice(0, 7)).sort((a, b) => a.localeCompare(b))
  const first = window.start?.slice(0, 7) ?? observed[0]
  const requestedEnd = window.end?.slice(0, 7) ?? observed.at(-1)
  if (!first || !requestedEnd) return []
  const current = currentMonthKey(now)
  const last = requestedEnd > current ? current : requestedEnd
  const complete = monthKeysBetween(first, last).filter((key) => isCompleteMonth(key, now))
  const months = window.trailingMonths ? complete.slice(-window.trailingMonths) : complete
  const seen = new Set(observed)
  return months.some((key) => seen.has(key)) ? months : []
}

/** Sum any rows into `YYYY-MM` totals for {@link completeMonthAverage}. */
export function totalsByMonth<T>(
  rows: Iterable<T>,
  monthOf: (row: T) => string,
  amountOf: (row: T) => number,
): Map<string, number> {
  const totals = new Map<string, number>()
  for (const row of rows) {
    const key = monthOf(row).slice(0, 7)
    totals.set(key, (totals.get(key) ?? 0) + amountOf(row))
  }
  return totals
}

/** Mean per complete calendar month; `null` when the window has no complete-month evidence. */
export function completeMonthAverage(
  totals: ReadonlyMap<string, number>,
  window: MonthWindow = {},
  now: Date = new Date(),
): CompleteMonthAverage | null {
  const months = completeMonthSpine([...totals.keys()], window, now)
  if (months.length === 0) return null
  const values = months.map((key) => totals.get(key) ?? 0)
  const total = values.reduce((sum, value) => sum + value, 0)
  return { average: total / months.length, total, months, values }
}

/** Average monthly net savings over the trailing 12 complete months. */
export function averageMonthlySavings(
  netByMonth: ReadonlyMap<string, number>,
  window: Omit<MonthWindow, 'trailingMonths'> = {},
  now: Date = new Date(),
): CompleteMonthAverage | null {
  return completeMonthAverage(
    netByMonth,
    { ...window, trailingMonths: SAVINGS_TRAILING_MONTHS },
    now,
  )
}
