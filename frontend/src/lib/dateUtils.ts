/**
 * Date utilities for consistent date handling across the application
 */

export type ViewMode = 'monthly' | 'yearly' | 'all_time'

export const getCurrentYear = (): number => new Date().getFullYear()

export const getCurrentMonth = (): string => new Date().toISOString().substring(0, 7)

/**
 * Normalize a datetime string to a YYYY-MM-DD date key
 */
export const getDateKey = (dateString: string): string => dateString.substring(0, 10)

/**
 * Filter an array of items with a `date` field by optional start/end date strings.
 */
export const filterTransactionsByDateRange = <T extends { date: string }>(
  items: T[],
  dateRange: { start_date?: string; end_date?: string }
): T[] => {
  if (!dateRange.start_date) return items
  return items.filter((item) => {
    const txDate = getDateKey(item.date)
    return txDate >= dateRange.start_date! && (!dateRange.end_date || txDate <= dateRange.end_date)
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

export const getAnalyticsDateRange = (
  viewMode: AnalyticsViewMode,
  currentYear: number,
  currentMonth: string,
  currentFY: string,
  fiscalYearStartMonth: number = 4
): AnalyticsDateRange => {
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
