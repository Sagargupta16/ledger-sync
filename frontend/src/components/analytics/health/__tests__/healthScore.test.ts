import { describe, expect, it } from 'vitest'

import { computeCFPScore } from '@/lib/financialHealthCalculator'

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
