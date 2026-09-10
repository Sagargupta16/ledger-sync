import { describe, expect, it } from 'vitest'

import {
  allocateHistoricalSIPValue,
  calculateSIPBenchmarkValue,
  projectMonthlySIP,
  type SIPProjectionInputs,
} from '../sipProjection'

const INPUTS: SIPProjectionInputs = {
  monthlySIP: 1_000,
  annualRate: 12,
  years: 1,
  sipGrowthRate: 0,
  startingCorpus: 10_000,
  initialInvested: 8_000,
}

describe('monthly SIP projection', () => {
  it('adds a contribution before applying the nominal monthly return', () => {
    expect(projectMonthlySIP({ ...INPUTS, years: 1 / 12 })).toEqual({
      months: [{ month: 1, value: 11_110, invested: 9_000 }],
      summary: { value: 11_110, invested: 9_000, returns: 2_110 },
    })
  })

  it('matches the fixed-payment annuity-due formula without rounding monthly balances', () => {
    const projection = projectMonthlySIP(INPUTS)
    const annualGrowth = 1.01 ** 12
    const expected = 10_000 * annualGrowth + 1_000 * 1.01 * (annualGrowth - 1) / 0.01

    expect(projection.months).toHaveLength(12)
    expect(projection.summary.value).toBeCloseTo(expected, 7)
    expect(projection.summary.invested).toBe(20_000)
    expect(projection.summary.returns).toBeCloseTo(expected - 20_000, 7)
    expect(projection.months.at(-1)?.value).toBe(projection.summary.value)
  })

  it('steps up only after each completed twelve-month contribution year at zero interest', () => {
    const projection = projectMonthlySIP({
      ...INPUTS, annualRate: 0, years: 25 / 12, sipGrowthRate: 10,
    })

    expect(projection.months[11]).toEqual({ month: 12, value: 22_000, invested: 20_000 })
    expect(projection.months[12]).toEqual({ month: 13, value: 23_100, invested: 21_100 })
    expect(projection.months[23]).toEqual({ month: 24, value: 35_200, invested: 33_200 })
    expect(projection.months[24]).toEqual({ month: 25, value: 36_410, invested: 34_410 })
    expect(projection.summary).toEqual({ value: 36_410, invested: 34_410, returns: 2_000 })
  })

  it.each([0, -5])('keeps contributions fixed for a nonpositive step-up of %s', (sipGrowthRate) => {
    const projection = projectMonthlySIP({
      ...INPUTS, annualRate: 0, years: 2, sipGrowthRate,
    })
    expect(projection.summary).toEqual({ value: 34_000, invested: 32_000, returns: 2_000 })
  })

  it('compounds the existing corpus when there is no monthly contribution', () => {
    const projection = projectMonthlySIP({ ...INPUTS, monthlySIP: 0, sipGrowthRate: 10 })
    expect(projection.summary.value).toBeCloseTo(10_000 * 1.01 ** 12, 7)
    expect(projection.summary.invested).toBe(8_000)
    expect(projection.months.every((month) => month.invested === 8_000)).toBe(true)
  })

  it('keeps a zero horizon at the supplied value and cost basis', () => {
    expect(projectMonthlySIP(Object.freeze({ ...INPUTS, years: 0 }))).toEqual({
      months: [],
      summary: { value: 10_000, invested: 8_000, returns: 2_000 },
    })
  })

  it('handles zero corpus, contributions, and interest without inventing a balance', () => {
    const projection = projectMonthlySIP({
      ...INPUTS, monthlySIP: 0, annualRate: 0, startingCorpus: 0, initialInvested: 0,
    })
    expect(projection.summary).toEqual({ value: 0, invested: 0, returns: 0 })
    expect(projection.months).toHaveLength(12)
    expect(projection.months.every((month) => month.value === 0 && month.invested === 0)).toBe(true)
  })
})

describe('historical SIP valuation', () => {
  it('allocates present gains or losses in proportion to contributed principal', () => {
    expect(allocateHistoricalSIPValue(10_000, 30_000, 36_000)).toBe(12_000)
    expect(allocateHistoricalSIPValue(30_000, 30_000, 36_000)).toBe(36_000)
    expect(allocateHistoricalSIPValue(10_000, 30_000, 24_000)).toBe(8_000)
  })

  it.each([0, -1_000])('preserves contributed value when the total basis is %s', (totalInvested) => {
    expect(allocateHistoricalSIPValue(500, totalInvested, 2_000)).toBe(500)
  })

  it('gives no interest in the contribution month, distinct from forward SIP timing', () => {
    const benchmark = calculateSIPBenchmarkValue(new Map([[0, 1_000]]), 0, 12)
    const forward = projectMonthlySIP({
      ...INPUTS, years: 1 / 12, startingCorpus: 0, initialInvested: 0,
    })
    expect(benchmark).toBe(1_000)
    expect(forward.summary.value).toBe(1_010)
  })

  it('compounds over calendar gaps and excludes contributions that are still in the future', () => {
    const contributions = new Map([[0, 10_000], [3, 10_000]])
    expect(calculateSIPBenchmarkValue(contributions, 0, 12)).toBe(10_000)
    expect(calculateSIPBenchmarkValue(contributions, 2, 12)).toBeCloseTo(10_201, 7)
    expect(calculateSIPBenchmarkValue(contributions, 3, 12)).toBeCloseTo(20_303.01, 7)
  })

  it('sums only contributions through the selected month at zero interest', () => {
    const contributions = new Map([[0, 10_000], [3, 10_000]])
    expect(calculateSIPBenchmarkValue(contributions, 2, 0)).toBe(10_000)
    expect(calculateSIPBenchmarkValue(contributions, 3, 0)).toBe(20_000)
    expect(calculateSIPBenchmarkValue(new Map(), 3, 12)).toBe(0)
  })
})
