import { describe, expect, it } from 'vitest'

import {
  buildMonthlyNetWorthBalances,
  computeAvgMonthlyGrowth,
  computeLinearGrowthStats,
  computeNetWorthTimeSeries,
  summarizeNetWorthAccounts,
} from '../netWorth'

const QUARTERLY_BALANCES = [
  { date: '2025-01-31', netWorth: 100_000 },
  { date: '2025-04-30', netWorth: 130_000 },
  { date: '2025-07-31', netWorth: 160_000 },
]

describe('calendar-month net-worth balances', () => {
  it('carries inactive months instead of treating quarterly rows as monthly observations', () => {
    expect(buildMonthlyNetWorthBalances(QUARTERLY_BALANCES)).toEqual([
      { date: '2025-01-31', netWorth: 100_000 },
      { date: '2025-02-28', netWorth: 100_000 },
      { date: '2025-03-31', netWorth: 100_000 },
      { date: '2025-04-30', netWorth: 130_000 },
      { date: '2025-05-31', netWorth: 130_000 },
      { date: '2025-06-30', netWorth: 130_000 },
      { date: '2025-07-31', netWorth: 160_000 },
    ])
  })

  it('keeps the latest observation per month and never extends a partial final month', () => {
    const series = Object.freeze([
      Object.freeze({ date: '2024-03-10', netWorth: 200 }),
      Object.freeze({ date: '2024-01-05', netWorth: 50 }),
      Object.freeze({ date: '2024-01-20', netWorth: 100 }),
    ])
    expect(buildMonthlyNetWorthBalances(series)).toEqual([
      { date: '2024-01-31', netWorth: 100 },
      { date: '2024-02-29', netWorth: 100 },
      { date: '2024-03-10', netWorth: 200 },
    ])
    expect(series[0].date).toBe('2024-03-10')
  })

  it('carries zero and negative balances across the year boundary', () => {
    expect(buildMonthlyNetWorthBalances([
      { date: '2024-11-30', netWorth: -100 },
      { date: '2025-01-31', netWorth: 0 },
      { date: '2025-03-31', netWorth: 50 },
    ]).map((point) => point.netWorth)).toEqual([-100, -100, 0, 0, 50])
  })

  it('does not invent a starting balance or extra months for a single observation', () => {
    expect(buildMonthlyNetWorthBalances([])).toEqual([])
    expect(buildMonthlyNetWorthBalances([{ date: '2025-04-12', netWorth: 100 }]))
      .toEqual([{ date: '2025-04-12', netWorth: 100 }])
  })
})

describe('calendar lookback and growth', () => {
  it('measures the six elapsed monthly intervals as 10,000 per month', () => {
    expect(computeAvgMonthlyGrowth(QUARTERLY_BALANCES)).toBe(10_000)
    const stats = computeLinearGrowthStats(QUARTERLY_BALANCES)
    expect(stats.growth).toBe(10_000)
    // Observed monthly deltas are 0, 0, 30k, 0, 0, 30k.
    expect(stats.sigma).toBeCloseTo(15_491.933385, 5)
  })

  it('uses calendar months rather than the last twelve observed rows', () => {
    const series = [
      { date: '2023-01-31', netWorth: 1_000_000 },
      { date: '2024-01-31', netWorth: 2_000_000 },
      { date: '2024-06-30', netWorth: 2_030_000 },
      { date: '2025-01-31', netWorth: 2_060_000 },
    ]
    expect(computeAvgMonthlyGrowth(series, 12)).toBe(5_000)
    expect(computeLinearGrowthStats(series, 12).growth).toBe(5_000)
  })

  it('uses a carried balance at the lookback boundary', () => {
    expect(computeAvgMonthlyGrowth(QUARTERLY_BALANCES, 2)).toBe(15_000)
    expect(computeLinearGrowthStats(QUARTERLY_BALANCES, 2).growth).toBe(15_000)
    expect(computeAvgMonthlyGrowth(QUARTERLY_BALANCES, 3)).toBe(10_000)
  })

  it('has enough calendar observations for variance between two sparse snapshots', () => {
    const series = QUARTERLY_BALANCES.slice(0, 2)
    expect(computeLinearGrowthStats(series).growth).toBe(10_000)
    expect(computeLinearGrowthStats(series).sigma).toBeCloseTo(17_320.508076, 5)
  })

  it('does not widen a requested lookback to manufacture variance', () => {
    expect(computeAvgMonthlyGrowth(QUARTERLY_BALANCES, 1)).toBe(30_000)
    expect(computeLinearGrowthStats(QUARTERLY_BALANCES, 1)).toEqual({ growth: 0, sigma: 0 })
    expect(computeAvgMonthlyGrowth(QUARTERLY_BALANCES, 0)).toBe(0)
    expect(computeLinearGrowthStats(QUARTERLY_BALANCES, 0)).toEqual({ growth: 0, sigma: 0 })
  })
})

describe('positive included asset allocation', () => {
  const excluded = ['Credit Cards', 'Loans/Lended', 'Other']

  it('keeps an overdraft separate and allocates a 60,000 cash-flow balance without inflation', () => {
    const summary = summarizeNetWorthAccounts([
      { category: 'Bank Accounts', balance: 100_000 },
      { category: 'Bank Accounts', balance: -40_000 },
    ], excluded)
    expect(summary).toEqual({
      totalAssets: 100_000,
      totalLiabilities: 40_000,
      netWorth: 60_000,
      assetCategories: ['Bank Accounts'],
      categoryProportions: { 'Bank Accounts': 1 },
    })
    const series = computeNetWorthTimeSeries([
      { date: '2025-01-31', type: 'Income', amount: 100_000 },
      { date: '2025-01-31', type: 'Expense', amount: 40_000 },
    ], summary.assetCategories, summary.categoryProportions)
    expect(series[0]).toMatchObject({ netWorth: 60_000, 'Bank Accounts': 60_000 })
  })

  it('uses exactly the included positive categories in the allocation denominator', () => {
    const summary = summarizeNetWorthAccounts([
      { category: 'Bank Accounts', balance: 100_000 },
      { category: 'Investments', balance: 50_000 },
      { category: 'Investments', balance: -20_000 },
      { category: 'Loans/Lended', balance: 30_000 },
      { category: 'Credit Cards', balance: 5_000 },
      { category: 'Other', balance: 15_000 },
      { category: 'Cash & Wallets', balance: 0 },
    ], excluded)
    expect(summary.totalAssets).toBe(200_000)
    expect(summary.totalLiabilities).toBe(20_000)
    expect(summary.netWorth).toBe(180_000)
    expect(summary.assetCategories).toEqual(['Bank Accounts', 'Investments'])
    expect(summary.categoryProportions['Bank Accounts']).toBeCloseTo(2 / 3)
    expect(summary.categoryProportions.Investments).toBeCloseTo(1 / 3)
    expect(Object.values(summary.categoryProportions).reduce((sum, value) => sum + value, 0))
      .toBeCloseTo(1)
  })

  it('returns an empty allocation when there are no positive included assets', () => {
    const summary = summarizeNetWorthAccounts([
      { category: 'Bank Accounts', balance: -40_000 },
      { category: 'Other', balance: 20_000 },
      { category: 'Cash & Wallets', balance: 0 },
    ], excluded)
    expect(summary.netWorth).toBe(-20_000)
    expect(summary.assetCategories).toEqual([])
    expect(summary.categoryProportions).toEqual({})
  })

  it('keeps cash-flow scope distinct from account balances and ignores transfers in totals', () => {
    const series = computeNetWorthTimeSeries([
      { date: '2025-01-01', type: 'Income', amount: 50_000 },
      { date: '2025-02-01', type: 'Transfer', amount: 20_000 },
      { date: '2025-03-01', type: 'Expense', amount: 70_000 },
    ], ['Bank Accounts'], { 'Bank Accounts': 1 })
    expect(series.at(-1)).toMatchObject({
      netWorth: -20_000,
      cumulativeIncome: 50_000,
      cumulativeExpenses: 70_000,
      'Bank Accounts': 0,
    })
    expect(series[1].netWorth).toBe(50_000)
  })
})
