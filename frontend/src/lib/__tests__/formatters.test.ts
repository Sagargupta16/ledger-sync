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

    it('no conversion when rate is null', () => {
      usePreferencesStore.setState({
        displayCurrency: 'USD',
        exchangeRate: null,
      })
      // Should return unconverted value with USD symbol
      const result = formatCurrency(100000)
      expect(result).toContain('100,000')
    })
  })
})
