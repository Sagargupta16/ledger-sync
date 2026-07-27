import { describe, expect, it } from 'vitest'

import { computeCFPScore, type BalanceInputs } from '@/lib/financialHealthCalculator'

import { computeBalancePosition } from '../healthScoreBalances'
import { computeAnalysis, computeMonthlyData } from '../healthScoreAnalysis'
import { weightedCoefficientOfVariation } from '../healthScoreTypes'
import type { AccountBalances } from '@/services/api/calculations'
import type { Transaction } from '@/types'

// ─── weightedCoefficientOfVariation ──────────────────────────────────────────

describe('weightedCoefficientOfVariation', () => {
  it('returns 0 for empty input', () => {
    expect(weightedCoefficientOfVariation([])).toBe(0)
  })

  it('returns ~0 when all values are equal (no dispersion)', () => {
    expect(weightedCoefficientOfVariation([100, 100, 100, 100])).toBeCloseTo(0, 6)
  })

  it('penalizes recent volatility more than old volatility (recency weighting)', () => {
    // Same eight values, opposite order. Oldest-first arrays.
    const volatileRecent = [50000, 50000, 50000, 50000, 10000, 90000, 10000, 90000]
    const volatileOld = [10000, 90000, 10000, 90000, 50000, 50000, 50000, 50000]
    // When the swings are recent they should dominate the reading; when they
    // are old (and the recent stretch is steady) the CV should be much lower.
    expect(weightedCoefficientOfVariation(volatileRecent)).toBeGreaterThan(
      weightedCoefficientOfVariation(volatileOld),
    )
  })

  it('discounts old lean months so a now-steady earner is not flagged volatile', () => {
    // Two early stipend months, then a steady salary (oldest-first).
    const ramp = [500, 800, 50000, 50000, 50000, 50000, 50000, 50000]
    const weighted = weightedCoefficientOfVariation(ramp)
    const mean = ramp.reduce((a, b) => a + b, 0) / ramp.length
    const variance = ramp.reduce((s, v) => s + (v - mean) ** 2, 0) / ramp.length
    const unweighted = (Math.sqrt(variance) / mean) * 100
    // Recency weighting pulls the reading below the unweighted CV...
    expect(weighted).toBeLessThan(unweighted)
    // ...and keeps it out of the "volatile" band (>75%), so the score is not floored.
    expect(weighted).toBeLessThan(75)
  })
})

// ─── computeBalancePosition ──────────────────────────────────────────────────

function balances(accounts: Record<string, number>): AccountBalances['accounts'] {
  return Object.fromEntries(
    Object.entries(accounts).map(([name, balance]) => [
      name,
      { balance, transactions: 1, last_transaction: null },
    ]),
  )
}

const categorize = (name: string): string => {
  if (name.startsWith('Bank')) return 'Bank Accounts'
  if (name.startsWith('Cash') || name.startsWith('Wallet')) return 'Cash & Wallets'
  if (name.startsWith('Invest')) return 'Investments'
  if (name.startsWith('CC')) return 'Credit Cards'
  return 'Other'
}

describe('computeBalancePosition', () => {
  it('sums bank + cash + wallet balances into liquid assets', () => {
    const pos = computeBalancePosition(
      balances({ 'Bank SBI': 280000, 'Cash in hand': 8000, 'Wallet GPay': 2000 }),
      categorize,
    )
    expect(pos.liquidAssets).toBe(290000)
    expect(pos.investmentAssets).toBe(0)
    expect(pos.totalLiabilities).toBe(0)
    expect(pos.netWorth).toBe(290000)
  })

  it('files investment accounts separately from the liquid buffer', () => {
    const pos = computeBalancePosition(
      balances({ 'Bank SBI': 100000, 'Invest MF': 200000, 'Invest EPF': 180000 }),
      categorize,
    )
    expect(pos.liquidAssets).toBe(100000)
    expect(pos.investmentAssets).toBe(380000)
    expect(pos.totalAssets).toBe(480000)
  })

  it('treats any negative balance as a liability regardless of category', () => {
    const pos = computeBalancePosition(
      balances({ 'Bank SBI': 100000, 'CC Amazon': -25000 }),
      categorize,
    )
    expect(pos.liquidAssets).toBe(100000)
    expect(pos.totalLiabilities).toBe(25000)
    expect(pos.netWorth).toBe(75000)
  })

  it('skips excluded accounts', () => {
    const pos = computeBalancePosition(
      balances({ 'Bank SBI': 100000, 'Bank Old': 50000 }),
      categorize,
      (name) => name === 'Bank Old',
    )
    expect(pos.liquidAssets).toBe(100000)
  })
})

// ─── Emergency fund / liquidity from real balances ───────────────────────────

/** Build N months of a steady salaried earner: 100k income, 40k expense. */
function steadyLedger(months: number): Transaction[] {
  const txns: Transaction[] = []
  for (let i = 0; i < months; i++) {
    const m = String(i + 1).padStart(2, '0')
    const date = `2025-${m}-05`
    txns.push({ id: `inc-${i}`, date, amount: 100000, type: 'Income', category: 'Salary', account: 'Bank SBI' })
    txns.push({ id: `exp-${i}`, date, amount: 40000, type: 'Expense', category: 'Rent', account: 'Bank SBI' })
  }
  return txns
}

describe('emergency fund uses real liquid balance, not the flow proxy', () => {
  const noInvestment = () => false

  it('reads months of coverage from real bank balances even when the flow proxy would be 0', () => {
    const txns = steadyLedger(6)
    const built = computeMonthlyData(txns, noInvestment)
    expect(built).not.toBeNull()

    // Real balances: 300k liquid in the bank, avg monthly expense 40k -> 7.5 months.
    const pos = computeBalancePosition(balances({ 'Bank SBI': 300000 }), categorize)
    const withBalances = computeAnalysis(built!.months, built!.monthlyData, pos)
    expect(withBalances.emergencyFundMonths).toBeCloseTo(7.5, 1)
    expect(withBalances.balances?.liquidAssets).toBe(300000)
  })

  it('CFP liquidity + emergency ratios reflect real balances', () => {
    const pos = computeBalancePosition(
      balances({ 'Bank SBI': 300000, 'Invest MF': 500000, 'CC Amazon': -20000 }),
      categorize,
    )
    const result = computeCFPScore({
      totalIncome: 600000,
      totalExpenses: 240000,
      avgMonthlyIncome: 100000,
      avgMonthlyExpense: 40000,
      avgMonthlyEssentialExpense: 30000,
      avgMonthlyDebt: 0,
      cumulativeNetSavings: 360000,
      netInvestments: 500000,
      totalDebtOutstanding: 0,
      balances: pos,
    })
    const liquidity = result.ratios.find((r) => r.name === 'Liquidity Ratio')!
    const emergency = result.ratios.find((r) => r.name === 'Emergency Fund')!
    const solvency = result.ratios.find((r) => r.name === 'Solvency Ratio')!
    // 300k liquid / 40k monthly = 7.5 months -> strong, non-zero.
    expect(liquidity.value).toBeCloseTo(7.5, 1)
    expect(emergency.value).toBeCloseTo(7.5, 1)
    expect(liquidity.score).toBeGreaterThan(60)
    // Net worth 780k / total assets 800k = 97.5% solvency.
    expect(solvency.value).toBeCloseTo(97.5, 1)
  })

  it('falls back to the flow proxy when no balances are supplied', () => {
    const result = computeCFPScore({
      totalIncome: 600000,
      totalExpenses: 240000,
      avgMonthlyIncome: 100000,
      avgMonthlyExpense: 40000,
      avgMonthlyEssentialExpense: 30000,
      avgMonthlyDebt: 0,
      cumulativeNetSavings: 360000,
      netInvestments: 100000,
      totalDebtOutstanding: 0,
    })
    // proxy liquid = 360k - 100k = 260k; 260k / 40k = 6.5 months.
    const emergency = result.ratios.find((r) => r.name === 'Emergency Fund')!
    expect(emergency.value).toBeCloseTo(6.5, 1)
  })
})

// ─── Sub-scores below the "poor" floor ───────────────────────────────────────

describe('scoring below the poor floor', () => {
  /** Steady inputs; each test overrides only the flows the ratio under test reads. */
  const base = {
    totalIncome: 600000,
    totalExpenses: 240000,
    avgMonthlyIncome: 100000,
    avgMonthlyExpense: 40000,
    avgMonthlyEssentialExpense: 30000,
    avgMonthlyDebt: 0,
    cumulativeNetSavings: 360000,
    netInvestments: 0,
    totalDebtOutstanding: 0,
  }
  const ratio = (name: string, overrides: Partial<typeof base>) =>
    computeCFPScore({ ...base, ...overrides }).ratios.find((r) => r.name === name)!

  it('keeps getting worse as the savings rate falls past the floor', () => {
    // The interpolation below the floor used to be `(value / poorMax) * 20`,
    // which GROWS when poorMax is negative (-10 here) and so pinned at the
    // clamp: every rate from -10% to -696.8% scored an identical 20/100 and
    // nothing could ever reach 0. These must strictly decrease.
    const mild = ratio('Savings Rate', { totalIncome: 100000, totalExpenses: 112000 })
    const bad = ratio('Savings Rate', { totalIncome: 100000, totalExpenses: 150000 })
    const dire = ratio('Savings Rate', { totalIncome: 13511.11, totalExpenses: 107651.65 })

    expect(mild.value).toBeCloseTo(-12, 6)
    expect(dire.value).toBeCloseTo(-696.77, 1)
    expect(mild.score).toBeLessThan(20)
    expect(bad.score).toBeLessThan(mild.score)
    expect(dire.score).toBe(0)
  })

  it('scores a net-withdrawal investment period below the floor too', () => {
    // Same defect, second call site: the investment ratio's floor is -5.
    const withdrawn = ratio('Investment Ratio', { netInvestments: -300000 })
    expect(withdrawn.value).toBeCloseTo(-50, 6)
    expect(withdrawn.score).toBe(0)
  })

  /**
   * The below-floor branch is SHARED by all five non-inverse ratios, so it moves
   * Solvency too -- and there the score goes UP for a barely-insolvent user:
   * `(value / 0) * 20` was -Infinity, so the old code floored EVERY negative net
   * worth to 0. These pin the direction and the magnitude so the change can
   * never be mistaken for a savings-rate-only edit again.
   */
  const solvency = (netWorth: number, totalAssets: number) =>
    computeCFPScore({
      ...base,
      balances: {
        liquidAssets: Math.max(0, netWorth),
        investmentAssets: 0,
        totalLiabilities: Math.max(0, totalAssets - netWorth),
        totalAssets,
        netWorth,
      },
    }).ratios.find((r) => r.name === 'Solvency Ratio')!

  it('grades an insolvent user instead of flooring every negative net worth to 0', () => {
    // -5% solvency: 0 under the old `(value / poorMax) * 20`, 16 now.
    const mild = solvency(-5000, 100000)
    expect(mild.value).toBeCloseTo(-5, 6)
    expect(mild.score).toBe(16)
    // Deeper insolvency scores strictly lower, and one band down reaches 0.
    const worse = solvency(-10000, 100000)
    const dire = solvency(-25000, 100000)
    expect(worse.score).toBe(12)
    expect(worse.score).toBeLessThan(mild.score)
    expect(dire.score).toBe(0)
    expect(solvency(-300000, 100000).score).toBe(0)
  })

  it('never calls an insolvent position anything but poor, whatever the score', () => {
    // The caption is unchanged, so the status must not drift into "warning"
    // just because the bar is no longer pinned at zero. Note -100 (-0.1%) scores
    // 19.92 and DISPLAYS as 20 after rounding, which is the point: the cliff at
    // zero is gone, so a hair below break-even now reads like a hair above it.
    for (const nw of [-100, -5000, -10000, -24000]) {
      const r = solvency(nw, 100000)
      expect({ nw, status: r.status }).toEqual({ nw, status: 'poor' })
      expect(r.score).toBeLessThanOrEqual(20)
    }
  })

  it('leaves a solvent position untouched', () => {
    // Positive solvency never reaches the below-floor branch, so the rewrite
    // must not move any of these.
    expect(solvency(97500, 100000).score).toBe(100)
    expect(solvency(50000, 100000).score).toBe(60)
    expect(solvency(0, 100000).score).toBe(20)
  })

  it('does not move liquidity or emergency fund, whose value cannot go negative', () => {
    // Both read months of coverage from a non-negative numerator, so value < 0
    // is unreachable and value === 0 is taken by the `>= poorMax` branch.
    const zeroLiquid = computeCFPScore({
      ...base,
      balances: {
        liquidAssets: 0,
        investmentAssets: 100000,
        totalLiabilities: 0,
        totalAssets: 100000,
        netWorth: 100000,
      },
    })
    for (const name of ['Liquidity Ratio', 'Emergency Fund']) {
      const r = zeroLiquid.ratios.find((x) => x.name === name)!
      expect({ name, value: r.value, score: r.score }).toEqual({ name, value: 0, score: 20 })
    }
  })

  it('reports a bounded percentage when liabilities exceed a real asset side', () => {
    // 100k owned against 150k owed is -50% solvency, not a 7-digit reading: the
    // denominator is the real asset total, so the printed figure stays a
    // percentage a reader can act on.
    const underwater = solvency(-50000, 100000)
    expect(underwater.value).toBeCloseTo(-50, 6)
    expect(underwater.formattedValue).toBe('-50%')
    expect(underwater.score).toBe(0)
  })

  it('never leaves a sub-score outside 0..100', () => {
    // A catastrophic period must stay renderable: no NaN, no negative width on
    // the progress bars, no >100 score feeding the weighted composite.
    const result = computeCFPScore({
      ...base,
      totalIncome: 1,
      totalExpenses: 5000000,
      avgMonthlyIncome: 1,
      avgMonthlyExpense: 500000,
      avgMonthlyDebt: 400000,
      cumulativeNetSavings: -5000000,
      netInvestments: -100000,
      totalDebtOutstanding: 900000,
    })
    for (const r of result.ratios) {
      expect(Number.isFinite(r.score)).toBe(true)
      expect(r.score).toBeGreaterThanOrEqual(0)
      expect(r.score).toBeLessThanOrEqual(100)
    }
    expect(result.compositeScore).toBeGreaterThanOrEqual(0)
    expect(result.compositeScore).toBeLessThanOrEqual(100)
  })
})

// ─── Solvency with no asset side at all ──────────────────────────────────────

/**
 * `computeSolvencyRatio` carries its own zero-asset fallback (no denominator, so
 * the ratio is answered by the sign of net worth), and the call site used to make
 * it unreachable by passing `totalAssets > 0 ? totalAssets : 1`. Dividing by that
 * sentinel rupee is not a guard, it is a unit change: net worth in rupees came
 * back out as a percentage, so the card rendered `-25000000%`.
 *
 * These pin both halves -- the fallback the function intends, and the bounded
 * percentage the card must print -- on BOTH asset paths, since the flow proxy
 * reaches `totalAssets === 0` for anyone whose lifetime surplus is zero.
 */
describe('solvency when total assets are zero', () => {
  const base = {
    totalIncome: 600000,
    totalExpenses: 240000,
    avgMonthlyIncome: 100000,
    avgMonthlyExpense: 40000,
    avgMonthlyEssentialExpense: 30000,
    avgMonthlyDebt: 0,
    cumulativeNetSavings: 0,
    netInvestments: 0,
    totalDebtOutstanding: 0,
  }
  const solvency = (overrides: Partial<typeof base> & { balances?: BalanceInputs }) =>
    computeCFPScore({ ...base, ...overrides }).ratios.find((r) => r.name === 'Solvency Ratio')!

  it('takes the intended fallback for all-zero balances instead of scoring them poor', () => {
    // Nothing owned and nothing owed is fully solvent by the function's own
    // definition. The sentinel made this read 0% / 20 / poor.
    const flat = solvency({
      balances: {
        liquidAssets: 0,
        investmentAssets: 0,
        totalLiabilities: 0,
        totalAssets: 0,
        netWorth: 0,
      },
    })
    expect(flat.value).toBe(100)
    expect(flat.score).toBe(100)
    expect(flat.status).toBe('good')
    expect(flat.formattedValue).toBe('100%')
  })

  it('reports 0%, not rupees-as-percent, when debt is owed against no assets', () => {
    // Liabilities with no asset side: the fallback floors the ratio at 0.
    // Through the sentinel this was `-25000 / 1 * 100` -> `-2500000%`.
    const owing = solvency({
      balances: {
        liquidAssets: 0,
        investmentAssets: 0,
        totalLiabilities: 25000,
        totalAssets: 0,
        netWorth: -25000,
      },
    })
    expect(owing.value).toBe(0)
    expect(owing.score).toBe(20)
    expect(owing.status).toBe('poor')
    expect(owing.formattedValue).toBe('0%')
  })

  it('applies the same fallback on the flow proxy, whose assets can also be zero', () => {
    // No balances supplied: the proxy clamps liquid assets to 0, so a user
    // carrying debt with no recorded surplus hits the same degenerate branch.
    const proxied = solvency({ totalDebtOutstanding: 250000 })
    expect(proxied.value).toBe(0)
    expect(proxied.formattedValue).toBe('0%')
    // And with no debt either, the proxy's net worth is 0 -> the 100% fallback.
    expect(solvency({}).value).toBe(100)
  })

  it('leaves a real positive asset side computing exactly what it did before', () => {
    // Regression guard: the fix only removes the sentinel, so every case with a
    // genuine denominator must be untouched. 780k net worth / 800k assets.
    const real = solvency({
      balances: {
        liquidAssets: 300000,
        investmentAssets: 500000,
        totalLiabilities: 20000,
        totalAssets: 800000,
        netWorth: 780000,
      },
    })
    expect(real.value).toBeCloseTo(97.5, 6)
    expect(real.score).toBe(100)
    expect(real.formattedValue).toBe('98%')
  })
})
