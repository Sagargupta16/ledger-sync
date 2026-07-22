import { describe, expect, it } from 'vitest'

import { formatLikeSample, parseFormattedValue } from '../useAnimatedValue'

describe('parseFormattedValue', () => {
  it('parses indian-grouped currency', () => {
    const p = parseFormattedValue('₹45,33,242.00')
    expect(p).toMatchObject({ prefix: '₹', suffix: '', amount: 4533242, decimals: 2, grouping: 'indian' })
  })

  it('parses western-grouped currency', () => {
    const p = parseFormattedValue('$4,533,242.50')
    expect(p).toMatchObject({ prefix: '$', suffix: '', amount: 4533242.5, decimals: 2, grouping: 'western' })
  })

  it('parses percentages and plain numbers', () => {
    expect(parseFormattedValue('55.5%')).toMatchObject({ prefix: '', suffix: '%', amount: 55.5, decimals: 1, grouping: 'none' })
    expect(parseFormattedValue('396 days')).toMatchObject({ suffix: ' days', amount: 396 })
    expect(parseFormattedValue('42')).toMatchObject({ amount: 42, decimals: 0 })
  })

  it('returns null for non-numeric strings', () => {
    expect(parseFormattedValue('No data')).toBeNull()
    expect(parseFormattedValue('')).toBeNull()
  })
})

describe('formatLikeSample', () => {
  it('round-trips: formatting the parsed amount reproduces the original string', () => {
    for (const sample of ['₹45,33,242.00', '$4,533,242.50', '₹1,00,000.00', '55.5%', '₹999.00', '396 days', '1,234']) {
      const p = parseFormattedValue(sample)!
      expect(formatLikeSample(p.amount, p)).toBe(sample)
    }
  })

  it('formats intermediate values with the sample grouping', () => {
    const indian = parseFormattedValue('₹45,33,242.00')!
    expect(formatLikeSample(123456, indian)).toBe('₹1,23,456.00')
    const western = parseFormattedValue('$4,533,242.00')!
    expect(formatLikeSample(123456, western)).toBe('$123,456.00')
  })

  it('clamps negatives to zero (count-up starts at 0)', () => {
    const p = parseFormattedValue('₹500.00')!
    expect(formatLikeSample(-10, p)).toBe('₹0.00')
  })
})
