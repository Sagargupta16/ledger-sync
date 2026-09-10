import { describe, expect, it } from 'vitest'

import {
  buildCombinedChartData,
  buildHistoricalChartData,
  buildProjectionChartData,
  calculateSIPProjection,
} from '../projectionUtils'
import type { ChartDataPoint } from '../types'

const ANCHOR: ChartDataPoint = {
  month: 'Jan 26',
  invested: 50_000.75,
  value: 50_000.75,
  isHistorical: true,
}

describe('SIP summary and chart adapters', () => {
  it.each([
    { annualRate: 0, stepUp: 0 },
    { annualRate: 12, stepUp: 0 },
    { annualRate: 12, stepUp: 10 },
    { annualRate: 0, stepUp: 10 },
  ])('matches terminal values at $annualRate% return and $stepUp% step-up with the same starting basis', ({ annualRate, stepUp }) => {
    const summary = calculateSIPProjection(1_000.25, annualRate, 3, stepUp, ANCHOR.value)
    const chart = buildProjectionChartData(ANCHOR, '2026-01-31', 1_000.25, annualRate, 3, stepUp)

    expect(chart).toHaveLength(36)
    expect(chart.at(-1)).toEqual({
      month: 'Jan 29',
      invested: Math.round(summary.invested),
      value: Math.round(summary.value),
      isHistorical: false,
    })
  })

  it('keeps historical chart cost basis separate from the summary corpus baseline', () => {
    const anchor = { ...ANCHOR, invested: 80_000, value: 100_000 }
    const summary = calculateSIPProjection(1_000, 0, 2, 5, anchor.value)
    const chart = buildProjectionChartData(anchor, '2026-01-31', 1_000, 0, 2, 5)

    expect(summary).toEqual({ value: 124_600, invested: 124_600, returns: 0 })
    expect(chart.at(-1)).toEqual({
      month: 'Jan 28', value: 124_600, invested: 104_600, isHistorical: false,
    })
  })

  it('preserves zero-horizon output shapes and the summary baseline', () => {
    expect(calculateSIPProjection(1_000, 12, 0, 10, 50_000)).toEqual({
      value: 50_000, invested: 50_000, returns: 0,
    })
    expect(buildProjectionChartData(ANCHOR, '2026-01-31', 1_000, 12, 0, 10)).toEqual([])
  })

  it('keeps consecutive chart month labels after a month-end anchor', () => {
    const chart = buildProjectionChartData(ANCHOR, '2026-01-31', 0, 0, 2 / 12, 0)
    expect(chart.map((point) => point.month)).toEqual(['Feb 26', 'Mar 26'])
    expect(chart.every((point) => point.value === Math.round(ANCHOR.value))).toBe(true)
  })

  it('retains historical rounding before seeding the forward chart', () => {
    const chart = buildCombinedChartData(
      [{ date: '2026-01-31', amount: 800.49 }],
      1_000.49, 100.25, 12, 1 / 12, 0,
    )
    expect(chart).toEqual([
      { month: 'Jan 26', invested: 800, value: 1_000, expectedValue: 800, isHistorical: true },
      { month: 'Feb 26', invested: 900, value: 1_111, isHistorical: false },
    ])
  })
})

describe('historical chart financial adapters', () => {
  it('keeps proportional value allocation and zero-month benchmark interest', () => {
    const chart = buildHistoricalChartData([
      { date: '2026-01-15', amount: 10_000 },
      { date: '2026-04-15', amount: 20_000 },
    ], 36_000, 12)
    expect(chart).toEqual([
      { month: 'Jan 26', invested: 10_000, value: 12_000, expectedValue: 10_000, isHistorical: true },
      { month: 'Apr 26', invested: 30_000, value: 36_000, expectedValue: 30_303, isHistorical: true },
    ])
  })

  it('keeps the historical zero-basis guard and rounds only for chart output', () => {
    expect(buildHistoricalChartData([{ date: '2026-01-15', amount: 0 }], 1_000, 12)).toEqual([
      { month: 'Jan 26', invested: 0, value: 0, expectedValue: 0, isHistorical: true },
    ])
    const chart = buildHistoricalChartData([
      { date: '2026-01-15', amount: 100.25 },
      { date: '2026-02-15', amount: 100.25 },
    ], 300.75, 0)
    expect(chart).toEqual([
      { month: 'Jan 26', invested: 100, value: 150, expectedValue: 100, isHistorical: true },
      { month: 'Feb 26', invested: 201, value: 301, expectedValue: 201, isHistorical: true },
    ])
  })
})
