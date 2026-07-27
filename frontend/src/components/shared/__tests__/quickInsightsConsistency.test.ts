import { describe, expect, it } from 'vitest'

import { netSavings, savingsRatePercentOr } from '@/lib/savingsRate'

/**
 * The Quick Insights band prints total income, total expenses, net savings and a
 * savings rate on one card. The API response carries its own precomputed
 * `savings_rate` and `net_savings` fields, so reading those made the tiles
 * capable of contradicting the two totals sitting right beside them.
 *
 * `QuickInsights` now derives all three from the same income/expense pair. This
 * pins the arithmetic those tiles rely on, using the real-ledger figures the
 * divergence was measured against:
 *   rollup fast path (what /calculations/totals serves with no date filter):
 *     income 6,197,586.60, expense 3,963,936.11 -> 36.041%
 *   raw ledger (is_deleted = 0):
 *     income 6,209,549.71, expense 3,994,751.41 -> 35.668%
 * The 0.373pp gap is rollup staleness, NOT a formula difference -- the same
 * formula over each input reproduces each number. That is why this test asserts
 * self-consistency rather than a single "correct" rate.
 */

// The exact shape QuickInsights builds from the totals response.
const derive = (income: number, rawExpense: number) => {
  const expense = Math.abs(rawExpense)
  return {
    savingsRate: savingsRatePercentOr({ income, expense }),
    netSavings: netSavings({ income, expense }),
  }
}

describe('Quick Insights savings tiles', () => {
  it('reproduces the rollup rate from the rollup flows', () => {
    const { savingsRate } = derive(6_197_586.6, 3_963_936.11)
    expect(savingsRate).toBeCloseTo(36.041, 3)
  })

  it('reproduces the raw-ledger rate from the raw flows', () => {
    // Same formula, different input: proves the on-screen gap is data staleness
    // rather than two competing definitions of savings rate.
    const { savingsRate } = derive(6_209_549.71, 3_994_751.41)
    expect(savingsRate).toBeCloseTo(35.668, 3)
  })

  it('keeps the rate and net savings consistent with each other', () => {
    // rate% of income must equal net savings, or one tile contradicts another.
    const income = 6_197_586.6
    const { savingsRate, netSavings: net } = derive(income, 3_963_936.11)
    expect((savingsRate / 100) * income).toBeCloseTo(net, 6)
  })

  it('treats a negative expense total the same as a positive one', () => {
    // The API has shipped expenses as both signed and unsigned; Math.abs in the
    // component means the sign convention cannot flip the rate.
    expect(derive(100_000, -40_000)).toEqual(derive(100_000, 40_000))
  })

  it('falls back to 0 rather than dividing by zero income', () => {
    // 2019-02 in the real ledger: income 0, expense 400. A rate is undefined
    // there, and the tile shows 0 rather than Infinity or NaN.
    const { savingsRate, netSavings: net } = derive(0, 400)
    expect(savingsRate).toBe(0)
    expect(net).toBe(-400)
  })

  it('reports a deficit month as negative, never clamped to zero', () => {
    // 2026-07: income 13,511.11 against expense 107,651.65. Clamping this to 0%
    // would hide an overspend, which is the opposite of the tile's job.
    const { savingsRate } = derive(13_511.11, 107_651.65)
    expect(savingsRate).toBeLessThan(-600)
  })
})
