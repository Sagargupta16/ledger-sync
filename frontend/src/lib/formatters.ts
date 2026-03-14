/**
 * Currency formatting utilities for consistent display across the application
 *
 * These formatters use the preferences store for:
 * - Currency symbol (default: ₹)
 * - Number format (Indian: 1,00,000 vs International: 100,000)
 * - Symbol position (before/after)
 *
 * Usage:
 * - formatCurrency(value)        → "₹1,23,456.78" (2 decimal places, for display)
 * - formatCurrencyCompact(value) → "₹1,23,457" (rounded, for charts/cards)
 * - formatCurrencyShort(value)   → "₹1.23L" or "₹12.3K" (abbreviated, for chart axes)
 */

import { usePreferencesStore } from '@/store/preferencesStore'

// Get current preferences (for non-React contexts)
const getPrefs = () => usePreferencesStore.getState().displayPreferences

/**
 * Format a number with the appropriate locale
 */
const formatWithLocale = (
  value: number,
  options: Intl.NumberFormatOptions = {}
): string => {
  const prefs = getPrefs()
  const locale = prefs.numberFormat === 'indian' ? 'en-IN' : 'en-US'
  return value.toLocaleString(locale, options)
}

/**
 * Add currency symbol based on preferences
 */
const addCurrencySymbol = (formatted: string): string => {
  const prefs = getPrefs()
  const symbol = prefs.currencySymbol
  return prefs.currencySymbolPosition === 'before'
    ? `${symbol}${formatted}`
    : `${formatted}${symbol}`
}

/**
 * Format currency with 2 decimal places - use for detailed displays, tables, tooltips
 * @param value - The numeric value to format
 * @returns Formatted string like "₹1,23,456.78"
 */
export const formatCurrency = (value: number): string => {
  const formatted = formatWithLocale(value, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return addCurrencySymbol(formatted)
}

/**
 * Format currency rounded to nearest integer - use for charts, stat cards, summaries
 * @param value - The numeric value to format
 * @returns Formatted string like "₹1,23,457"
 */
export const formatCurrencyCompact = (value: number): string => {
  const formatted = formatWithLocale(Math.round(value), {
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
  const prefs = getPrefs()
  const symbol = prefs.currencySymbol
  const absValue = Math.abs(value)
  const sign = value < 0 ? '-' : ''

  let formatted: string
  if (absValue >= 10000000) {
    // Crores (1Cr = 10,000,000)
    formatted = `${(absValue / 10000000).toFixed(1)}Cr`
  } else if (absValue >= 100000) {
    // Lakhs (1L = 100,000)
    formatted = `${(absValue / 100000).toFixed(1)}L`
  } else if (absValue >= 1000) {
    // Thousands
    formatted = `${(absValue / 1000).toFixed(0)}K`
  } else {
    formatted = `${Math.round(absValue)}`
  }

  return prefs.currencySymbolPosition === 'before'
    ? `${sign}${symbol}${formatted}`
    : `${sign}${formatted}${symbol}`
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
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return dateStr
  if (totalPoints > 365) {
    return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
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
  } catch (e) {
    console.warn('[parseStringArray] Failed to parse:', e)
    return []
  }
}
