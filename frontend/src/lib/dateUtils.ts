/**
 * Date utilities for consistent date handling across the application
 */

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
 * the single shared implementation — do not re-declare it per file.
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
 * previous day — the key then disagrees with the same date's `getDay()`/
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
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', opts)
}

/**
 * Filter an array of items with a `date` field by optional start/end date strings.
 *
 * Each bound is applied independently. An open start with a closed end is a real
 * shape here -- the all-time view narrowed to complete months is
 * `{start_date: null, end_date: <last month-end>}` -- and short-circuiting on a
 * missing start would return the full ledger, silently reinstating the
 * in-progress month the caller just excluded.
 */
export const filterTransactionsByDateRange = <T extends { date: string }>(
  items: T[],
  dateRange: { start_date?: string; end_date?: string }
): T[] => {
  const { start_date: startDate, end_date: endDate } = dateRange
  if (!startDate && !endDate) return items
  return items.filter((item) => {
    const txDate = getDateKey(item.date)
    return (!startDate || txDate >= startDate) && (!endDate || txDate <= endDate)
  })
}

// ========================================
// Analytics View Mode Types and Functions
// ========================================

export type AnalyticsViewMode = 'all_time' | 'fy' | 'yearly' | 'monthly'

/**
 * Get fiscal year label from a date (e.g. FY 2024-25 = April 2024 to March 2025)
 */
export const getFYFromDate = (date: Date, fiscalYearStartMonth: number = 4): string => {
  const month = date.getMonth() + 1
  const year = date.getFullYear()

  if (month >= fiscalYearStartMonth) {
    return `FY ${year}-${String((year + 1) % 100).padStart(2, '0')}`
  } else {
    return `FY ${year - 1}-${String(year % 100).padStart(2, '0')}`
  }
}

/**
 * Get date range for a fiscal year label
 */
export const getFYDateRange = (fyLabel: string, fiscalYearStartMonth: number = 4): { start: string; end: string } => {
  const fyRegex = /FY\s?(\d{4})-(\d{2})/
  const match = fyRegex.exec(fyLabel)
  if (!match) {
    const now = new Date()
    return {
      start: `${now.getFullYear()}-04-01`,
      end: `${now.getFullYear() + 1}-03-31`
    }
  }

  const startYear = Number.parseInt(match[1])
  const endYearShort = Number.parseInt(match[2])
  const endYear = endYearShort < 50 ? 2000 + endYearShort : 1900 + endYearShort

  const startMonth = String(fiscalYearStartMonth).padStart(2, '0')
  const endMonth = fiscalYearStartMonth - 1 || 12
  const endMonthYear = endMonth === 12 ? startYear : endYear
  const lastDay = new Date(endMonthYear, endMonth, 0).getDate()

  return {
    start: `${startYear}-${startMonth}-01`,
    end: `${endMonthYear}-${String(endMonth).padStart(2, '0')}-${lastDay}`
  }
}

export const getCurrentFY = (fiscalYearStartMonth: number = 4): string => {
  return getFYFromDate(new Date(), fiscalYearStartMonth)
}

export const getAvailableFYs = (
  transactions: Array<{ date: string }> | undefined,
  fiscalYearStartMonth: number = 4
): string[] => {
  if (!transactions || transactions.length === 0) return [getCurrentFY(fiscalYearStartMonth)]

  const fys = new Set<string>()
  for (const tx of transactions) {
    fys.add(getFYFromDate(new Date(tx.date), fiscalYearStartMonth))
  }
  return Array.from(fys).sort((a, b) => b.localeCompare(a))
}

export interface AnalyticsDateRange {
  start_date: string | null
  end_date: string | null
}

export interface AnalyticsDateRangeParams {
  viewMode: AnalyticsViewMode
  currentYear: number
  currentMonth: string
  currentFY: string
  fiscalYearStartMonth?: number
}

export const getAnalyticsDateRange = ({
  viewMode,
  currentYear,
  currentMonth,
  currentFY,
  fiscalYearStartMonth = 4,
}: AnalyticsDateRangeParams): AnalyticsDateRange => {
  switch (viewMode) {
    case 'all_time':
      return { start_date: null, end_date: null }
    case 'yearly':
      return capEndDateAtToday({
        start_date: `${currentYear}-01-01`,
        end_date: `${currentYear}-12-31`
      })
    case 'fy': {
      const fyRange = getFYDateRange(currentFY, fiscalYearStartMonth)
      return capEndDateAtToday({
        start_date: fyRange.start,
        end_date: fyRange.end
      })
    }
    case 'monthly': {
      const year = Number.parseInt(currentMonth.substring(0, 4))
      const month = Number.parseInt(currentMonth.substring(5, 7))
      const lastDay = new Date(year, month, 0).getDate()
      return capEndDateAtToday({
        start_date: `${currentMonth}-01`,
        end_date: `${currentMonth}-${lastDay}`
      })
    }
    default:
      return { start_date: null, end_date: null }
  }
}

/**
 * Cap `end_date` at today (local `YYYY-MM-DD`) so future-dated ranges (a monthly
 * or FY window whose end lies past "now") don't drag divisor math (avg/day)
 * into the future. Null `end_date` (all-time) is preserved.
 *
 * ISO `YYYY-MM-DD` compares lexicographically, so no Date parsing needed.
 * Immutable: returns the input untouched when no cap is required.
 */
export const capEndDateAtToday = <T extends { start_date: string | null; end_date: string | null }>(
  range: T
): T => {
  const today = toLocalDateKey(new Date())
  if (range.end_date && range.end_date > today) return { ...range, end_date: today }
  return range
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
