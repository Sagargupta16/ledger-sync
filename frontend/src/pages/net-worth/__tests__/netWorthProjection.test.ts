import { describe, expect, it } from 'vitest'

import {
  DEFAULT_MILESTONES,
  buildMilestoneRows,
  computeAvgMonthlyGrowth,
  downsampleToMonthly,
  type MilestoneRow,
  projectNetWorth,
} from '../netWorthProjection'

function requireRow(rows: readonly MilestoneRow[], label: string): MilestoneRow {
  const row = rows.find((r) => r.label === label)
  if (!row) throw new Error(`expected row with label ${label}`)
  return row
}

describe('buildMilestoneRows', () => {
  it('returns all-upcoming with nulls for empty series', () => {
    const rows = buildMilestoneRows([], null, 0)
    expect(rows).toHaveLength(DEFAULT_MILESTONES.length)
    expect(rows.every((r) => r.status === 'upcoming' && r.date === null)).toBe(true)
  })

  it('labels crossings as achieved with dates', () => {
    const series = [
      { date: '2024-01-01', netWorth: 50_000 },
      { date: '2024-02-01', netWorth: 150_000 }, // 1L
      { date: '2024-06-01', netWorth: 600_000 }, // 5L
      { date: '2024-12-01', netWorth: 1_200_000 }, // 10L
    ]
    const anchor = series.at(-1)
    expect(anchor).toBeDefined()
    const rows = buildMilestoneRows(series, anchor ?? null, 100_000)
    const oneL = requireRow(rows, '₹1L')
    const fiveL = requireRow(rows, '₹5L')
    const tenL = requireRow(rows, '₹10L')
    expect(oneL.status).toBe('achieved')
    expect(oneL.date).toBe('2024-02-01')
    expect(fiveL.status).toBe('achieved')
    expect(tenL.status).toBe('achieved')
  })

  it('milestones above anchor with positive growth get an ETA', () => {
    const series = [
      { date: '2024-01-01', netWorth: 50_000 },
      { date: '2024-12-01', netWorth: 500_000 },
    ]
    const anchor = { date: '2024-12-01', netWorth: 500_000 }
    const rows = buildMilestoneRows(series, anchor, 50_000)
    const tenL = requireRow(rows, '₹10L')
    expect(tenL.status).toBe('upcoming')
    expect(tenL.date).not.toBeNull()
    // 500k -> 1M at 50k/mo = 10 months away
    expect(tenL.distance).not.toBeNull()
    expect(tenL.distance ?? 0).toBeGreaterThanOrEqual(9.9)
    expect(tenL.distance ?? 0).toBeLessThanOrEqual(10.1)
  })

  it('upcoming rows have null date when growth is non-positive', () => {
    const series = [{ date: '2024-01-01', netWorth: 500_000 }]
    const rows = buildMilestoneRows(series, series[0], 0)
    const tenL = requireRow(rows, '₹10L')
    expect(tenL.status).toBe('upcoming')
    expect(tenL.date).toBeNull()
    expect(tenL.distance).toBeNull()
  })

  it('sorts rows low-to-high by value', () => {
    const series = [{ date: '2024-01-01', netWorth: 600_000 }]
    const rows = buildMilestoneRows(series, series[0], 10_000)
    const values = rows.map((r) => r.value)
    expect(values).toEqual([...values].sort((a, b) => a - b))
  })

  it('records first crossing only (not re-crossings)', () => {
    const series = [
      { date: '2024-01-01', netWorth: 110_000 },
      { date: '2024-02-01', netWorth: 90_000 },
      { date: '2024-03-01', netWorth: 120_000 },
    ]
    const rows = buildMilestoneRows(series, series[2], 0)
    const oneL = requireRow(rows, '₹1L')
    expect(oneL.date).toBe('2024-01-01')
  })
})

describe('computeAvgMonthlyGrowth', () => {
  it('returns 0 for <2 months of data', () => {
    expect(computeAvgMonthlyGrowth([])).toBe(0)
    expect(computeAvgMonthlyGrowth([{ date: '2024-01-01', netWorth: 1 }])).toBe(0)
  })

  it('averages monthly deltas within the lookback', () => {
    const series = [
      { date: '2024-01-31', netWorth: 100_000 },
      { date: '2024-02-29', netWorth: 110_000 },
      { date: '2024-03-31', netWorth: 130_000 },
      { date: '2024-04-30', netWorth: 160_000 },
    ]
    // deltas: 10k, 20k, 30k -> avg 20k
    expect(computeAvgMonthlyGrowth(series)).toBe(20_000)
  })

  it('uses end-of-month point when multiple per month', () => {
    const series = [
      { date: '2024-01-05', netWorth: 100_000 },
      { date: '2024-01-31', netWorth: 120_000 },
      { date: '2024-02-29', netWorth: 150_000 },
    ]
    expect(computeAvgMonthlyGrowth(series)).toBe(30_000)
  })
})

describe('projectNetWorth', () => {
  it('returns empty for zero horizon', () => {
    expect(projectNetWorth({ date: '2024-01-01', netWorth: 100_000 }, 10_000, 0)).toEqual([])
  })

  it('extrapolates from anchor at constant monthly rate', () => {
    const pts = projectNetWorth({ date: '2024-01-01', netWorth: 100_000 }, 10_000, 3)
    expect(pts).toHaveLength(3)
    expect(pts[0].netWorth).toBe(110_000)
    expect(pts[1].netWorth).toBe(120_000)
    expect(pts[2].netWorth).toBe(130_000)
    expect(pts[0].date).toBe('2024-02-01')
    expect(pts[1].date).toBe('2024-03-01')
    expect(pts[2].date).toBe('2024-04-01')
  })
})

describe('downsampleToMonthly', () => {
  it('returns one point per month (last observed)', () => {
    const series = [
      { date: '2024-01-05', netWorth: 100 },
      { date: '2024-01-31', netWorth: 200 },
      { date: '2024-02-15', netWorth: 300 },
    ]
    const out = downsampleToMonthly(series)
    expect(out).toEqual([
      { date: '2024-01-31', netWorth: 200 },
      { date: '2024-02-15', netWorth: 300 },
    ])
  })

  it('returns empty for empty input', () => {
    expect(downsampleToMonthly([])).toEqual([])
  })
})
