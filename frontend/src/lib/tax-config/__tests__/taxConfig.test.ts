import { describe, it, expect } from 'vitest'
import { getTaxConfig, getAllFYConfigs } from '..'

describe('getTaxConfig', () => {
  it('returns FY 2025-26 config for start year 2025', () => {
    const cfg = getTaxConfig(2025)
    expect(cfg.fyStartYear).toBe(2025)
    expect(cfg.newRegime.slabs[0]).toEqual({ lower: 0, upper: 400_000, rate: 0 })
    expect(cfg.newRegime.rebate87A.maxIncome).toBe(1_200_000)
    expect(cfg.newRegime.standardDeduction).toBe(75_000)
  })

  it('returns FY 2024-25 config for start year 2024', () => {
    const cfg = getTaxConfig(2024)
    expect(cfg.fyStartYear).toBe(2024)
    expect(cfg.newRegime.slabs[1]).toEqual({ lower: 300_000, upper: 700_000, rate: 5 })
    expect(cfg.newRegime.rebate87A.maxIncome).toBe(700_000)
  })

  it('falls back to latest known config for future years', () => {
    // Unknown future FY should pick up the most recent config we know about.
    const cfg = getTaxConfig(2099)
    expect(cfg.fyStartYear).toBe(2025)
  })

  it('falls back to oldest known config for ancient years', () => {
    const cfg = getTaxConfig(1990)
    expect(cfg.fyStartYear).toBe(2023)
  })

  it('old regime standard deduction bumps to 75k from FY 2024-25', () => {
    expect(getTaxConfig(2023).oldRegime.standardDeduction).toBe(50_000)
    expect(getTaxConfig(2024).oldRegime.standardDeduction).toBe(75_000)
    expect(getTaxConfig(2025).oldRegime.standardDeduction).toBe(75_000)
  })

  it('every FY has cess 4% and professional tax 200/mo (current policy)', () => {
    for (const cfg of getAllFYConfigs()) {
      expect(cfg.cessRate).toBe(0.04)
      expect(cfg.professionalTaxPerMonth).toBe(200)
    }
  })
})
