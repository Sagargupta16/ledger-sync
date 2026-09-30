/**
 * Date keys and calendar math: `YYYY-MM-DD` / `YYYY-MM` keys built from
 * LOCAL calendar components, month/day stepping, spans, and the shared time
 * constants.
 *
 * Re-exported by `@/lib/dateUtils`, the public import path for every date
 * helper; import from there rather than from this module.
 */

import { formatDate } from './formatters'

/** Milliseconds in one day. Use instead of inlining `1000 * 60 * 60 * 24`. */
export const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Milliseconds in one Julian year (365.25 days). Used for annualized-return
 * math (XIRR, investment duration) where the quarter-day matters.
 */
export const MS_PER_YEAR = 365.25 * MS_PER_DAY

/** Months in a year. Use when annualizing a monthly figure or vice versa. */
export const MONTHS_PER_YEAR = 12

/**
 * Days in an average Gregorian month (365.25 / 12).
 *
 * ONLY for spreading a FRACTIONAL month over days. Never use it to count whole
 * months -- real months are 28-31 days, so `days / 30.44` mis-sizes every one of
 * them. Step whole months with `addMonthsToKey` and use this for the remainder.
 */
export const DAYS_PER_AVG_MONTH = 365.25 / MONTHS_PER_YEAR

export type ViewMode = 'monthly' | 'yearly' | 'all_time'

export const getCurrentYear = (): number => new Date().getFullYear()

/**
 * Current `YYYY-MM` on the user's LOCAL calendar.
 *
 * Derived from local components, not `toISOString()`. `toISOString()` converts
 * to UTC first, so in a positive-offset zone (IST = UTC+5:30) the first 5.5
 * hours after local midnight still report the previous UTC day -- and on the
 * 1st of a month that is the previous MONTH. This value seeds the monthly
 * time-filter state in `useAnalyticsTimeFilter`, `useDashboardMetrics` and
 * `useYearInReview`, and flows into `getAnalyticsDateRange`, so the whole app
 * would silently load last month's data. Worst case is 1 April, where the
 * previous month is also the previous fiscal year.
 */
export const getCurrentMonth = (): string => toLocalDateKey(new Date()).slice(0, 7)

/**
 * Today's `YYYY-MM-DD` on the user's LOCAL calendar.
 *
 * The safe replacement for `new Date().toISOString().split('T')[0]`, which is
 * a UTC date key and lands on yesterday for the first 5.5 hours of an IST day.
 */
export const getTodayKey = (): string => toLocalDateKey(new Date())

/** The ledger's own calendar: stored dates are naive Asia/Kolkata (IST) days. */
const LEDGER_TIME_ZONE = 'Asia/Kolkata'

/**
 * Today's `YYYY-MM-DD` on the LEDGER calendar (IST), the backend
 * `ledger_clock.ledger_today()` twin. Use it for a server-side `end_date` that
 * must mean "no future-dated rows" whatever the viewer's own timezone is.
 */
export const getLedgerTodayKey = (now: Date = new Date()): string => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: LEDGER_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

/**
 * Add `n` calendar months to a `YYYY-MM-DD` key, clamping the day to the target
 * month's real length. Sibling of `addDaysToKey`.
 *
 * `d.setMonth(d.getMonth() + n)` (or `setUTCMonth`) OVERFLOWS on month-end
 * anchors: 31 Jan + 1 month is 3 March, not 28/29 February. A projection series
 * stepped that way skips calendar months and doubles up on others -- a 60-point
 * 5-year horizon collapsed to 35 distinct month labels, with ~25 months getting
 * two points and ~25 getting none. Clamping keeps exactly one point per calendar
 * month, which is what every monthly series here assumes.
 *
 * Pure string/component math, so there is no timezone exposure at all -- unlike
 * the `new Date(key)` + local-getter mix that made the overflow hard to spot.
 */
export const addMonthsToKey = (dateKey: string, n: number): string => {
  const [y, m, d] = dateKey.slice(0, 10).split('-').map(Number)
  const monthIndex = m - 1 + n
  const targetYear = y + Math.floor(monthIndex / MONTHS_PER_YEAR)
  const targetMonth = ((monthIndex % MONTHS_PER_YEAR) + MONTHS_PER_YEAR) % MONTHS_PER_YEAR
  // Day 0 of the NEXT month is the last day of the target month.
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
  const day = String(Math.min(d, lastDay)).padStart(2, '0')
  return `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${day}`
}

/**
 * The `YYYY-MM` month key `n` months after `monthKey` (`n` may be negative).
 *
 * Exists so the December-to-January wrap is written once. Two separate month
 * walks each hand-rolled `month += 1; if (month > 12) { month = 1; year += 1 }`,
 * which is correct but is also the kind of arithmetic that only has to be got
 * wrong once. Sonar's symbolic execution additionally mis-reads the reset as a
 * redundant assignment (S4165) at both sites, because it does not carry the
 * range that proves `month` is 13 there.
 *
 * Delegates to `addMonthsToKey` on the first of the month, so the wrap logic has
 * exactly one implementation. Day-clamping is irrelevant at day 01.
 */
export const addMonthsToMonthKey = (monthKey: string, n: number): string =>
  addMonthsToKey(`${monthKey.slice(0, 7)}-01`, n).slice(0, 7)

/**
 * Every `YYYY-MM` from `first` to `last` inclusive, gaps included.
 *
 * Empty when `last` precedes `first`, which is what makes an inverted or
 * all-future window fall back to its caller's own months rather than showing a
 * zero. The 1200-iteration ceiling (100 years) is a runaway guard, not a limit
 * any real ledger reaches.
 */
export const monthKeysBetween = (first: string, last: string): string[] => {
  const keys: string[] = []
  let key = first.slice(0, 7)
  const end = last.slice(0, 7)
  for (let guard = 0; guard < 1200 && key <= end; guard += 1) {
    keys.push(key)
    key = addMonthsToMonthKey(key, 1)
  }
  return keys
}

/**
 * Normalize a datetime string to a YYYY-MM-DD date key
 */
export const getDateKey = (dateString: string): string => dateString.substring(0, 10)

/**
 * Parse a `YYYY-MM-DD` (or longer ISO) date string at LOCAL midnight.
 *
 * `new Date('2026-06-06')` parses date-only strings as UTC midnight, so local
 * getters (`getDay`/`getMonth`/`getDate`) and `date-fns` formatting shift the
 * calendar day for negative-offset (US/Americas) users. Building the Date from
 * the explicit Y/M/D parts pins it to the local calendar day instead. This is
 * the single shared implementation -- do not re-declare it per file.
 */
export const parseLocalDate = (dateStr: string): Date => {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Local weekday (0=Sun..6=Sat) for a `YYYY-MM-DD` date, timezone-stable. */
export const weekdayOf = (dateStr: string): number => parseLocalDate(dateStr).getDay()

/**
 * Format a Date's LOCAL calendar components as a YYYY-MM-DD key.
 *
 * Use this instead of `date.toISOString().substring(0, 10)` whenever the Date
 * was built from local components (e.g. `new Date(year, 0, 1)`) or you're
 * iterating a local calendar. `toISOString()` converts to UTC first, so in a
 * positive-offset zone (IST = UTC+5:30) a local-midnight date rolls back to the
 * previous day -- the key then disagrees with the same date's `getDay()`/
 * `getMonth()`, corrupting day/month bucketing.
 */
export const toLocalDateKey = (date: Date): string => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Format a `YYYY-MM` (or `YYYY-MM-DD`) month key as a human label, timezone-safe.
 *
 * `new Date('2024-01' + '-01')` parses as UTC midnight but `toLocaleDateString`
 * formats in local time, so negative-offset (US) users see the PREVIOUS month
 * ("Dec 2023" for a January bucket). Building the Date from explicit local
 * components avoids the round-trip entirely.
 *
 * @param monthKey  `YYYY-MM` or any string whose first 7 chars are `YYYY-MM`
 * @param opts      Intl month/year options (default: short month + numeric year)
 */
const DEFAULT_MONTH_KEY_OPTS: Intl.DateTimeFormatOptions = { month: 'short', year: 'numeric' }

export const formatMonthKey = (
  monthKey: string,
  opts: Intl.DateTimeFormatOptions = DEFAULT_MONTH_KEY_OPTS,
): string => {
  const year = Number(monthKey.slice(0, 4))
  const month = Number(monthKey.slice(5, 7))
  if (!year || !month) return monthKey
  // The shared date formatter reads the key as a local calendar day, in the
  // app's one date locale.
  return formatDate(`${monthKey.slice(0, 7)}-01`, opts)
}

/**
 * Drop rows whose date key sits in the future relative to today. Generic over
 * row shape and key granularity:
 *   - month-keyed (`YYYY-MM`) rows are kept when `row[key] <= current YYYY-MM`
 *   - day-keyed (`YYYY-MM-DD`) rows are kept when `row[key] <= today`
 *
 * String comparison is lexicographic-safe for both formats. Accepts `Date`
 * values by normalising them via `toLocalDateKey` and comparing against today
 * as a full `YYYY-MM-DD`.
 */
export const capSeriesToToday = <T>(rows: readonly T[], key: keyof T): T[] => {
  const today = toLocalDateKey(new Date())
  const currentMonth = today.slice(0, 7)
  return rows.filter((row) => {
    const raw = row[key]
    if (raw instanceof Date) return toLocalDateKey(raw) <= today
    if (typeof raw !== 'string') return true
    const cutoff = raw.length === 7 ? currentMonth : today
    return raw <= cutoff
  })
}

/**
 * Shift a `YYYY-MM-DD` key by N days (negative shifts backwards), staying on the
 * local calendar. `new Date(key)` would parse as UTC midnight and drift the day
 * for offset zones, so the parts are passed to the Date constructor instead --
 * it normalises month/year rollover on its own.
 */
export const addDaysToKey = (dateKey: string, days: number): string => {
  const [y, m, d] = dateKey.slice(0, 10).split('-').map(Number)
  return toLocalDateKey(new Date(y, m - 1, d + days))
}

/**
 * Add possibly fractional months on the local calendar. Whole months clamp
 * month-end anchors; only the remaining fraction becomes rounded average days.
 */
export const addFractionalMonthsToKey = (dateKey: string, months: number): string => {
  const wholeMonths = Math.floor(months)
  const remainderDays = Math.round((months - wholeMonths) * DAYS_PER_AVG_MONTH)
  return addDaysToKey(addMonthsToKey(dateKey, wholeMonths), remainderDays)
}

/**
 * Inclusive number of calendar days between two `YYYY-MM-DD` keys, so a single
 * day spans 1 and Jan 1 to Jan 31 spans 31. Use for any per-day average divisor;
 * never hardcode 30.
 */
export const inclusiveDaySpan = (startKey: string, endKey: string): number => {
  const [sy, sm, sd] = startKey.slice(0, 10).split('-').map(Number)
  const [ey, em, ed] = endKey.slice(0, 10).split('-').map(Number)
  const spanMs = new Date(ey, em - 1, ed).getTime() - new Date(sy, sm - 1, sd).getTime()
  return Math.max(1, Math.round(spanMs / MS_PER_DAY) + 1)
}

/** Number of days in a `YYYY-MM` month. */
export const daysInMonth = (monthKey: string): number => {
  const [year, month] = monthKey.slice(0, 7).split('-').map(Number)
  return new Date(year, month, 0).getDate()
}
