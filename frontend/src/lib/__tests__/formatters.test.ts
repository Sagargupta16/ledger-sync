import { describe, it, expect, beforeEach } from 'vitest'
import { usePreferencesStore } from '@/store/preferencesStore'
import { formatCurrency, formatCurrencyCompact, formatCurrencyShort } from '../formatters'

describe('formatters with currency conversion', () => {
  beforeEach(() => {
    // Reset to defaults (INR, no conversion)
    usePreferencesStore.setState({
      displayCurrency: 'INR',
      exchangeRate: null,
      exchangeRateUpdatedAt: null,
      displayPreferences: {
        numberFormat: 'indian',
        currencySymbol: '\u20B9',
        currencySymbolPosition: 'before',
        defaultTimeRange: 'all_time',
      },
    })
  })

  describe('no conversion (INR)', () => {
    it('formatCurrency returns INR formatted value', () => {
      const result = formatCurrency(123456.78)
      expect(result).toContain('\u20B9')
      expect(result).toContain('1,23,456.78')
    })

    it('formatCurrencyCompact rounds to integer', () => {
      const result = formatCurrencyCompact(123456.78)
      expect(result).toContain('\u20B9')
      expect(result).not.toContain('.')
    })

    it('formatCurrencyShort uses Lakhs and Crores', () => {
      expect(formatCurrencyShort(10000000)).toContain('Cr')
      expect(formatCurrencyShort(100000)).toContain('L')
      expect(formatCurrencyShort(5000)).toContain('K')
    })
  })

  describe('formatCurrency drops only a zero fraction', () => {
    it('drops the ".00" at lakh scale (the KPI defect)', () => {
      // Was "₹80,66,209.00" -- two zeros that only impede reading the magnitude.
      expect(formatCurrency(8066209)).toBe('₹80,66,209')
    })

    it('keeps decimals on a large value that does have paise', () => {
      // Rounding these away is what made displayed totals stop adding up.
      expect(formatCurrency(8066209.45)).toBe('₹80,66,209.45')
      expect(formatCurrency(1281.57)).toBe('₹1,281.57')
    })

    it('drops decimals on a small exact-integer value', () => {
      expect(formatCurrency(182)).toBe('₹182')
    })

    it('keeps decimals on a small value with real paise', () => {
      expect(formatCurrency(12.5)).toBe('₹12.50')
      expect(formatCurrency(47.75)).toBe('₹47.75')
    })

    it('keeps decimals on both sides of the old 1,000 threshold', () => {
      expect(formatCurrency(999.99)).toBe('₹999.99')
      expect(formatCurrency(1000)).toBe('₹1,000')
      expect(formatCurrency(1000.25)).toBe('₹1,000.25')
    })

    it('keeps parts summing to their displayed total (real 2026-06 categories)', () => {
      // Exact category amounts under an exact month total. Any magnitude-based
      // rounding puts a visible gap between the rows and the header.
      const parts = [1281.57, 833.69, 173.0]
      const total = parts.reduce((sum, part) => sum + part, 0)
      expect(parts.map((part) => formatCurrency(part))).toEqual([
        '₹1,281.57',
        '₹833.69',
        '₹173',
      ])
      expect(formatCurrency(total)).toBe('₹2,288.26')
    })

    it('keeps one row internally consistent (budget limit/spent/remaining)', () => {
      // Was "Budget ₹5,000 / Spent ₹4,501 / Remaining ₹499.40" in a single row.
      expect(formatCurrency(5000)).toBe('₹5,000')
      expect(formatCurrency(4500.6)).toBe('₹4,500.60')
      expect(formatCurrency(5000 - 4500.6)).toBe('₹499.40')
    })

    it('keeps decimals on negatives of every magnitude', () => {
      // Sign placement is pre-existing behaviour: the symbol is prepended to the
      // already-signed locale string, so it reads "₹-45.75" (not "-₹45.75").
      expect(formatCurrency(-45.75)).toBe('₹-45.75')
      expect(formatCurrency(-999.5)).toBe('₹-999.50')
      expect(formatCurrency(-5000.5)).toBe('₹-5,000.50')
      expect(formatCurrency(-8066209)).toBe('₹-80,66,209')
    })

    it('renders zero without decimals and without a sign', () => {
      expect(formatCurrency(0)).toBe('₹0')
      // Float-sum residue must not surface as "-₹0".
      expect(formatCurrency(-0.0000001)).toBe('₹0')
      expect(formatCurrency(-0)).toBe('₹0')
    })

    it('respects a 0-decimal currency (JPY has no sub-unit)', () => {
      // Rate 1 isolates the decimals rule from the FX arithmetic. It must be a
      // real rate, not null: a currency with no rate is no longer rendered as
      // that currency at all (an unconvertible amount labelled with a foreign
      // symbol was the AED money-lie), so a null here would format as INR.
      usePreferencesStore.setState({ displayCurrency: 'JPY', exchangeRate: 1 })
      expect(formatCurrency(1234.56)).toBe('¥1,235')
      expect(formatCurrency(12.5)).toBe('¥13')
      expect(formatCurrency(0.4)).toBe('¥0')
    })

    it('reads the fraction off the CONVERTED value, not the base value', () => {
      // 50,000 INR is a whole number, 593.50 USD is not, so the cents must be
      // decided post-FX.
      usePreferencesStore.setState({ displayCurrency: 'USD', exchangeRate: 0.01187 })
      expect(formatCurrency(50000)).toBe('$593.50')
      expect(formatCurrency(100000)).toBe('$1,187')
      expect(formatCurrency(8066209)).toBe('$95,745.90')
    })

    it('keeps the trailing symbol position for after-symbol currencies', () => {
      // Rate 1 for the same reason as the JPY case above: symbol position is
      // what is under test, and a rateless currency now renders as INR.
      usePreferencesStore.setState({ displayCurrency: 'SEK', exchangeRate: 1 })
      // sv-SE groups with a non-breaking space (U+00A0), not a plain space.
      expect(formatCurrency(12345)).toBe('12 345kr')
      expect(formatCurrency(123.45)).toBe('123,45kr')
    })
  })

  describe('with conversion (USD)', () => {
    beforeEach(() => {
      usePreferencesStore.setState({
        displayCurrency: 'USD',
        exchangeRate: 0.01187,
        exchangeRateUpdatedAt: new Date().toISOString(),
        displayPreferences: {
          numberFormat: 'international',
          currencySymbol: '$',
          currencySymbolPosition: 'before',
          defaultTimeRange: 'all_time',
        },
      })
    })

    it('formatCurrency converts and formats as USD', () => {
      // 100000 INR * 0.01187 = 1187 USD
      const result = formatCurrency(100000)
      expect(result).toContain('$')
      expect(result).toContain('1,187')
    })

    it('formatCurrencyShort uses M and K instead of Cr and L', () => {
      // 1 billion INR * 0.01187 = 11.87M USD
      const result = formatCurrencyShort(1000000000)
      expect(result).toContain('M')
      expect(result).not.toContain('Cr')
      expect(result).not.toContain('L')
    })

    it('formatCurrencyShort uses K for thousands', () => {
      // 10M INR * 0.01187 = 118.7K USD
      const result = formatCurrencyShort(10000000)
      expect(result).toContain('K')
    })
  })

  describe('edge cases', () => {
    it('handles zero', () => {
      expect(formatCurrency(0)).toContain('0')
    })

    it('handles negative values', () => {
      const result = formatCurrency(-5000)
      expect(result).toContain('-')
    })

    it('formatCurrencyCompact always rounds to an integer', () => {
      expect(formatCurrencyCompact(12.5)).toBe('₹13')
      expect(formatCurrencyCompact(182)).toBe('₹182')
      expect(formatCurrencyCompact(8066209.45)).toBe('₹80,66,209')
    })

    it('formatCurrencyCompact rounds negative half-units away from zero', () => {
      // GoalCard renders one `remaining` through both formatters, so a
      // Math.round (half toward +Infinity) compact would show ₹-1,679 next to
      // formatCurrency's ₹-1,679.50 rounded as ₹-1,680.
      expect(formatCurrencyCompact(-1679.5)).toBe('₹-1,680')
      expect(formatCurrencyCompact(-2500.5)).toBe('₹-2,501')
      expect(formatCurrencyCompact(1679.5)).toBe('₹1,680')
    })

    it('formatCurrencyCompact agrees with formatCurrency on the rounded value', () => {
      // Both formatters round half away from zero, so compact(v) must read the
      // same as formatCurrency applied to that same rounded whole number.
      for (const value of [-2500.5, -1679.5, -0.4, 0, 1679.5, 8066209.45]) {
        const rounded = Math.sign(value) * Math.round(Math.abs(value))
        expect(formatCurrencyCompact(value)).toBe(formatCurrency(rounded))
      }
    })

    it('formatCurrencyCompact collapses a float residue to an unsigned zero', () => {
      // Must not emit "₹-0" while formatCurrency emits "₹0" on the same page.
      expect(formatCurrencyCompact(-0.0000001)).toBe('₹0')
      expect(formatCurrencyCompact(-0.4)).toBe('₹0')
      expect(formatCurrencyCompact(-0)).toBe('₹0')
      expect(formatCurrencyCompact(0)).toBe('₹0')
    })

    it('formatCurrencyShort still abbreviates below the threshold', () => {
      // Unchanged: short keeps its one-decimal abbreviated units.
      expect(formatCurrencyShort(182)).toBe('₹182')
      expect(formatCurrencyShort(8066209)).toBe('₹80.7L')
    })

    it('no conversion when rate is null', () => {
      usePreferencesStore.setState({
        displayCurrency: 'USD',
        exchangeRate: null,
      })
      // Unconverted digits, and therefore labelled and grouped as the base
      // currency. This test previously asserted the USD symbol stayed on an
      // unconverted amount, which was the defect: see
      // formattersCurrencyIntegrity.test.ts.
      const result = formatCurrency(100000)
      expect(result).toBe('₹1,00,000')
    })
  })
})
