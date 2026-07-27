// frontend/src/constants/currencies.ts

export interface CurrencyMeta {
  code: string
  name: string
  symbol: string
  symbolPosition: 'before' | 'after'
  numberFormat: 'indian' | 'international'
  locale: string
  shortUnits: { threshold: number; suffix: string; divisor: number }[]
  decimals: number
}

const INDIAN_SHORT_UNITS = [
  { threshold: 10_000_000, suffix: 'Cr', divisor: 10_000_000 },
  { threshold: 100_000, suffix: 'L', divisor: 100_000 },
  { threshold: 1_000, suffix: 'K', divisor: 1_000 },
]

const INTL_SHORT_UNITS = [
  { threshold: 1_000_000_000, suffix: 'B', divisor: 1_000_000_000 },
  { threshold: 1_000_000, suffix: 'M', divisor: 1_000_000 },
  { threshold: 1_000, suffix: 'K', divisor: 1_000 },
]

export const CURRENCIES: Record<string, CurrencyMeta> = {
  INR: { code: 'INR', name: 'Indian Rupee', symbol: '\u20B9', symbolPosition: 'before', numberFormat: 'indian', locale: 'en-IN', shortUnits: INDIAN_SHORT_UNITS, decimals: 2 },
  USD: { code: 'USD', name: 'US Dollar', symbol: '$', symbolPosition: 'before', numberFormat: 'international', locale: 'en-US', shortUnits: INTL_SHORT_UNITS, decimals: 2 },
  EUR: { code: 'EUR', name: 'Euro', symbol: '\u20AC', symbolPosition: 'before', numberFormat: 'international', locale: 'de-DE', shortUnits: INTL_SHORT_UNITS, decimals: 2 },
  GBP: { code: 'GBP', name: 'British Pound', symbol: '\u00A3', symbolPosition: 'before', numberFormat: 'international', locale: 'en-GB', shortUnits: INTL_SHORT_UNITS, decimals: 2 },
  JPY: { code: 'JPY', name: 'Japanese Yen', symbol: '\u00A5', symbolPosition: 'before', numberFormat: 'international', locale: 'ja-JP', shortUnits: INTL_SHORT_UNITS, decimals: 0 },
  CAD: { code: 'CAD', name: 'Canadian Dollar', symbol: 'CA$', symbolPosition: 'before', numberFormat: 'international', locale: 'en-CA', shortUnits: INTL_SHORT_UNITS, decimals: 2 },
  AUD: { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', symbolPosition: 'before', numberFormat: 'international', locale: 'en-AU', shortUnits: INTL_SHORT_UNITS, decimals: 2 },
  CHF: { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF', symbolPosition: 'before', numberFormat: 'international', locale: 'de-CH', shortUnits: INTL_SHORT_UNITS, decimals: 2 },
  SGD: { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', symbolPosition: 'before', numberFormat: 'international', locale: 'en-SG', shortUnits: INTL_SHORT_UNITS, decimals: 2 },
  AED: { code: 'AED', name: 'UAE Dirham', symbol: 'AED', symbolPosition: 'before', numberFormat: 'international', locale: 'ar-AE', shortUnits: INTL_SHORT_UNITS, decimals: 2 },
  CNY: { code: 'CNY', name: 'Chinese Yuan', symbol: '\u00A5', symbolPosition: 'before', numberFormat: 'international', locale: 'zh-CN', shortUnits: INTL_SHORT_UNITS, decimals: 2 },
  KRW: { code: 'KRW', name: 'South Korean Won', symbol: '\u20A9', symbolPosition: 'before', numberFormat: 'international', locale: 'ko-KR', shortUnits: INTL_SHORT_UNITS, decimals: 0 },
  SEK: { code: 'SEK', name: 'Swedish Krona', symbol: 'kr', symbolPosition: 'after', numberFormat: 'international', locale: 'sv-SE', shortUnits: INTL_SHORT_UNITS, decimals: 2 },
  NZD: { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$', symbolPosition: 'before', numberFormat: 'international', locale: 'en-NZ', shortUnits: INTL_SHORT_UNITS, decimals: 2 },
  HKD: { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$', symbolPosition: 'before', numberFormat: 'international', locale: 'en-HK', shortUnits: INTL_SHORT_UNITS, decimals: 2 },
}

export const CURRENCY_CODES = Object.keys(CURRENCIES)

export const BASE_CURRENCY = 'INR'

export function getCurrencyMeta(code: string): CurrencyMeta {
  return CURRENCIES[code] ?? CURRENCIES[BASE_CURRENCY]
}

/**
 * The display currencies that can be offered RIGHT NOW, derived from the rates
 * actually present in the fetched `/api/exchange-rates` payload.
 *
 * `CURRENCIES` above is a metadata catalogue (symbol, locale, decimals). It is
 * NOT a claim that a rate exists for each entry, and treating it as one is what
 * broke: AED sat in the catalogue and in the switcher, but the live ECB feed the
 * backend proxies carries 29 currencies and AED is not among them (verified
 * 2026-07-27: AUD BRL CAD CHF CNY CZK DKK EUR GBP HKD HUF IDR ILS ISK JPY KRW
 * MXN MYR NOK NZD PHP PLN RON SEK SGD THB TRY USD ZAR). Selecting it produced a
 * null rate, `convertAmount` then returned the amount unconverted, and the AED
 * symbol was still applied -- so raw rupees rendered as dirhams, a ~23x
 * overstatement with no error and no indicator.
 *
 * Deriving the option list from the payload closes the whole class rather than
 * that one entry: any future catalogue addition is offered only once a rate for
 * it arrives, and a currency the backend CAN price (its hardcoded fallback table
 * does include AED) is not needlessly withheld.
 *
 * `BASE_CURRENCY` is always offered -- it is the currency the ledger is stored
 * in, so it needs no rate and must stay selectable even when no rates load at
 * all.
 */
export function selectableCurrencies(ratedCodes: readonly string[] = []): CurrencyMeta[] {
  const rated = new Set(ratedCodes)
  return CURRENCY_CODES.filter((code) => code === BASE_CURRENCY || rated.has(code)).map(
    (code) => CURRENCIES[code],
  )
}

/**
 * The currency an amount may truthfully be RENDERED as.
 *
 * The single rule shared by the money formatters and the currency switcher, so
 * the symbol on screen can never disagree with the number beside it. A foreign
 * currency is renderable only while a usable rate for it is held; otherwise the
 * amount is still base-currency data and must be labelled as such.
 *
 * This also covers the window the AED bug shared with every other currency: the
 * rates query is in flight (or failed) while `displayCurrency` already reads
 * USD, and before this rule that window rendered unconverted rupees under a
 * dollar sign.
 */
export function effectiveCurrencyCode(displayCode: string, rate: number | null): string {
  if (displayCode === BASE_CURRENCY) return BASE_CURRENCY
  if (rate == null || !Number.isFinite(rate) || rate <= 0) return BASE_CURRENCY
  return displayCode in CURRENCIES ? displayCode : BASE_CURRENCY
}
