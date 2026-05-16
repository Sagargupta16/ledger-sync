import { describe, expect, it } from 'vitest'

import {
  DEFAULT_MILESTONES,
  buildMilestoneRows,
  buildMilestoneRowsCompound,
  computeAvgMonthlyGrowth,
  computeMonthlyGrowthRate,
  computeMonthlyGrowthStats,
  downsampleToMonthly,
  type MilestoneRow,
  projectNetWorth,
  projectNetWorthCompound,
  projectNetWorthCompoundBand,
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
})

describe('computeMonthlyGrowthRate (compound, geometric mean)', () => {
  it('returns 0 with fewer than two monthly data points', () => {
    expect(computeMonthlyGrowthRate([])).toBe(0)
    expect(computeMonthlyGrowthRate([{ date: '2024-01-01', netWorth: 100 }])).toBe(0)
  })

  it('returns 0 when start value is non-positive', () => {
    expect(
      computeMonthlyGrowthRate([
        { date: '2024-01-31', netWorth: 0 },
        { date: '2024-02-29', netWorth: 100_000 },
      ]),
    ).toBe(0)
    expect(
      computeMonthlyGrowthRate([
        { date: '2024-01-31', netWorth: -5_000 },
        { date: '2024-02-29', netWorth: 100_000 },
      ]),
    ).toBe(0)
  })

  it('recovers a known monthly rate over a synthetic series', () => {
    // 100_000 -> 161_051 over 12 months is exactly 4%/month compound
    // (1.04^12 = ~1.60103... so close enough; we use an explicit generator)
    const series: Array<{ date: string; netWorth: number }> = []
    let v = 100_000
    for (let m = 0; m <= 12; m++) {
      const month = String(m + 1).padStart(2, '0')
      const endOfMonth = m < 9 ? `2024-${month}-28` : `2025-${String(m - 11).padStart(2, '0')}-28`
      series.push({ date: m < 12 ? `2024-${month}-28` : endOfMonth, netWorth: v })
      v *= 1.04
    }
    const rate = computeMonthlyGrowthRate(series, 12)
    expect(rate).toBeCloseTo(0.04, 4)
  })

  it('rate of 0 when net worth is flat', () => {
    const series = [
      { date: '2024-01-31', netWorth: 500_000 },
      { date: '2024-02-29', netWorth: 500_000 },
      { date: '2024-03-31', netWorth: 500_000 },
    ]
    expect(computeMonthlyGrowthRate(series)).toBe(0)
  })
})

describe('projectNetWorthCompound', () => {
  it('returns empty for zero horizon', () => {
    expect(
      projectNetWorthCompound({ date: '2024-01-01', netWorth: 100_000 }, 0.01, 0),
    ).toEqual([])
  })

  it('grows geometrically at the given rate', () => {
    const pts = projectNetWorthCompound({ date: '2024-01-01', netWorth: 100_000 }, 0.05, 3)
    expect(pts).toHaveLength(3)
    expect(pts[0].netWorth).toBeCloseTo(105_000, 0)
    expect(pts[1].netWorth).toBeCloseTo(110_250, 0)
    expect(pts[2].netWorth).toBeCloseTo(115_762.5, 0)
    expect(pts[0].date).toBe('2024-02-01')
    expect(pts[2].date).toBe('2024-04-01')
  })

  it('outpaces linear projection for longer horizons (the actual user-facing win)', () => {
    const anchor = { date: '2024-01-01', netWorth: 5_000_000 }
    const monthlyRate = 0.01 // ~12.68%/year
    // Equivalent ABSOLUTE gain at anchor for linear comparison
    const monthlyAbsolute = anchor.netWorth * monthlyRate // ₹50k/month at anchor
    const linearPt = projectNetWorth(anchor, monthlyAbsolute, 60).at(-1)!
    const compoundPt = projectNetWorthCompound(anchor, monthlyRate, 60).at(-1)!
    // Linear says 5M + 50k*60 = 8M. Compound says 5M * 1.01^60 = ~9.08M.
    // Compound must be meaningfully larger so our milestone ETAs are sooner.
    expect(compoundPt.netWorth).toBeGreaterThan(linearPt.netWorth * 1.1)
  })
})

describe('computeMonthlyGrowthStats', () => {
  it('returns zeros when there is too little data', () => {
    expect(computeMonthlyGrowthStats([])).toEqual({ rate: 0, logSigma: 0 })
    expect(computeMonthlyGrowthStats([{ date: '2024-01-31', netWorth: 100 }])).toEqual({
      rate: 0,
      logSigma: 0,
    })
    expect(
      computeMonthlyGrowthStats([
        { date: '2024-01-31', netWorth: 100 },
        { date: '2024-02-29', netWorth: 110 },
      ]),
    ).toEqual({ rate: 0, logSigma: 0 })
  })

  it('returns logSigma=0 when the series grows at a constant rate', () => {
    // 1% per month exactly, no variance.
    const series: Array<{ date: string; netWorth: number }> = []
    let v = 100_000
    for (let m = 0; m <= 6; m++) {
      const month = String(m + 1).padStart(2, '0')
      series.push({ date: `2024-${month}-28`, netWorth: v })
      v *= 1.01
    }
    const stats = computeMonthlyGrowthStats(series)
    expect(stats.rate).toBeCloseTo(0.01, 4)
    expect(stats.logSigma).toBeCloseTo(0, 6)
  })

  it('captures variance when monthly returns vary', () => {
    // Alternating 0% and 2% per month -> mean ~1%/mo, non-zero sigma.
    const series = [
      { date: '2024-01-28', netWorth: 100_000 },
      { date: '2024-02-28', netWorth: 100_000 }, // +0%
      { date: '2024-03-28', netWorth: 102_000 }, // +2%
      { date: '2024-04-28', netWorth: 102_000 }, // +0%
      { date: '2024-05-28', netWorth: 104_040 }, // +2%
      { date: '2024-06-28', netWorth: 104_040 }, // +0%
      { date: '2024-07-28', netWorth: 106_120.8 }, // +2%
    ]
    const stats = computeMonthlyGrowthStats(series)
    // Geometric mean ~1%/mo (alternating 0% and 2%).
    expect(stats.rate).toBeGreaterThan(0.005)
    expect(stats.rate).toBeLessThan(0.015)
    // Sigma should be roughly half the spread of |0% - 2%| in log space ≈ 0.0099.
    expect(stats.logSigma).toBeGreaterThan(0.005)
    expect(stats.logSigma).toBeLessThan(0.02)
  })
})

describe('projectNetWorthCompoundBand', () => {
  const anchor = { date: '2024-01-01', netWorth: 1_000_000 }

  it('returns empty for non-positive horizon', () => {
    expect(projectNetWorthCompoundBand(anchor, 0.01, 0.005, 0)).toEqual([])
  })

  it('collapses upper/lower to mean when logSigma is zero', () => {
    const pts = projectNetWorthCompoundBand(anchor, 0.01, 0, 12)
    expect(pts).toHaveLength(12)
    for (const p of pts) {
      expect(p.upper).toBeCloseTo(p.mean, 4)
      expect(p.lower).toBeCloseTo(p.mean, 4)
    }
    // Final mean = anchor * 1.01^12 ≈ 1,126,825
    expect(pts.at(-1)!.mean).toBeCloseTo(1_126_825, 0)
  })

  it('upper > mean > lower at every point when logSigma is positive', () => {
    const pts = projectNetWorthCompoundBand(anchor, 0.01, 0.02, 24)
    for (const p of pts) {
      expect(p.upper).toBeGreaterThan(p.mean)
      expect(p.lower).toBeLessThan(p.mean)
      expect(p.lower).toBeGreaterThan(0)
    }
  })

  it('band width grows with sqrt(time) under GBM', () => {
    // log(upper) - log(lower) = 2 * sigma * sqrt(n) — should scale ~sqrt of time.
    const pts = projectNetWorthCompoundBand(anchor, 0.01, 0.02, 36)
    const widthAtMonth1 = Math.log(pts[0].upper) - Math.log(pts[0].lower)
    const widthAtMonth36 = Math.log(pts[35].upper) - Math.log(pts[35].lower)
    // sqrt(36) / sqrt(1) = 6 ; allow some slack for rounding.
    const ratio = widthAtMonth36 / widthAtMonth1
    expect(ratio).toBeGreaterThan(5.5)
    expect(ratio).toBeLessThan(6.5)
  })
})

describe('buildMilestoneRowsCompound', () => {
  it('returns all-upcoming with nulls for empty series', () => {
    const rows = buildMilestoneRowsCompound([], null, 0.01)
    expect(rows).toHaveLength(DEFAULT_MILESTONES.length)
    expect(rows.every((r) => r.status === 'upcoming' && r.date === null)).toBe(true)
  })

  it('sets upcoming ETA using log-based solver for positive rate', () => {
    const series = [
      { date: '2024-01-31', netWorth: 500_000 },
      { date: '2024-02-29', netWorth: 515_000 }, // ~3%/month-ish
    ]
    const anchor = series.at(-1)
    if (!anchor) throw new Error('anchor required')
    const rows = buildMilestoneRowsCompound(series, anchor, 0.03)

    const row10L = requireRow(rows, '₹10L')
    expect(row10L.status).toBe('upcoming')
    // ln(1_000_000 / 515_000) / ln(1.03) ≈ 22.5 months
    expect(row10L.distance).toBeGreaterThan(20)
    expect(row10L.distance).toBeLessThan(25)
  })

  it('marks all upcoming dates as null when rate is non-positive', () => {
    const series = [
      { date: '2024-01-31', netWorth: 500_000 },
      { date: '2024-02-29', netWorth: 500_000 },
    ]
    const rows = buildMilestoneRowsCompound(series, series[1], 0)
    const upcomingRows = rows.filter((r) => r.status === 'upcoming')
    expect(upcomingRows.every((r) => r.date === null && r.distance === null)).toBe(true)
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
