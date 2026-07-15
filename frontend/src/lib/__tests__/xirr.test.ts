import { describe, expect, it } from 'vitest'
import { calculateXIRR } from '../xirr'

describe('calculateXIRR', () => {
  it('returns 0 for fewer than 2 cashflows', () => {
    expect(calculateXIRR([])).toBe(0)
    expect(calculateXIRR([{ date: new Date('2024-01-01'), amount: 100 }])).toBe(0)
  })

  it('solves a simple two-cashflow 10 % annualized return', () => {
    // Invest 100 on 2024-01-01, withdraw 110 on 2025-01-01.
    // XIRR should be ~10 %.
    const rate = calculateXIRR([
      { date: new Date('2024-01-01'), amount: 100 },
      { date: new Date('2025-01-01'), amount: -110 },
    ])
    expect(rate).toBeCloseTo(10, 1)
  })

  it('handles a monthly-SIP-style series', () => {
    // 12 monthly investments of ₹10k then sell for ₹130k one year after the
    // first flow. Rate should be a plausible positive XIRR (~21-23 %).
    const cashflows = Array.from({ length: 12 }, (_, m) => ({
      date: new Date(2024, m, 1),
      amount: 10_000,
    }))
    cashflows.push({ date: new Date(2025, 0, 1), amount: -130_000 })
    const rate = calculateXIRR(cashflows)
    expect(rate).toBeGreaterThan(10)
    expect(rate).toBeLessThan(40)
  })

  it('returns 0 when no root exists (all same-sign flows)', () => {
    // No rate is mathematically solvable -- all money goes in, none comes
    // out. NPV never crosses zero, so bisection reports no root.
    const rate = calculateXIRR([
      { date: new Date('2024-01-01'), amount: 100 },
      { date: new Date('2025-01-01'), amount: 50 },
    ])
    expect(rate).toBe(0)
  })

  it('solves a losing year instead of returning 0 (regression)', () => {
    // 100k in, 55k out a year later: true XIRR = -45%. Newton overshoots
    // below -100% here and the old guard reported 0% -- a losing portfolio
    // displayed as flat. Bisection fallback recovers the real rate.
    const rate = calculateXIRR([
      { date: new Date('2024-01-01'), amount: 100_000 },
      { date: new Date('2025-01-01'), amount: -55_000 },
    ])
    expect(rate).toBeCloseTo(-45, 0)
  })

  it('solves a near-total loss (deep negative rate)', () => {
    // 100k -> 500 in one year: XIRR = -99.5%.
    const rate = calculateXIRR([
      { date: new Date('2024-01-01'), amount: 100_000 },
      { date: new Date('2025-01-01'), amount: -500 },
    ])
    expect(rate).toBeCloseTo(-99.5, 0)
  })

  it('solves an extreme short-horizon gain via bisection when Newton leaves the bracket', () => {
    // 2x in one month annualizes to ~409,500% -- outside the 1000% bracket
    // cap, so the solver returns the bracket-capped estimate rather than 0.
    // What matters: a huge REAL gain never displays as 0%.
    const rate = calculateXIRR([
      { date: new Date('2025-01-01'), amount: 10_000 },
      { date: new Date('2025-02-01'), amount: -20_000 },
    ])
    expect(rate).toBeGreaterThan(500) // enormous, definitely not 0
  })

  it('still fast-paths a normal gain through Newton', () => {
    const rate = calculateXIRR([
      { date: new Date('2023-01-01'), amount: 50_000 },
      { date: new Date('2024-01-01'), amount: 20_000 },
      { date: new Date('2025-01-01'), amount: -90_000 },
    ])
    expect(rate).toBeGreaterThan(10)
    expect(rate).toBeLessThan(20)
  })
})
