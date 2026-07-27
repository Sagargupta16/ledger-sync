/**
 * Currency formatting utilities for consistent display across the application
 *
 * These formatters use the preferences store for:
 * - Display currency (drives symbol, format, locale)
 * - Exchange rate (for conversion from base currency)
 *
 * Usage:
 * - formatCurrency(value)        -> "$1,502" / "$12.50" (exact, drops only ".00")
 * - formatCurrencyCompact(value) -> "$1,502" (always rounded, for charts/cards)
 * - formatCurrencyShort(value)   -> "$1.5K" (abbreviated, for chart axes)
 */

import { usePreferencesStore } from '@/store/preferencesStore'
import { getCurrencyMeta, BASE_CURRENCY, effectiveCurrencyCode } from '@/constants/currencies'

// Get current preferences (for non-React contexts)
const getDisplayCurrency = () => usePreferencesStore.getState().displayCurrency
const getExchangeRate = () => usePreferencesStore.getState().exchangeRate

/**
 * The currency these formatters will actually render in.
 *
 * Not simply `displayCurrency`: the symbol and the number MUST be decided from
 * the same fact. Previously `convertAmount` returned the value unconverted when
 * no rate was held while `getActiveCurrencyMeta` still applied the selected
 * currency's symbol, so 100,000 INR rendered as "AED 100,000" -- a ~23x lie,
 * silent, with no indicator. Now an unpriceable currency falls back to the base
 * currency for BOTH the arithmetic and the symbol, so the worst case is an
 * honest rupee figure rather than a mislabelled one.
 */
const getRenderCurrency = (): string =>
  effectiveCurrencyCode(getDisplayCurrency(), getExchangeRate())

/**
 * Convert an amount from base currency (INR) to the render currency.
 *
 * Returns the value untouched exactly when the render currency IS the base
 * currency -- which `getRenderCurrency` guarantees is also when the symbol says
 * rupees. The old "no rate, so return it unconverted" branch is gone: that was
 * the money-lie primitive, because it made "unconverted" and "labelled foreign"
 * simultaneously possible.
 */
const convertAmount = (value: number): number => {
  const renderCurrency = getRenderCurrency()
  if (renderCurrency === BASE_CURRENCY) return value
  const rate = getExchangeRate()
  // Non-null and usable by construction: getRenderCurrency only leaves the base
  // currency behind when the rate is a positive finite number.
  return rate == null ? value : value * rate
}

/**
 * Get the CurrencyMeta for the currency being rendered.
 */
const getActiveCurrencyMeta = () => getCurrencyMeta(getRenderCurrency())

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
 * How many fractional digits `value` actually needs.
 *
 * Returns the currency's `decimals` whenever the amount really has a non-zero
 * fraction at that precision, and 0 when it does not -- so "₹80,66,209.00"
 * renders as "₹80,66,209" while "₹12.50" keeps its paise. A currency declaring
 * `decimals: 0` (JPY, KRW) has no sub-unit and always gets 0.
 *
 * There is deliberately NO magnitude threshold here. Dropping the fraction of a
 * large amount would make displayed money stop adding up: a day header or a KPI
 * total and the rows underneath it are both rendered through this function, so
 * rounding one side and not the other produces visible arithmetic errors (an
 * exact 1,16,505.14 month total against category rows that display a 1,16,505.69
 * sum). Trailing ".00" is noise; a real fraction is data.
 */
const significantFractionDigits = (value: number, decimals: number): number => {
  if (decimals <= 0) return 0
  const scale = 10 ** decimals
  // Round on the absolute value so a half-sub-unit is detected symmetrically
  // for both signs (Math.round breaks ties toward +Infinity).
  const hasFraction = Math.round(Math.abs(value) * scale) % scale !== 0
  return hasFraction ? decimals : 0
}

/**
 * Collapse a value that rounds away to nothing at `digits` precision onto a
 * plain 0. A float-sum residue such as -1e-9 would otherwise be rendered by
 * Intl as a signed "-₹0", so one page could show zero two different ways.
 */
const collapseNegativeZero = (value: number, digits: number): number =>
  Math.round(Math.abs(value) * 10 ** digits) === 0 ? 0 : value

/**
 * Format currency for detailed displays, tables, tooltips and KPIs.
 *
 * Exact to the currency's sub-unit; only a zero fraction is dropped
 * (see `significantFractionDigits`).
 * @param value - The numeric value to format
 * @returns Formatted string like "₹1,23,456.78", "₹182" or "₹12.50"
 */
export const formatCurrency = (value: number): string => {
  const meta = getActiveCurrencyMeta()
  const converted = convertAmount(value)
  const digits = significantFractionDigits(converted, meta.decimals)
  const formatted = formatWithLocale(collapseNegativeZero(converted, digits), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
  return addCurrencySymbol(formatted)
}

/**
 * Format currency rounded to nearest integer - use for charts, stat cards, summaries
 *
 * Rounds through Intl (half away from zero) exactly like `formatCurrency`, NOT
 * through `Math.round` (half toward +Infinity): the two run on the same number
 * on the same screen (a goal card shows one via each), and a negative
 * half-unit such as -1,679.50 would otherwise disagree by a whole rupee.
 * @param value - The numeric value to format
 * @returns Formatted string like "₹1,23,457"
 */
export const formatCurrencyCompact = (value: number): string => {
  const converted = convertAmount(value)
  const formatted = formatWithLocale(collapseNegativeZero(converted, 0), {
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

/**
 * Safely parse a value that may be a JSON string array or already an array.
 *
 * The elements are FILTERED to strings, not just checked for array-ness.
 * `JSON.parse` returns `any`, so `Array.isArray(parsed) ? parsed : []` handed
 * back a `number[]` (or an array of objects) while the signature promised
 * `string[]` -- the caller would then call `.trim()` or `.toLowerCase()` on a
 * number and throw at runtime. Preference columns are TEXT holding JSON written
 * by an earlier schema, so a non-string element is a live possibility, not a
 * hypothetical.
 */
export function parseStringArray(raw: string[] | string | undefined): string[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.filter((v) => typeof v === 'string')
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}
