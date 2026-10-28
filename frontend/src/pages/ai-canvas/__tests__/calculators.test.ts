import { describe, expect, it } from 'vitest'

import { CALCULATE_TOOL } from '@/pages/ai-canvas/calculatorTool'
import { cagr, goal, inflation, loan, lumpsum, sip } from '@/pages/ai-canvas/calculators'

// Reference values worked by hand from the standard formulas.
describe('calculators', () => {
  it('sip: 10,000 a month at 12% for 10 years, paid at the start of each month', () => {
    // 10,000 x ((1.01^120 - 1) / 0.01) x 1.01
    const result = sip(10_000, 12, 10)

    expect(result.rows).toHaveLength(10)
    expect(result.summary.invested).toBe(1_200_000)
    expect(result.summary.value).toBe(2_323_391)
  })

  it('loan: 50 lakh at 8.5% over 20 years', () => {
    const result = loan(5_000_000, 8.5, 20)

    expect(result.summary.emi).toBe(43_391)
    expect(result.rows.at(-1)?.balance).toBe(0)
    expect(result.rows.reduce((sum, row) => sum + row.principal_paid, 0)).toBeCloseTo(5_000_000, -2)
  })

  it('lumpsum, inflation and cagr agree with their closed forms', () => {
    expect(lumpsum(100_000, 10, 2).summary.value).toBe(121_000)
    expect(inflation(100_000, 6, 10).summary.future_cost).toBe(179_085)
    expect(cagr(100_000, 200_000, 6).summary.cagr_pct).toBeCloseTo(12.25, 2)
  })

  it('goal: the monthly SIP grows to the target', () => {
    const result = goal(10_000_000, 12, 15)

    expect(result.rows.at(-1)?.value).toBeCloseTo(10_000_000, -2)
  })
})

describe('calculate tool', () => {
  it('returns rows for valid input and a correctable error otherwise', () => {
    const ok = CALCULATE_TOOL.run({ kind: 'sip', amount: 5000, annual_rate_pct: 12, years: 5 }) as { rows: unknown[] }
    const bad = CALCULATE_TOOL.run({ kind: 'sip', amount: 5000, annual_rate_pct: 12, years: 0 }) as { error: string }
    const unknown = CALCULATE_TOOL.run({ kind: 'mortgage', amount: 1, years: 1 }) as { error: string }

    expect(ok.rows).toHaveLength(5)
    expect(bad.error).toMatch(/years must be a number from 1 to 50/)
    expect(unknown.error).toMatch(/kind must be one of/)
  })
})
