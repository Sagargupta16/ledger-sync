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

  it('returns 0 when solver diverges (e.g. all same-sign flows)', () => {
    // No positive return is mathematically solvable -- all money goes in,
    // none comes out. The guard kicks in and returns 0.
    const rate = calculateXIRR([
      { date: new Date('2024-01-01'), amount: 100 },
      { date: new Date('2025-01-01'), amount: 50 },
    ])
    expect(rate).toBe(0)
  })
})
