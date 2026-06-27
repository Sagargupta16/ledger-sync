/**
 * Currency formatting utilities for consistent display across the application
 *
 * These formatters use the preferences store for:
 * - Display currency (drives symbol, format, locale)
 * - Exchange rate (for conversion from base currency)
 *
 * Usage:
 * - formatCurrency(value)        -> "$1,502.34" (2 decimal places, for display)
 * - formatCurrencyCompact(value) -> "$1,502" (rounded, for charts/cards)
 * - formatCurrencyShort(value)   -> "$1.5K" (abbreviated, for chart axes)
 */

import { usePreferencesStore } from '@/store/preferencesStore'
import { getCurrencyMeta, BASE_CURRENCY } from '@/constants/currencies'

// Get current preferences (for non-React contexts)
const getDisplayCurrency = () => usePreferencesStore.getState().displayCurrency
const getExchangeRate = () => usePreferencesStore.getState().exchangeRate

/**
 * Convert an amount from base currency (INR) to the display currency.
 * Returns the original value if display currency equals base currency or no rate available.
 */
const convertAmount = (value: number): number => {
  const displayCurrency = getDisplayCurrency()
  if (displayCurrency === BASE_CURRENCY) return value
  const rate = getExchangeRate()
  if (rate == null) return value
  return value * rate
}

/**
 * Get the CurrencyMeta for the current display currency.
 */
const getActiveCurrencyMeta = () => getCurrencyMeta(getDisplayCurrency())

/**
 * Active display locale (e.g. 'en-IN', 'en-US', 'de-DE') derived from the user's
 * display currency. Use this for ad-hoc `toLocaleString` grouping so it matches
 * the currency the rest of the UI shows, instead of hardcoding 'en-IN'.
 */
export const getActiveLocale = (): string => getActiveCurrencyMeta().locale

/**
 * Format a number with the appropriate locale
 */
const formatWithLocale = (
  value: number,
  options: Intl.NumberFormatOptions = {}
): string => {
  const meta = getActiveCurrencyMeta()
  return value.toLocaleString(meta.locale, options)
}

/**
 * Add currency symbol based on current display currency metadata
 */
const addCurrencySymbol = (formatted: string): string => {
  const meta = getActiveCurrencyMeta()
  return meta.symbolPosition === 'before'
    ? `${meta.symbol}${formatted}`
    : `${formatted}${meta.symbol}`
}

/**
 * Format currency with 2 decimal places - use for detailed displays, tables, tooltips
 * @param value - The numeric value to format
 * @returns Formatted string like "₹1,23,456.78"
 */
export const formatCurrency = (value: number): string => {
  const meta = getActiveCurrencyMeta()
  const converted = convertAmount(value)
  const formatted = formatWithLocale(converted, {
    minimumFractionDigits: meta.decimals,
    maximumFractionDigits: meta.decimals,
  })
  return addCurrencySymbol(formatted)
}

/**
 * Format currency rounded to nearest integer - use for charts, stat cards, summaries
 * @param value - The numeric value to format
 * @returns Formatted string like "₹1,23,457"
 */
export const formatCurrencyCompact = (value: number): string => {
  const converted = convertAmount(value)
  const formatted = formatWithLocale(Math.round(converted), {
    maximumFractionDigits: 0,
  })
  return addCurrencySymbol(formatted)
}

/**
 * Format currency in short form - use for chart Y-axis labels
 * @param value - The numeric value to format
 * @returns Formatted string like "₹1.23L" or "₹12.3K"
 */
export const formatCurrencyShort = (value: number): string => {
  const meta = getActiveCurrencyMeta()
  const converted = convertAmount(value)
  const absValue = Math.abs(converted)
  const sign = converted < 0 ? '-' : ''

  let formatted = `${Math.round(absValue)}`
  for (const unit of meta.shortUnits) {
    if (absValue >= unit.threshold) {
      formatted = `${(absValue / unit.divisor).toFixed(1)}${unit.suffix}`
      break
    }
  }

  return meta.symbolPosition === 'before'
    ? `${sign}${meta.symbol}${formatted}`
    : `${sign}${formatted}${meta.symbol}`
}

/**
 * Format percentage with 1 decimal place
 * @param value - The numeric value to format
 * @param showSign - Whether to show + sign for positive values
 * @returns Formatted string like "+12.5%" or "-3.2%"
 */
export const formatPercent = (value: number, showSign = false): string => {
  const sign = showSign && value > 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}%`
}

/**
 * Calculate the percentage change between two values.
 *
 * Uses `Math.abs(previous)` as the denominator so that sign-flips
 * (e.g. savings going from -1000 to +500) produce sensible results.
 *
 * @param current  - The current (newer) value
 * @param previous - The previous (older) value
 * @returns The percentage change, or `null` when `previous` is 0
 */
export const percentChange = (current: number, previous: number): number | null => {
  if (previous === 0) return null
  return ((current - previous) / Math.abs(previous)) * 100
}

/**
 * Format a YYYY-MM-DD date string for chart axis ticks.
 * Adapts to data density: shows "Jan '24" for large ranges, "Jan 15" for shorter ones.
 * @param dateStr - Date string in YYYY-MM-DD format
 * @param totalPoints - Total number of data points in the chart (for adaptive formatting)
 * @returns Formatted date string
 */
export const formatDateTick = (dateStr: string, totalPoints: number): string => {
  // Build from local Y/M/D parts: new Date('YYYY-MM-DD') is UTC midnight and
  // toLocaleDateString renders local, shifting the axis day for negative-offset
  // users. A non-date string falls through unchanged.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr)
  const date = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(dateStr)
  if (Number.isNaN(date.getTime())) return dateStr
  if (totalPoints > 365) {
    return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/**
 * Format a `YYYY-MM-DD` (or longer ISO) date string for display, timezone-safe.
 *
 * Replaces date-fns `format(new Date(str), ...)`, which parsed the date-only
 * string as UTC midnight and rendered the LOCAL day (off by one for US users).
 * Builds the Date from explicit local Y/M/D parts so the calendar day holds.
 *
 * @param dateStr  ISO date string (only the first 10 chars are used)
 * @param opts     Intl options (default: medium date, e.g. "Mar 15, 2026")
 */
const DEFAULT_DATE_OPTS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
}

export const formatDate = (
  dateStr: string,
  opts: Intl.DateTimeFormatOptions = DEFAULT_DATE_OPTS,
): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr)
  if (!m) return dateStr
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString('en-US', opts)
}

/** Return the English ordinal suffix for a day number (1→'st', 2→'nd', 3→'rd', etc.) */
export function getOrdinalSuffix(n: number): string {
  if (n === 1 || n === 21 || n === 31) return 'st'
  if (n === 2 || n === 22) return 'nd'
  if (n === 3 || n === 23) return 'rd'
  return 'th'
}

/** Safely parse a value that may be a JSON string array or already an array. */
export function parseStringArray(raw: string[] | string | undefined): string[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}
