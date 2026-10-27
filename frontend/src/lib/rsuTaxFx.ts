/**
 * Rupee value of one RSU vest for an Indian return, mirroring the backend's
 * `core/foreign_assets.py` (change both together). A computation aid, not tax
 * advice.
 *
 * The employer's perquisite figure governs when entered. Otherwise the SBI TT
 * buying rate (TTBR) the user looked up for the specified date, the last day of
 * the month before the vest month (r.115 of the Income-tax Rules 1962 for vests
 * up to 2026-03-31, r.206/207 of the Income-tax Rules 2026 after), times the
 * vest-date price per share. Otherwise the saved vest price, which the app
 * converted at the ECB reference rate: an approximation, labelled as one. That
 * fallback holds only while the display currency is INR, because Settings
 * saves vest prices in the display currency.
 */

import { addDaysToKey } from '@/lib/dateUtils'
import { numberFormat } from '@/lib/intlCache'
import type { FxSource, VestFx } from '@/services/api/rsuTax'
import type { RsuVesting } from '@/types/salary'

export const NEW_RULES_FROM = '2026-04-01'
/** A rate card up to a week before the specified date still counts: SBI skips some days. */
export const TTBR_LOOKBACK_DAYS = 7
/** SBI's own forex card rates for today (PDF). */
export const SBI_RATE_CARD_URL = 'https://sbi.bank.in/documents/16012/1400784/FOREX_CARD_RATES.pdf'
/** A community archive of SBI's daily rate cards, for past dates. */
export const SBI_RATE_ARCHIVE_URL = 'https://github.com/sahilgupta/sbi-fx-ratekeeper/tree/main/pdf_files'

export const FX_SOURCE_LABEL: Record<FxSource, string> = {
  employer: 'Employer figure',
  sbi_ttbr: 'SBI TT buying rate',
  ecb: 'ECB rate (approximation)',
}

/** The last day of the month before `dateKey`'s month, as YYYY-MM-DD. */
export function previousMonthEnd(dateKey: string): string {
  return addDaysToKey(`${dateKey.slice(0, 7)}-01`, -1)
}

/** The rule that sets the conversion date for an event on `dateKey`. */
export function conversionRule(dateKey: string): string {
  return dateKey >= NEW_RULES_FROM ? 'Income-tax Rules 2026, r.206/207' : 'Income-tax Rules 1962, r.115'
}

/** A rate card dated on, or shortly before, the event's specified date. */
export function ttbrDateMatches(eventDate: string, rateDate: string): boolean {
  const target = previousMonthEnd(eventDate)
  return rateDate <= target && rateDate >= addDaysToKey(target, -TTBR_LOOKBACK_DAYS)
}

export interface VestTaxValue {
  source: FxSource
  /** The perquisite for the whole gross vest, in rupees. */
  taxValue: number | null
  /** What the app shows today: the vest price converted at the ECB rate. */
  ecbValue: number | null
  difference: number | null
  specifiedDate: string
  rule: string
  rateDateMismatch: boolean
}

/** `pricesInInr` is false when the display currency is not INR, so saved vest prices are not rupees. */
export function vestTaxValue(vesting: RsuVesting, fx: VestFx | undefined, pricesInInr = true): VestTaxValue {
  const quantity = Number(vesting.quantity) || 0
  const price = vesting.price_at_vest == null || !pricesInInr ? Number.NaN : Number(vesting.price_at_vest)
  const ecbValue = Number.isFinite(price) && price > 0 ? price * quantity : null
  let source: FxSource = 'ecb'
  let taxValue = ecbValue
  let rateDateMismatch = false
  if (fx?.employer_perquisite_inr != null) {
    source = 'employer'
    taxValue = Number(fx.employer_perquisite_inr)
  } else if (fx?.fx_rate != null && fx.quote_price != null) {
    source = 'sbi_ttbr'
    taxValue = Number(fx.quote_price) * Number(fx.fx_rate) * quantity
    rateDateMismatch = fx.fx_date == null || !ttbrDateMatches(vesting.date, fx.fx_date)
  }
  return {
    source,
    taxValue,
    ecbValue,
    difference: taxValue != null && ecbValue != null ? taxValue - ecbValue : null,
    specifiedDate: previousMonthEnd(vesting.date),
    rule: conversionRule(vesting.date),
    rateDateMismatch,
  }
}

/** Rupees whatever the display currency: these figures go on a return filed in INR. */
export function formatInr(value: number, digits = 2): string {
  return numberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}

/** Whole rupees, as the return forms take them. */
export function formatInrWhole(value: number): string {
  return formatInr(value, 0)
}

export function formatSignedInr(value: number): string {
  return numberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    signDisplay: 'exceptZero',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

/** An amount in the stock's own currency, e.g. "$230.10"; a plain number until the currency is known. */
export function formatQuote(value: number, currency: string | null): string {
  const digits = { minimumFractionDigits: 2, maximumFractionDigits: 2 }
  if (currency && /^[A-Z]{3}$/.test(currency)) {
    return numberFormat('en-US', { style: 'currency', currency, ...digits }).format(value)
  }
  return numberFormat('en-US', digits).format(value)
}
