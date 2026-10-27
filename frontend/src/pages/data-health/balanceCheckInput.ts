/**
 * What the balance-check form takes and what the panel shows back: the typed
 * amount, the earliest day a check can name, rupee formatting, and the
 * server's message for a failed write.
 *
 * Every amount in the panel is in rupees, whatever the display currency: a
 * bank states a balance in the account's own currency, so the figure typed,
 * the ledger's and the gap between them all read in that one unit.
 */

import { numberFormat } from '@/lib/intlCache'
import { BASE_CURRENCY, getCurrencyMeta } from '@/constants/currencies'

/** The largest amount the form accepts: NUMERIC(15, 2), like every ledger amount. */
const MAX_BALANCE = 9_999_999_999_999.99

/**
 * The earliest day a check can name; the server refuses anything before it
 * (`EARLIEST_CHECK_DAY` in backend `schemas/balance_checks.py`). A desktop
 * date input turns a two-digit year into year 0026.
 */
export const EARLIEST_CHECK_DAY = '2000-01-01'

const INR = getCurrencyMeta(BASE_CURRENCY)
const TWO_DECIMALS: Intl.NumberFormatOptions = { minimumFractionDigits: 2, maximumFractionDigits: 2 }

export type ParsedAmount =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly error: string }

/**
 * Read a typed bank balance into the exact decimal string the API takes.
 * Grouping commas, spaces and the rupee sign are ignored; the sign comes from
 * the Owed switch, never from the text.
 */
export function parseAmount(text: string, negative: boolean): ParsedAmount {
  const stripped = text.replaceAll(/[\s,\u20B9]/g, '')
  if (stripped === '') return { ok: false, error: 'Enter the balance your bank shows.' }
  // ".50" is how some people type paise; it means 0.50.
  const cleaned = stripped.startsWith('.') ? `0${stripped}` : stripped
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    return { ok: false, error: 'Use digits with at most two decimals, for example 52340.50.' }
  }
  const magnitude = Number(cleaned)
  if (magnitude > MAX_BALANCE) return { ok: false, error: 'That amount is too large.' }
  const value = cleaned.replace(/^0+(?=\d)/, '')
  return { ok: true, value: negative && magnitude !== 0 ? `-${value}` : value }
}

/** The form text for a stored amount: unsigned, two decimals, no grouping. */
export function amountText(balance: number): string {
  return Math.abs(balance).toFixed(2)
}

/** True for a `YYYY-MM-DD` key the server accepts as a check day. */
export function isCheckDay(day: string, today: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && day >= EARLIEST_CHECK_DAY && day <= today
}

/**
 * A panel amount in rupees, shaped the way `formatCurrency` renders INR
 * ("₹52,340.50", "₹-2,000.00"). Takes the form's decimal string too.
 */
export function formatInr(value: number | string): string {
  const amount = Number(value)
  // Paise that round away read as a plain zero, never as a signed one.
  const shown = Math.round(Math.abs(amount) * 100) === 0 ? 0 : amount
  return `${INR.symbol}${numberFormat(INR.locale, TWO_DECIMALS).format(shown)}`
}

/** The short rupee figure for a phone row ("₹73.5K", "₹12.3L"): `formatCurrencyShort` in INR. */
export function formatInrShort(value: number): string {
  const magnitude = Math.abs(value)
  const unit = INR.shortUnits.find((candidate) => magnitude >= candidate.threshold)
  const body = unit ? `${(magnitude / unit.divisor).toFixed(1)}${unit.suffix}` : `${Math.round(magnitude)}`
  return `${value < 0 && body !== '0' ? '-' : ''}${INR.symbol}${body}`
}

/** The server's message for a failed write, or a plain fallback. */
export function writeErrorMessage(error: unknown): string {
  const detail = (error as { response?: { data?: { detail?: unknown } } } | null)?.response?.data
    ?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    const first: unknown = detail[0]
    const message = (first as { msg?: unknown } | undefined)?.msg
    if (typeof message === 'string') return message
  }
  return 'That did not save. Check your connection and try again.'
}
