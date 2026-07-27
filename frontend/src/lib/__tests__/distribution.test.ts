import { describe, expect, it } from 'vitest'

import {
  SKEW_THRESHOLD,
  formatSkewFactor,
  isHeavySkew,
  meanRateSubtitle,
  meanVsTypicalSubtitle,
  medianOf,
  seriesShape,
  skewFactor,
  typicalVsMeanSubtitle,
} from '../distribution'

/**
 * Anchored on the real 8,181-row ledger so the copy is exercised at the skew it
 * actually ships against, not a toy ratio:
 *   expense per transaction: n=5015, mean 796.56, median 76.00 (10.5x)
 *   spend per active day:    n=1403, mean 2847.29, median 407.00 (7.0x)
 *   spend per complete month: n=89,  mean 43675.28, median 12599.49 (3.5x)
 */
const REAL = {
  txnMean: 796.56,
  txnMedian: 76,
  dayMean: 2847.29,
  dayMedian: 407,
  monthMean: 43675.28,
  monthMedian: 12599.49,
} as const

const money = (n: number) => `Rs${Math.round(n)}`

describe('medianOf', () => {
  it('averages the two middles for an even-length list', () => {
    expect(medianOf([1, 2, 3, 4])).toBe(2.5)
  })

  it('takes the exact middle for an odd-length list', () => {
    expect(medianOf([5, 1, 3])).toBe(3)
  })

  it('returns the only element for a single-element list', () => {
    expect(medianOf([42])).toBe(42)
  })

  it('returns 0 for an empty list', () => {
    expect(medianOf([])).toBe(0)
  })

  it('returns the shared value when every element is identical', () => {
    expect(medianOf([80, 80, 80, 80])).toBe(80)
  })

  it('handles negative values without sorting them as strings', () => {
    // Default Array#sort is lexicographic: [-100,-3,-30] would come out -3.
    expect(medianOf([-3, -100, -30])).toBe(-30)
    expect(medianOf([-10, -1, 1, 10])).toBe(0)
  })

  it('does not mutate the caller array', () => {
    const input = [3, 1, 2]
    medianOf(input)
    expect(input).toEqual([3, 1, 2])
  })
})

describe('skewFactor', () => {
  it('reports the measured 10.5x expense-transaction skew', () => {
    expect(skewFactor(REAL.txnMean, REAL.txnMedian)).toBeCloseTo(10.48, 2)
  })

  it('returns null for a zero median rather than Infinity', () => {
    // An all-calendar-days spend series really does have a median of 0.
    expect(skewFactor(1581.07, 0)).toBeNull()
  })

  it('returns null for a negative median', () => {
    expect(skewFactor(100, -5)).toBeNull()
  })

  it('returns null for non-finite inputs', () => {
    expect(skewFactor(Number.NaN, 10)).toBeNull()
    expect(skewFactor(Number.POSITIVE_INFINITY, 10)).toBeNull()
  })
})

describe('isHeavySkew', () => {
  it('flags all three real spending distributions', () => {
    expect(isHeavySkew(REAL.txnMean, REAL.txnMedian)).toBe(true)
    expect(isHeavySkew(REAL.dayMean, REAL.dayMedian)).toBe(true)
    expect(isHeavySkew(REAL.monthMean, REAL.monthMedian)).toBe(true)
  })

  it('does not flag an even distribution', () => {
    expect(isHeavySkew(100, 100)).toBe(false)
  })

  it('is inclusive at the threshold', () => {
    expect(isHeavySkew(SKEW_THRESHOLD * 100, 100)).toBe(true)
    expect(isHeavySkew(1.19 * 100, 100)).toBe(false)
  })

  it('does not flag a left-skewed series, where the copy would be false', () => {
    expect(isHeavySkew(50, 100)).toBe(false)
  })

  it('does not flag when the median is zero', () => {
    expect(isHeavySkew(1581.07, 0)).toBe(false)
  })
})

describe('formatSkewFactor', () => {
  it('keeps one decimal below 10x', () => {
    expect(formatSkewFactor(3.47)).toBe('3.5x')
    expect(formatSkewFactor(1.2)).toBe('1.2x')
  })

  it('rounds to whole numbers at or above 10x', () => {
    expect(formatSkewFactor(10.48)).toBe('10x')
    expect(formatSkewFactor(56.65)).toBe('57x')
  })
})

describe('seriesShape', () => {
  it('returns mean and median together', () => {
    expect(seriesShape([1, 2, 3, 10])).toEqual({ mean: 4, median: 2.5 })
  })

  it('returns null for an empty series so 0 cannot pose as a statistic', () => {
    expect(seriesShape([])).toBeNull()
  })

  it('handles a single element', () => {
    expect(seriesShape([407])).toEqual({ mean: 407, median: 407 })
  })

  it('handles all-identical values', () => {
    expect(seriesShape([80, 80, 80])).toEqual({ mean: 80, median: 80 })
  })

  it('handles negative values', () => {
    expect(seriesShape([-4, -2])).toEqual({ mean: -3, median: -3 })
  })
})

describe('meanRateSubtitle', () => {
  const copy = {
    meanClause: 'Total spend spread over 2768 days',
    typicalNoun: 'spending day is',
  }

  it('appends the typical day when the daily series is skewed', () => {
    expect(meanRateSubtitle(REAL.dayMean, REAL.dayMedian, money, copy)).toBe(
      'Total spend spread over 2768 days; typical spending day is Rs407',
    )
  })

  it('falls back to the plain denominator when the median is unavailable', () => {
    expect(meanRateSubtitle(REAL.dayMean, null, money, copy)).toBe(copy.meanClause)
  })

  it('falls back when the distribution is even, so no second number is added', () => {
    expect(meanRateSubtitle(100, 95, money, copy)).toBe(copy.meanClause)
  })
})

describe('meanVsTypicalSubtitle', () => {
  it('names the statistic and quotes the typical amount', () => {
    expect(
      meanVsTypicalSubtitle(REAL.txnMean, REAL.txnMedian, money, 'Per transaction'),
    ).toBe('Mean; 10x the typical Rs76')
  })

  it('falls back when the median is zero', () => {
    expect(meanVsTypicalSubtitle(100, 0, money, 'Per transaction')).toBe('Per transaction')
  })

  it('falls back on an even distribution', () => {
    expect(meanVsTypicalSubtitle(101, 100, money, 'Per transaction')).toBe('Per transaction')
  })
})

describe('typicalVsMeanSubtitle', () => {
  const copy = { skewed: 'Typical spend. Mean is', even: 'Spending is fairly even' }

  it('quotes the mean as an amount, not as a multiple', () => {
    expect(typicalVsMeanSubtitle(REAL.txnMean, REAL.txnMedian, money, copy)).toBe(
      'Typical spend. Mean is Rs797',
    )
  })

  it('uses the even wording when mean and median agree', () => {
    expect(typicalVsMeanSubtitle(80, 80, money, copy)).toBe(copy.even)
  })

  it('uses the even wording when the median is 0 and no ratio exists', () => {
    expect(typicalVsMeanSubtitle(0, 0, money, copy)).toBe(copy.even)
  })
})
