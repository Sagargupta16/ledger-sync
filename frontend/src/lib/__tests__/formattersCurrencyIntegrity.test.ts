/**
 * The symbol on screen must agree with the number beside it.
 *
 * Found 2026-07-27. `convertAmount` returned the amount UNCONVERTED when no
 * exchange rate was held, while `getActiveCurrencyMeta` still applied the
 * selected currency's symbol. So a user on AED -- a currency the live ECB feed
 * does not carry, hence permanently rateless -- saw raw rupees labelled as
 * dirhams: 100,000 INR displayed as "AED 100,000", roughly a 23x overstatement,
 * with no error and no indicator.
 *
 * A separate file from `formatters.test.ts` so the two concerns stay legible:
 * that one covers rounding/precision, this one covers "is this number in the
 * currency it claims to be in".
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { BASE_CURRENCY, CURRENCIES } from '@/constants/currencies'
import { usePreferencesStore } from '@/store/preferencesStore'

import { formatCurrency, formatCurrencyCompact, formatCurrencyShort } from '../formatters'

const RUPEE = CURRENCIES[BASE_CURRENCY].symbol

beforeEach(() => {
  usePreferencesStore.setState({
    displayCurrency: BASE_CURRENCY,
    exchangeRate: null,
    exchangeRateUpdatedAt: null,
  })
})

describe('formatters never mislabel an unconverted amount', () => {
  it('does not render rupees as dirhams when AED has no rate', () => {
    // The reported defect, verbatim: AED selected, no rate available (the live
    // 29-currency feed has no AED at all), 100,000 INR on the books.
    usePreferencesStore.setState({ displayCurrency: 'AED', exchangeRate: null })

    const shown = formatCurrency(100000)

    expect(shown).not.toContain('AED')
    expect(shown).toContain(RUPEE)
    expect(shown).toBe(`${RUPEE}1,00,000`)
  })

  it('applies no foreign symbol on a null rate, for every catalogued currency', () => {
    // The class, not the one code. Any currency can be temporarily rateless
    // (query in flight, upstream down), and none of them may borrow a symbol.
    for (const meta of Object.values(CURRENCIES)) {
      if (meta.code === BASE_CURRENCY) continue
      usePreferencesStore.setState({ displayCurrency: meta.code, exchangeRate: null })

      for (const shown of [
        formatCurrency(100000),
        formatCurrencyCompact(100000),
        formatCurrencyShort(100000),
      ]) {
        expect(shown).toContain(RUPEE)
        // The digits are unconverted, so the label must be the base currency.
        expect(shown.startsWith(RUPEE) || shown.endsWith(RUPEE)).toBe(true)
      }
    }
  })

  it('keeps the base-currency NUMBER when a rate is missing, only fixing the label', () => {
    // Guards against "fix" by zeroing or blanking the amount: the value is real
    // base-currency data, it was merely mislabelled.
    usePreferencesStore.setState({ displayCurrency: 'AED', exchangeRate: null })
    expect(formatCurrency(1234.5)).toBe(`${RUPEE}1,234.50`)
    expect(formatCurrencyCompact(1234.5)).toBe(`${RUPEE}1,235`)
  })

  it('still converts and labels correctly once a real rate is held', () => {
    // The fix must not break working conversion. 100,000 INR at the live
    // 2026-07-24 USD rate.
    usePreferencesStore.setState({ displayCurrency: 'USD', exchangeRate: 0.01036 })
    const shown = formatCurrency(100000)
    expect(shown).toContain('$')
    expect(shown).not.toContain(RUPEE)
    expect(shown).toBe('$1,036')
  })

  it('rejects a zero, negative or NaN rate instead of rendering it', () => {
    // 0 would print "$0" for a real balance; a negative rate would flip signs;
    // NaN would print "$NaN". All three are base currency, honestly labelled.
    for (const rate of [0, -0.02, Number.NaN]) {
      usePreferencesStore.setState({ displayCurrency: 'USD', exchangeRate: rate })
      expect(formatCurrency(100000)).toBe(`${RUPEE}1,00,000`)
    }
  })

  it('uses base-currency number formatting too, not just the symbol', () => {
    // Falling back on the symbol alone would leave international grouping on an
    // Indian-format amount ("₹100,000" instead of "₹1,00,000").
    usePreferencesStore.setState({ displayCurrency: 'USD', exchangeRate: null })
    expect(formatCurrency(100000)).toBe(`${RUPEE}1,00,000`)
    // And the short units revert to lakh/crore rather than K/M.
    expect(formatCurrencyShort(10000000)).toContain('Cr')
    expect(formatCurrencyShort(10000000)).not.toContain('M')
  })

  it('does not lose a 0-decimal currency\'s rule when it IS priced', () => {
    // JPY has no sub-unit; that must still hold on the converted path.
    usePreferencesStore.setState({ displayCurrency: 'JPY', exchangeRate: 1.6965 })
    expect(formatCurrency(1000)).toBe('¥1,697')
  })
})
