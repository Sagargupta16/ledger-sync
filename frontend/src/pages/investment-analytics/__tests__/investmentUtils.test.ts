import { describe, expect, it } from 'vitest'

import {
  INVESTMENT_CATEGORIES,
  buildDailyGrowthSeries,
  mapToCategory,
  type GrowthTransaction,
  type InvestmentCategory,
} from '../investmentUtils'

const ACCOUNTS = ['Fund A', 'Fund B'] as const
const CATEGORIES: Record<string, InvestmentCategory> = {
  'Fund A': 'Mutual Funds',
  'Fund B': 'Stocks',
}

const buy = (date: string, to_account: string, amount: number): GrowthTransaction => ({
  date,
  type: 'Transfer',
  amount,
  to_account,
})

const redeem = (date: string, from_account: string, amount: number): GrowthTransaction => ({
  date,
  type: 'Transfer',
  amount,
  from_account,
})

const stackTotal = (point: Record<string, string | number>) =>
  INVESTMENT_CATEGORIES.reduce((sum, cat) => sum + (point[cat] as number), 0)

describe('buildDailyGrowthSeries', () => {
  it('returns empty when there is nothing to plot', () => {
    expect(buildDailyGrowthSeries([], ACCOUNTS, CATEGORIES)).toEqual([])
    expect(buildDailyGrowthSeries([buy('2026-01-01', 'Fund A', 100)], [], CATEGORIES)).toEqual([])
    // A transaction that touches no investment account contributes nothing.
    expect(
      buildDailyGrowthSeries(
        [{ date: '2026-01-01', type: 'Expense', amount: 500, account: 'Groceries' }],
        ACCOUNTS,
        CATEGORIES,
      ),
    ).toEqual([])
  })

  it('forward-fills one point per calendar day between first and last activity', () => {
    const series = buildDailyGrowthSeries(
      [buy('2026-01-01', 'Fund A', 1000), buy('2026-01-05', 'Fund A', 500)],
      ACCOUNTS,
      CATEGORIES,
    )
    expect(series.map((p) => p.date)).toEqual([
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
      '2026-01-04',
      '2026-01-05',
    ])
    // Held flat across the gap, then stepped up on the day of the next buy.
    expect(series.map((p) => p['Mutual Funds'])).toEqual([1000, 1000, 1000, 1000, 1500])
  })

  it('steps across a month boundary without dropping or duplicating a day', () => {
    // Key-space stepping: the old `new Date(key)` + `toISOString()` mix shifted
    // the boundary day for any user east of UTC.
    const series = buildDailyGrowthSeries(
      [buy('2026-01-30', 'Fund A', 100), buy('2026-02-02', 'Fund A', 100)],
      ACCOUNTS,
      CATEGORIES,
    )
    expect(series.map((p) => p.date)).toEqual([
      '2026-01-30',
      '2026-01-31',
      '2026-02-01',
      '2026-02-02',
    ])
  })

  it('drops a fully-redeemed holding to zero instead of holding its last value', () => {
    // The defect: `snapshot[account] || lastKnown[account]` treated an exact
    // zero as "no data" and re-used the pre-redemption balance forever, so the
    // stack stayed elevated above `totalInvestmentValue` on the same page.
    const series = buildDailyGrowthSeries(
      [
        buy('2026-01-01', 'Fund A', 1000),
        buy('2026-01-01', 'Fund B', 400),
        redeem('2026-01-03', 'Fund A', 1000), // exits completely
      ],
      ACCOUNTS,
      CATEGORIES,
    )
    const last = series.at(-1)
    expect(last).toBeDefined()
    expect(last?.['Mutual Funds']).toBe(0)
    // Only the still-held account remains in the total.
    expect(stackTotal(last as Record<string, string | number>)).toBe(400)
  })

  it('keeps a category negative rather than clamping at zero', () => {
    // `Math.max(0, total)` hid a drawdown past recorded contributions -- exactly
    // the case the chart exists to surface -- and desynced the stack from every
    // other total on the page.
    const series = buildDailyGrowthSeries(
      [buy('2026-01-01', 'Fund A', 1000), redeem('2026-01-02', 'Fund A', 1500)],
      ACCOUNTS,
      CATEGORIES,
    )
    expect(series.at(-1)?.['Mutual Funds']).toBe(-500)
  })

  it('nets same-day buys and redemptions into a single point', () => {
    const series = buildDailyGrowthSeries(
      [buy('2026-01-01', 'Fund A', 1000), redeem('2026-01-01', 'Fund A', 250)],
      ACCOUNTS,
      CATEGORIES,
    )
    expect(series).toHaveLength(1)
    expect(series[0]['Mutual Funds']).toBe(750)
  })

  it('adds Income to and subtracts Expense from the account it lands on', () => {
    const series = buildDailyGrowthSeries(
      [
        buy('2026-01-01', 'Fund B', 1000),
        { date: '2026-01-02', type: 'Income', amount: 50, account: 'Fund B' }, // dividend
        { date: '2026-01-03', type: 'Expense', amount: 20, account: 'Fund B' }, // fee
      ],
      ACCOUNTS,
      CATEGORIES,
    )
    expect(series.map((p) => p.Stocks)).toEqual([1000, 1050, 1030])
  })

  it('files an unmapped account under Mutual Funds', () => {
    const series = buildDailyGrowthSeries(
      [buy('2026-01-01', 'Fund Z', 700)],
      ['Fund Z'],
      {}, // no mapping at all
    )
    expect(series[0]['Mutual Funds']).toBe(700)
  })

  it('processes transactions in date order regardless of input order', () => {
    const ordered = buildDailyGrowthSeries(
      [buy('2026-01-01', 'Fund A', 1000), redeem('2026-01-02', 'Fund A', 400)],
      ACCOUNTS,
      CATEGORIES,
    )
    const shuffled = buildDailyGrowthSeries(
      [redeem('2026-01-02', 'Fund A', 400), buy('2026-01-01', 'Fund A', 1000)],
      ACCOUNTS,
      CATEGORIES,
    )
    expect(shuffled).toEqual(ordered)
  })

  it('accepts a timestamped date and keys the point by its calendar day', () => {
    const series = buildDailyGrowthSeries(
      [{ date: '2026-01-01T18:30:00', type: 'Transfer', amount: 100, to_account: 'Fund A' }],
      ACCOUNTS,
      CATEGORIES,
    )
    expect(series[0].date).toBe('2026-01-01')
    expect(series[0].fullDate).toBe('2026-01-01')
  })
})

describe('mapToCategory', () => {
  it('routes equity-flavoured types to Stocks', () => {
    expect(mapToCategory('stocks')).toBe('Stocks')
    expect(mapToCategory('Equity Shares')).toBe('Stocks')
    expect(mapToCategory('demat')).toBe('Stocks')
    expect(mapToCategory('RSU')).toBe('Stocks')
  })

  it('routes deposits and bonds to FD/Bonds', () => {
    expect(mapToCategory('fixed_deposits')).toBe('FD/Bonds')
    expect(mapToCategory('FD')).toBe('FD/Bonds')
    expect(mapToCategory('Corporate Bond')).toBe('FD/Bonds')
  })

  it('routes retirement vehicles to PPF/EPF', () => {
    expect(mapToCategory('ppf')).toBe('PPF/EPF')
    expect(mapToCategory('EPF')).toBe('PPF/EPF')
    expect(mapToCategory('provident fund')).toBe('PPF/EPF')
    expect(mapToCategory('NPS')).toBe('PPF/EPF')
  })

  it('falls back to Mutual Funds for anything unrecognised', () => {
    expect(mapToCategory('mutual_funds')).toBe('Mutual Funds')
    expect(mapToCategory('crypto')).toBe('Mutual Funds')
    expect(mapToCategory('')).toBe('Mutual Funds')
  })
})
