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

export type ViewMode = 'monthly' | 'yearly' | 'all_time'

export const getCurrentYear = (): number => new Date().getFullYear()

export const getCurrentMonth = (): string => new Date().toISOString().substring(0, 7)

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
export const formatMonthKey = (
  monthKey: string,
  opts: Intl.DateTimeFormatOptions = { month: 'short', year: 'numeric' },
  locale = 'en-US',
): string => {
  const year = Number(monthKey.slice(0, 4))
  const month = Number(monthKey.slice(5, 7))
  if (!year || !month) return monthKey
  return new Date(year, month - 1, 1).toLocaleDateString(locale, opts)
}

/**
 * Filter an array of items with a `date` field by optional start/end date strings.
 */
export const filterTransactionsByDateRange = <T extends { date: string }>(
  items: T[],
  dateRange: { start_date?: string; end_date?: string }
): T[] => {
  const startDate = dateRange.start_date
  if (!startDate) return items
  return items.filter((item) => {
    const txDate = getDateKey(item.date)
    return txDate >= startDate && (!dateRange.end_date || txDate <= dateRange.end_date)
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
      return {
        start_date: `${currentYear}-01-01`,
        end_date: `${currentYear}-12-31`
      }
    case 'fy': {
      const fyRange = getFYDateRange(currentFY, fiscalYearStartMonth)
      return {
        start_date: fyRange.start,
        end_date: fyRange.end
      }
    }
    case 'monthly': {
      const year = Number.parseInt(currentMonth.substring(0, 4))
      const month = Number.parseInt(currentMonth.substring(5, 7))
      const lastDay = new Date(year, month, 0).getDate()
      return {
        start_date: `${currentMonth}-01`,
        end_date: `${currentMonth}-${lastDay}`
      }
    }
    default:
      return { start_date: null, end_date: null }
  }
}
