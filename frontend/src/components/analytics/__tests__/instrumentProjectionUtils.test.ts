import { describe, expect, it } from 'vitest'

import { computeEpfContribution, computeWeightedReturn } from '../instrumentProjectionUtils'

describe('instrument projection adapters', () => {
  it('exposes the weighted-return display through the existing adapter name', () => {
    expect(computeWeightedReturn(60, 20, 20, {
      equity: 12,
      corp_bond: 6,
      govt_bond: 3,
    })).toBeCloseTo(9)
  })

  it('keeps the EPF display split and minimum for a voluntary contribution', () => {
    const contribution = computeEpfContribution(50_000, 20)
    expect(contribution.yourShare).toBe(10_000)
    expect(contribution.employerEpf).toBeCloseTo(4750.5)
    expect(contribution.totalMonthly).toBeCloseTo(14_750.5)
    expect(contribution.minContrib).toBe(6000)
  })
})
