/**
 * Analytics date ranges: transaction range filtering, fiscal-year labels
 * and bounds, and the view-mode window every analytics page queries with.
 *
 * Re-exported by `@/lib/dateUtils`, the public import path for every date
 * helper; import from there rather than from this module.
 */

import { getDateKey, toLocalDateKey } from './dateKeys'

/**
 * Filter an array of items with a `date` field by optional start/end date strings.
 *
 * Each bound is applied independently. An open start with a closed end is a real
 * shape here -- the all-time view narrowed to complete months is
 * `{start_date: null, end_date: <last month-end>}` -- and short-circuiting on a
 * missing start would return the full ledger, silently reinstating the
 * in-progress month the caller just excluded. A missing (`undefined`) item list
 * yields an empty array; `null` and `undefined` bounds both mean unbounded.
 */
export const filterTransactionsByDateRange = <T extends { date: string }>(
  items: T[] | undefined,
  dateRange: { start_date?: string | null; end_date?: string | null }
): T[] => {
  if (!items) return []
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

/** Calendar year and 1-indexed month of a `Date` (local) or date string. */
const yearMonthOf = (date: Date | string): { year: number; month: number } => {
  if (date instanceof Date) return { year: date.getFullYear(), month: date.getMonth() + 1 }
  // Parse the YYYY-MM-DD components directly. `new Date('2025-04-01')` parses
  // as UTC midnight but getFullYear()/getMonth() return LOCAL components, so a
  // 1st-of-month date can read as the previous month (wrong FY) for negative-
  // offset users. Reading the string avoids any timezone dependence.
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(date)
  if (isoMatch) return { year: Number(isoMatch[1]), month: Number(isoMatch[2]) }
  const d = new Date(date)
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 }
}

/**
 * Fiscal-year label for the year starting in `startYear`.
 *
 * A January start makes the FY a calendar year, labelled "FY 2024"; any other
 * start spans two calendar years, "FY 2024-25". Same shape as the backend's
 * `FY2024` / `FY2024-25`, with the display space.
 */
export const formatFYLabel = (startYear: number, fiscalYearStartMonth: number = 4): string =>
  fiscalYearStartMonth === 1
    ? `FY ${startYear}`
    : `FY ${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`

/**
 * Start year of an FY label in either form: "FY 2024-25", "FY2024-25",
 * "2024-25", "FY 2024" or "2024". `null` when the label has no 4-digit year.
 */
export const parseFYLabelStartYear = (fyLabel: string): number | null => {
  const match = /^\s*(?:FY\s*)?(\d{4})(?:\s*-\s*\d{2,4})?\s*$/i.exec(fyLabel)
  return match ? Number(match[1]) : null
}

/** The FY label `offset` years from `fyLabel`, in the form the start month implies. */
export const shiftFYLabel = (
  fyLabel: string,
  offset: number,
  fiscalYearStartMonth: number = 4,
): string | null => {
  const startYear = parseFYLabelStartYear(fyLabel)
  return startYear === null ? null : formatFYLabel(startYear + offset, fiscalYearStartMonth)
}

/**
 * Get fiscal year label (e.g. "FY 2024-25" = April 2024 to March 2025, or
 * "FY 2024" for a January start).
 *
 * A `Date` is read on the LOCAL calendar; a `YYYY-MM-DD` string is read from
 * its own components, so it never depends on the timezone.
 *
 * @param date  Local `Date`, or ISO date string (YYYY-MM-DD)
 * @param fiscalYearStartMonth  1-indexed month when FY begins (default 4 = April)
 */
export const getFYFromDate = (date: Date | string, fiscalYearStartMonth: number = 4): string => {
  const { year, month } = yearMonthOf(date)
  return formatFYLabel(month >= fiscalYearStartMonth ? year : year - 1, fiscalYearStartMonth)
}

/**
 * Get date range for a fiscal year label (either label form round-trips).
 */
export const getFYDateRange = (fyLabel: string, fiscalYearStartMonth: number = 4): { start: string; end: string } => {
  const startYear = parseFYLabelStartYear(fyLabel)
  if (startYear === null) {
    const now = new Date()
    return {
      start: `${now.getFullYear()}-04-01`,
      end: `${now.getFullYear() + 1}-03-31`
    }
  }

  const startMonth = String(fiscalYearStartMonth).padStart(2, '0')
  const endMonth = fiscalYearStartMonth - 1 || 12
  const endMonthYear = endMonth === 12 ? startYear : startYear + 1
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
    // The string itself, not `new Date(tx.date)`: that parses as UTC midnight,
    // so west of UTC 1 April read as 31 March and landed in the previous FY.
    fys.add(getFYFromDate(tx.date, fiscalYearStartMonth))
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
