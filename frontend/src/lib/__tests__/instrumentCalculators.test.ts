import { describe, it, expect } from 'vitest'

import {
  epfMonthlyContributions,
  projectEPF,
  EPF_WAGE_CEILING,
} from '../instrumentCalculators'

/**
 * EPF statutory split regression. The earlier bug passed the employee % for
 * BOTH employee and employer, inflating the corpus inflow to 24% of basic.
 * Correct: employee 12% (all to EPF) + employer EPF share, where the employer
 * contributes 12% of basic minus the EPS diversion (8.33% of capped ₹15k wage,
 * max ₹1,250/mo). So the employer EPF share is 3.67% only AT the ceiling and
 * grows above it.
 */
describe('epfMonthlyContributions', () => {
  it('splits employer 12% into EPF + EPS at the wage ceiling (~3.67% case)', () => {
    // EPS diversion is 8.33% of 15k = 1,249.5 (the "₹1,250 cap" is the rounded
    // figure; the statutory rate is 8.33%).
    const c = epfMonthlyContributions(EPF_WAGE_CEILING) // ₹15,000 basic, 12%
    expect(c.employee).toBeCloseTo(1_800, 1) // 12% of 15k
    expect(c.epsDiversion).toBeCloseTo(1_249.5, 1) // 8.33% of 15k
    expect(c.employerEpf).toBeCloseTo(550.5, 1) // 1,800 - 1,249.5
    expect(c.total).toBeCloseTo(2_350.5, 1)
  })

  it('employer EPF share exceeds 3.67% above the ceiling (EPS diversion capped)', () => {
    // ₹50,000 basic, 12%. Employer 12% = 6,000; EPS diversion capped at 8.33%
    // of 15k = 1,249.5 (NOT of 50k). Employer EPF = 6,000 - 1,249.5 = 4,750.5.
    const c = epfMonthlyContributions(50_000)
    expect(c.employee).toBeCloseTo(6_000, 1)
    expect(c.epsDiversion).toBeCloseTo(1_249.5, 1)
    expect(c.employerEpf).toBeCloseTo(4_750.5, 1)
    // total corpus inflow is ~10,750/mo — NOT 12,000 (the old 12%+12% bug).
    expect(c.total).toBeCloseTo(10_750.5, 1)
    expect(c.total).toBeLessThan(12_000)
  })

  it('VPF raises only the employee side, not the employer EPS split', () => {
    const base = epfMonthlyContributions(50_000, 12)
    const vpf = epfMonthlyContributions(50_000, 20)
    // Employee scales with the %, employer EPF + EPS diversion stay fixed.
    expect(vpf.employee).toBeCloseTo(10_000, 2) // 20% of 50k
    expect(vpf.employerEpf).toBeCloseTo(base.employerEpf, 2)
    expect(vpf.epsDiversion).toBeCloseTo(base.epsDiversion, 2)
  })
})

describe('projectEPF', () => {
  it('uses the statutory corpus inflow, not double the employee share', () => {
    // 1 year, 0% growth, ₹50k basic, 12%. Corpus inflow = 10,750.5 × 12 = 129,006.
    const r = projectEPF(50_000, 12, 0, 1, 0)
    expect(r.totalContributed).toBeCloseTo(129_006, 0)
    // The old 12%+12% bug would have produced 12,000 × 12 = 144,000.
    expect(r.totalContributed).toBeLessThan(144_000)
  })

  it('grows the corpus with the EPF rate (monthly compounding)', () => {
    const r = projectEPF(50_000, 12, 8.25, 1, 0)
    // With positive interest the maturity exceeds the contributed principal.
    expect(r.projectedValue).toBeGreaterThan(r.totalContributed)
  })
})
