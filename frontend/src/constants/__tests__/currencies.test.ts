/**
 * Guards the AED display-currency defect found on 2026-07-27.
 *
 * `CURRENCIES` offered AED and the sidebar switcher listed it, but the live ECB
 * feed the backend proxies does not carry it. Probed live that day, base=INR
 * returned 29 codes -- AUD BRL CAD CHF CNY CZK DKK EUR GBP HKD HUF IDR ILS ISK
 * JPY KRW MXN MYR NOK NZD PHP PLN RON SEK SGD THB TRY USD ZAR -- with no AED.
 * Selecting it therefore yielded a null rate, `convertAmount` returned the amount
 * unconverted, and the AED symbol was applied anyway: a 100,000 INR balance read
 * as 100,000 AED, roughly a 23x overstatement, silently.
 *
 * Two invariants are locked here:
 *  1. a currency the served payload cannot price is not selectable, and
 *  2. an unpriceable currency is never the currency an amount is rendered as.
 */

import { describe, expect, it } from 'vitest'

import {
  BASE_CURRENCY,
  CURRENCY_CODES,
  effectiveCurrencyCode,
  selectableCurrencies,
} from '@/constants/currencies'

/** The codes `/api/exchange-rates?base=INR` actually returned on 2026-07-27. */
const LIVE_FEED_CODES = [
  'AUD', 'BRL', 'CAD', 'CHF', 'CNY', 'CZK', 'DKK', 'EUR', 'GBP', 'HKD',
  'HUF', 'IDR', 'ILS', 'ISK', 'JPY', 'KRW', 'MXN', 'MYR', 'NOK', 'NZD',
  'PHP', 'PLN', 'RON', 'SEK', 'SGD', 'THB', 'TRY', 'USD', 'ZAR',
]

const codesOf = (ratedCodes: readonly string[]) =>
  selectableCurrencies(ratedCodes).map((meta) => meta.code)

describe('selectableCurrencies', () => {
  it('does not offer AED against the real live feed, which cannot price it', () => {
    // The defect in one assertion: AED is in the metadata catalogue, and the
    // switcher used to render straight from that catalogue.
    expect(CURRENCY_CODES).toContain('AED')
    expect(codesOf(LIVE_FEED_CODES)).not.toContain('AED')
  })

  it('offers every catalogued currency the feed does price', () => {
    const offered = codesOf(LIVE_FEED_CODES)
    for (const code of ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'SGD', 'CNY', 'KRW', 'SEK', 'NZD', 'HKD']) {
      expect(offered).toContain(code)
    }
  })

  it('always offers the base currency, which needs no rate', () => {
    expect(codesOf(LIVE_FEED_CODES)).toContain(BASE_CURRENCY)
    // Rates failed outright, or have not arrived yet: the ledger's own currency
    // is still a valid choice, so the switcher must never render empty.
    expect(codesOf([])).toEqual([BASE_CURRENCY])
  })

  it('offers no unpriceable currency for ANY feed, not just today\'s', () => {
    // The class, not the instance: whatever the feed carries, every offered
    // non-base code must be priceable.
    for (const feed of [LIVE_FEED_CODES, ['USD'], ['EUR', 'JPY'], []]) {
      const rated = new Set(feed)
      for (const code of codesOf(feed)) {
        if (code !== BASE_CURRENCY) expect(rated.has(code)).toBe(true)
      }
    }
  })

  it('would offer AED if the feed ever did price it (the backend fallback does)', () => {
    // Not a blocklist. The backend's hardcoded fallback table includes AED
    // derived from the USD peg, and when that table is what gets served the
    // currency is genuinely convertible and must be selectable.
    expect(codesOf([...LIVE_FEED_CODES, 'AED'])).toContain('AED')
  })

  it('ignores feed codes with no metadata to render them', () => {
    // The feed carries BRL/THB/TRY etc. that the catalogue has no symbol or
    // locale for. They must not appear as blank rows.
    expect(codesOf(LIVE_FEED_CODES)).not.toContain('BRL')
    expect(codesOf(LIVE_FEED_CODES)).not.toContain('THB')
  })
})

describe('effectiveCurrencyCode', () => {
  it('refuses to denominate an amount in a currency with no rate', () => {
    // The money-lie in one assertion: without this, AED + null rate meant
    // unconverted rupees under a dirham symbol.
    expect(effectiveCurrencyCode('AED', null)).toBe(BASE_CURRENCY)
    expect(effectiveCurrencyCode('USD', null)).toBe(BASE_CURRENCY)
  })

  it('uses the selected currency once a usable rate is held', () => {
    expect(effectiveCurrencyCode('USD', 0.01036)).toBe('USD')
    expect(effectiveCurrencyCode('JPY', 1.6965)).toBe('JPY')
  })

  it('treats a nonsensical rate as no rate', () => {
    // A zero or negative rate would render 0 or sign-flipped money; NaN would
    // render "NaN" under a foreign symbol.
    for (const rate of [0, -0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(effectiveCurrencyCode('USD', rate)).toBe(BASE_CURRENCY)
    }
  })

  it('falls back for a code with no metadata even when a rate exists', () => {
    // The feed prices THB, but the catalogue cannot format it, so
    // `getCurrencyMeta` would silently substitute INR metadata -- rupee symbol
    // over baht-converted digits. Render base currency instead.
    expect(effectiveCurrencyCode('THB', 0.34889)).toBe(BASE_CURRENCY)
  })

  it('passes the base currency through untouched', () => {
    expect(effectiveCurrencyCode(BASE_CURRENCY, null)).toBe(BASE_CURRENCY)
    expect(effectiveCurrencyCode(BASE_CURRENCY, 0.01)).toBe(BASE_CURRENCY)
  })
})
