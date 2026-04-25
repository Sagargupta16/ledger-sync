import { describe, it, expect } from 'vitest'

import {
  DEFAULT_MILESTONES,
  computeAvgMonthlyGrowth,
  computeMilestoneETAs,
  detectMilestonesAchieved,
  projectNetWorth,
} from '../netWorthProjection'

describe('detectMilestonesAchieved', () => {
  it('returns empty for empty input', () => {
    expect(detectMilestonesAchieved([])).toEqual([])
  })

  it('finds the first day each milestone is crossed', () => {
    const series = [
      { date: '2024-01-01', netWorth: 50_000 },
      { date: '2024-02-01', netWorth: 150_000 }, // crosses 1L
      { date: '2024-06-01', netWorth: 600_000 }, // crosses 5L
      { date: '2024-12-01', netWorth: 1_200_000 }, // crosses 10L
    ]
    const result = detectMilestonesAchieved(series)
    expect(result).toHaveLength(3)
    expect(result[0]).toMatchObject({ label: '₹1L', achievedOn: '2024-02-01' })
    expect(result[1]).toMatchObject({ label: '₹5L', achievedOn: '2024-06-01' })
    expect(result[2]).toMatchObject({ label: '₹10L', achievedOn: '2024-12-01' })
  })

  it('only records first crossing (not re-crossings after a dip)', () => {
    const series = [
      { date: '2024-01-01', netWorth: 110_000 }, // crosses 1L here
      { date: '2024-02-01', netWorth: 90_000 }, // dipped below
      { date: '2024-03-01', netWorth: 120_000 }, // crossed again
    ]
    const result = detectMilestonesAchieved(series)
    expect(result).toHaveLength(1)
    expect(result[0].achievedOn).toBe('2024-01-01')
  })

  it('computes days-from-start correctly', () => {
    const series = [
      { date: '2024-01-01', netWorth: 10_000 },
      { date: '2024-02-01', netWorth: 150_000 },
    ]
    const result = detectMilestonesAchieved(series)
    expect(result[0].daysFromStart).toBe(31)
  })

  it('handles series that never crosses any milestone', () => {
    const series = [
      { date: '2024-01-01', netWorth: 5_000 },
      { date: '2024-12-01', netWorth: 8_000 },
    ]
    expect(detectMilestonesAchieved(series)).toEqual([])
  })
})

describe('computeAvgMonthlyGrowth', () => {
  it('returns 0 for insufficient data', () => {
    expect(computeAvgMonthlyGrowth([])).toBe(0)
    expect(computeAvgMonthlyGrowth([{ date: '2024-01-01', netWorth: 100_000 }])).toBe(0)
  })

  it('averages monthly deltas within the lookback window', () => {
    // +10k, +20k, +30k -> average 20k
    const series = [
      { date: '2024-01-31', netWorth: 100_000 },
      { date: '2024-02-29', netWorth: 110_000 },
      { date: '2024-03-31', netWorth: 130_000 },
      { date: '2024-04-30', netWorth: 160_000 },
    ]
    expect(computeAvgMonthlyGrowth(series)).toBe(20_000)
  })

  it('uses end-of-month last point when multiple points per month exist', () => {
    const series = [
      { date: '2024-01-05', netWorth: 100_000 },
      { date: '2024-01-31', netWorth: 120_000 }, // this is what counts for Jan
      { date: '2024-02-29', netWorth: 150_000 },
    ]
    // Delta: 150k - 120k = 30k
    expect(computeAvgMonthlyGrowth(series)).toBe(30_000)
  })
})

describe('projectNetWorth', () => {
  it('returns empty for zero horizon', () => {
    expect(projectNetWorth(100_000, 10_000, 0)).toEqual([])
  })

  it('extrapolates at constant monthly growth', () => {
    const points = projectNetWorth(100_000, 10_000, 3)
    expect(points).toHaveLength(3)
    expect(points[0].netWorth).toBe(110_000)
    expect(points[1].netWorth).toBe(120_000)
    expect(points[2].netWorth).toBe(130_000)
  })
})

describe('computeMilestoneETAs', () => {
  it('returns empty when growth is zero or negative', () => {
    expect(computeMilestoneETAs(500_000, 0, [])).toEqual([])
    expect(computeMilestoneETAs(500_000, -1000, [])).toEqual([])
  })

  it('computes ETAs for milestones above current net worth', () => {
    // At ₹5L with ₹50k/month growth, ₹10L is 10 months away.
    const result = computeMilestoneETAs(500_000, 50_000, [])
    const to10L = result.find((m) => m.label === '₹10L')
    expect(to10L).toBeDefined()
    expect(to10L!.monthsAway).toBeGreaterThanOrEqual(9.9)
    expect(to10L!.monthsAway).toBeLessThanOrEqual(10.1)
  })

  it('skips already-achieved milestones', () => {
    const achieved = DEFAULT_MILESTONES.filter((m) => m.value <= 1_000_000).map((m) => ({
      ...m,
      achievedOn: '2024-01-01',
      daysFromStart: 0,
    }))
    const result = computeMilestoneETAs(1_500_000, 100_000, achieved)
    // Should not include ₹1L, ₹5L, ₹10L
    expect(result.every((m) => m.value > 1_000_000)).toBe(true)
  })

  it('skips milestones below the current net worth', () => {
    const result = computeMilestoneETAs(2_000_000, 50_000, [])
    expect(result.every((m) => m.value > 2_000_000)).toBe(true)
  })
})
