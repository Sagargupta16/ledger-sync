import { describe, expect, it } from 'vitest'

import {
  DEFAULT_MILESTONES,
  buildMilestoneRows,
  computeAvgMonthlyGrowth,
  computeLinearGrowthStats,
  downsampleToMonthly,
  type MilestoneRow,
  projectNetWorth,
  projectNetWorthLinearBand,
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

  it('preserves milestones crossed before any view/earning-start cutoff', () => {
    // The caller is expected to pass the FULL history (not a view-filtered
    // slice) so historical crossings remain visible even after the user
    // sets an earning-start preference that would otherwise hide them.
    const fullHistory = [
      { date: '2023-06-01', netWorth: 150_000 }, // crossed ₹1L in 2023
      { date: '2023-12-01', netWorth: 400_000 },
      { date: '2024-06-01', netWorth: 700_000 }, // crossed ₹5L in 2024
    ]
    const anchor = { date: '2024-06-01', netWorth: 700_000 }
    const rows = buildMilestoneRows(fullHistory, anchor, 50_000)

    const oneL = requireRow(rows, '₹1L')
    expect(oneL.status).toBe('achieved')
    expect(oneL.date).toBe('2023-06-01')

    const fiveL = requireRow(rows, '₹5L')
    expect(fiveL.status).toBe('achieved')
    expect(fiveL.date).toBe('2024-06-01')
  })

  describe('stableSince', () => {
    it('equals first crossing when value never dips below', () => {
      const series = [
        { date: '2024-01-01', netWorth: 80_000 },
        { date: '2024-02-01', netWorth: 120_000 }, // crosses 1L
        { date: '2024-03-01', netWorth: 150_000 }, // still above
        { date: '2024-04-01', netWorth: 200_000 }, // still above
      ]
      const rows = buildMilestoneRows(series, series[3], 0)
      const oneL = requireRow(rows, '₹1L')
      expect(oneL.stableSince).toBe('2024-02-01')
      expect(oneL.stableSince).toBe(oneL.date)
    })

    it('is the recovery date when value dips then recovers', () => {
      const series = [
        { date: '2024-01-01', netWorth: 110_000 }, // 1L crossed
        { date: '2024-02-01', netWorth: 90_000 }, // dipped below
        { date: '2024-03-01', netWorth: 95_000 }, // still below
        { date: '2024-04-01', netWorth: 130_000 }, // recovered
        { date: '2024-05-01', netWorth: 140_000 }, // stays above
      ]
      const rows = buildMilestoneRows(series, series[4], 0)
      const oneL = requireRow(rows, '₹1L')
      expect(oneL.date).toBe('2024-01-01')
      expect(oneL.stableSince).toBe('2024-04-01')
    })

    it('is null when the milestone was crossed but anchor is currently below', () => {
      const series = [
        { date: '2024-01-01', netWorth: 110_000 }, // crossed
        { date: '2024-02-01', netWorth: 90_000 }, // fell back below
      ]
      const rows = buildMilestoneRows(series, series[1], 0)
      const oneL = requireRow(rows, '₹1L')
      expect(oneL.status).toBe('achieved') // was reached once
      expect(oneL.date).toBe('2024-01-01')
      expect(oneL.stableSince).toBeNull()
    })

    it('is null for upcoming (not-yet-achieved) rows', () => {
      const series = [
        { date: '2024-01-01', netWorth: 50_000 },
        { date: '2024-12-01', netWorth: 500_000 },
      ]
      const anchor = { date: '2024-12-01', netWorth: 500_000 }
      const rows = buildMilestoneRows(series, anchor, 50_000)
      const tenL = requireRow(rows, '₹10L')
      expect(tenL.status).toBe('upcoming')
      expect(tenL.stableSince).toBeNull()
    })

    it('picks the latest recovery when there are multiple dips', () => {
      const series = [
        { date: '2024-01-01', netWorth: 110_000 }, // crossed
        { date: '2024-02-01', netWorth: 90_000 }, // dip 1
        { date: '2024-03-01', netWorth: 130_000 }, // recovered
        { date: '2024-04-01', netWorth: 85_000 }, // dip 2
        { date: '2024-05-01', netWorth: 120_000 }, // recovered again
        { date: '2024-06-01', netWorth: 140_000 }, // holds
      ]
      const rows = buildMilestoneRows(series, series[5], 0)
      const oneL = requireRow(rows, '₹1L')
      expect(oneL.stableSince).toBe('2024-05-01')
    })
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

  it('does not compound: a cumulative-flow series grows linearly, not geometrically', () => {
    // Regression guard for the ₹28 Cr bug: the projection must be linear in
    // the anchor value, not exponential. 60 months at 50k/mo from 50L is 80L,
    // NOT 50L * rate^60.
    const anchor = { date: '2024-01-01', netWorth: 5_000_000 }
    const pts = projectNetWorth(anchor, 50_000, 60)
    expect(pts.at(-1)!.netWorth).toBe(5_000_000 + 50_000 * 60) // exactly 8M
  })
})

describe('computeLinearGrowthStats', () => {
  it('returns zeros when there is too little data', () => {
    expect(computeLinearGrowthStats([])).toEqual({ growth: 0, sigma: 0 })
    expect(computeLinearGrowthStats([{ date: '2024-01-31', netWorth: 100 }])).toEqual({
      growth: 0,
      sigma: 0,
    })
    expect(
      computeLinearGrowthStats([
        { date: '2024-01-31', netWorth: 100 },
        { date: '2024-02-29', netWorth: 110 },
      ]),
    ).toEqual({ growth: 0, sigma: 0 })
  })

  it('returns sigma=0 when the series grows by a constant delta', () => {
    const series = [
      { date: '2024-01-28', netWorth: 100_000 },
      { date: '2024-02-28', netWorth: 120_000 },
      { date: '2024-03-28', netWorth: 140_000 },
      { date: '2024-04-28', netWorth: 160_000 },
    ]
    const stats = computeLinearGrowthStats(series)
    expect(stats.growth).toBe(20_000)
    expect(stats.sigma).toBe(0)
  })

  it('captures variance when monthly deltas vary', () => {
    // Alternating +10k and +30k deltas -> mean 20k, sample stddev ~11.55k.
    const series = [
      { date: '2024-01-28', netWorth: 100_000 },
      { date: '2024-02-28', netWorth: 110_000 }, // +10k
      { date: '2024-03-28', netWorth: 140_000 }, // +30k
      { date: '2024-04-28', netWorth: 150_000 }, // +10k
      { date: '2024-05-28', netWorth: 180_000 }, // +30k
    ]
    const stats = computeLinearGrowthStats(series)
    expect(stats.growth).toBe(20_000)
    expect(stats.sigma).toBeGreaterThan(10_000)
    expect(stats.sigma).toBeLessThan(13_000)
  })

  it('handles negative and zero net worth (no positivity requirement)', () => {
    // Unlike a geometric rate, the linear model is defined for users who are
    // currently in debt or recovering from negative net worth.
    const series = [
      { date: '2024-01-28', netWorth: -50_000 },
      { date: '2024-02-28', netWorth: -20_000 }, // +30k
      { date: '2024-03-28', netWorth: 0 }, // +20k
      { date: '2024-04-28', netWorth: 25_000 }, // +25k
    ]
    const stats = computeLinearGrowthStats(series)
    expect(stats.growth).toBe(25_000)
    expect(stats.sigma).toBeGreaterThan(0)
  })
})

describe('projectNetWorthLinearBand', () => {
  const anchor = { date: '2024-01-01', netWorth: 1_000_000 }

  it('returns empty for non-positive horizon', () => {
    expect(projectNetWorthLinearBand(anchor, 10_000, 5_000, 0)).toEqual([])
  })

  it('collapses upper/lower to mean when sigma is zero', () => {
    const pts = projectNetWorthLinearBand(anchor, 10_000, 0, 12)
    expect(pts).toHaveLength(12)
    for (const p of pts) {
      expect(p.upper).toBe(p.mean)
      expect(p.lower).toBe(p.mean)
    }
    // Final mean = anchor + 12 * 10k = 1,120,000
    expect(pts.at(-1)!.mean).toBe(1_120_000)
  })

  it('upper > mean > lower at every point when sigma is positive', () => {
    const pts = projectNetWorthLinearBand(anchor, 10_000, 5_000, 24)
    for (const p of pts) {
      expect(p.upper).toBeGreaterThan(p.mean)
      expect(p.lower).toBeLessThan(p.mean)
    }
  })

  it('band width grows with sqrt(time)', () => {
    // upper - lower = 2 * sigma * sqrt(n) -- should scale as sqrt of time.
    const pts = projectNetWorthLinearBand(anchor, 10_000, 5_000, 36)
    const widthAtMonth1 = pts[0].upper - pts[0].lower
    const widthAtMonth36 = pts[35].upper - pts[35].lower
    // sqrt(36) / sqrt(1) = 6
    expect(widthAtMonth36 / widthAtMonth1).toBeCloseTo(6, 6)
  })

  it('mean follows the linear trend exactly', () => {
    const pts = projectNetWorthLinearBand(anchor, 25_000, 10_000, 6)
    pts.forEach((p, idx) => {
      expect(p.mean).toBe(anchor.netWorth + 25_000 * (idx + 1))
    })
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
