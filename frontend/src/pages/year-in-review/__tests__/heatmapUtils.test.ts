import { describe, expect, it } from 'vitest'

import {
  buildDayCells,
  getHeatmapSwatch,
  getMonthlyMax,
  getMonthlyMaxBySign,
  heatmapValueNoun,
} from '../heatmapUtils'
import { heatmapNeutral, heatmapRamps } from '../types'

const MONTHS = (values: Record<number, number>): number[] =>
  Array.from({ length: 12 }, (_, i) => values[i] ?? 0)

describe('getHeatmapSwatch', () => {
  it('gives equal-magnitude surplus and deficit days different hues', () => {
    // The shipped defect: net was passed through Math.abs(), so a -50k day and
    // a +50k day rendered as the same swatch on a heatmap legended "Savings".
    const surplus = getHeatmapSwatch('net', 50_000, 50_000)
    const deficit = getHeatmapSwatch('net', -50_000, 50_000)

    expect(surplus.sign).toBe('surplus')
    expect(deficit.sign).toBe('deficit')
    expect(deficit.color).not.toBe(surplus.color)
    expect(surplus.color).toBe(heatmapRamps.net.surplus[4])
    expect(deficit.color).toBe(heatmapRamps.net.deficit[4])
  })

  it('keeps equal magnitudes at equal intensity across the sign flip', () => {
    // One shared magnitude scale: only the hue may differ, never the level.
    for (const magnitude of [1_000, 10_000, 25_000, 50_000]) {
      const up = getHeatmapSwatch('net', magnitude, 50_000)
      const down = getHeatmapSwatch('net', -magnitude, 50_000)
      expect(down.level).toBe(up.level)
    }
  })

  it('gives a zero-net day the neutral empty-cell treatment', () => {
    const zero = getHeatmapSwatch('net', 0, 50_000)
    expect(zero.level).toBe(0)
    expect(zero.sign).toBe('neutral')
    expect(zero.color).toBe(heatmapNeutral)
  })

  it('gives a no-activity day the neutral treatment even with no data at all', () => {
    const noData = getHeatmapSwatch('net', 0, 0)
    expect(noData.color).toBe(heatmapNeutral)
    expect(noData.sign).toBe('neutral')
  })

  it('keeps single-sign modes on one hue', () => {
    // Spending and earning cannot be negative, so both branches share a ramp
    // and the visual encoding is unchanged for those modes.
    expect(getHeatmapSwatch('expense', 900, 1_000).color).toBe(heatmapRamps.expense.surplus[4])
    expect(getHeatmapSwatch('income', 900, 1_000).color).toBe(heatmapRamps.income.surplus[4])
    expect(heatmapRamps.expense.surplus).toBe(heatmapRamps.expense.deficit)
    expect(heatmapRamps.income.surplus).toBe(heatmapRamps.income.deficit)
  })
})

describe('heatmapValueNoun', () => {
  it('never describes a deficit with savings-positive wording', () => {
    const noun = heatmapValueNoun('net', -50_000)
    expect(noun).toBe('net deficit')
    expect(noun).not.toMatch(/saving|surplus|saved|earned/i)
  })

  it('names a surplus explicitly', () => {
    expect(heatmapValueNoun('net', 50_000)).toBe('net surplus')
  })

  it('leaves the single-sign nouns alone', () => {
    expect(heatmapValueNoun('expense', 900)).toBe('spent')
    expect(heatmapValueNoun('income', 900)).toBe('earned')
  })
})

describe('getMonthlyMaxBySign', () => {
  it('reports the largest surplus and the largest deficit separately', () => {
    const expense = MONTHS({ 0: 1_000, 1: 90_000 })
    const income = MONTHS({ 0: 31_000, 1: 10_000 })

    expect(getMonthlyMaxBySign('net', expense, income)).toEqual({
      surplus: 30_000,
      deficit: 80_000,
    })
  })

  it('reports no deficit side for single-sign modes', () => {
    const expense = MONTHS({ 0: 1_200 })
    const income = MONTHS({ 0: 3_000 })
    expect(getMonthlyMaxBySign('expense', expense, income)).toEqual({ surplus: 1_200, deficit: 0 })
    expect(getMonthlyMaxBySign('income', expense, income)).toEqual({ surplus: 3_000, deficit: 0 })
  })

  it('feeds getMonthlyMax the larger of the two sides', () => {
    const expense = MONTHS({ 0: 1_000, 1: 90_000 })
    const income = MONTHS({ 0: 31_000, 1: 10_000 })
    // Deficit is the bigger magnitude here, so it sets the shared scale.
    expect(getMonthlyMax('net', expense, income)).toBe(80_000)
  })

  it('scales an all-deficit year off the deepest deficit, not zero', () => {
    // A year with no surplus month at all must still ramp: taking only the
    // positive max would divide by 0 and flatten every cell to neutral.
    const expense = MONTHS({ 0: 5_000, 1: 20_000 })
    const income = MONTHS({ 0: 1_000, 1: 2_000 })
    expect(getMonthlyMax('net', expense, income)).toBe(18_000)
    expect(getHeatmapSwatch('net', -18_000, 18_000).level).toBe(4)
  })
})

describe('buildDayCells net maxima', () => {
  it('tracks the net maxima per sign', () => {
    const start = new Date(2026, 0, 1)
    const end = new Date(2026, 0, 5)
    const dayExpenses = { '2026-01-02': 90_000, '2026-01-04': 500 }
    const dayIncomes = { '2026-01-03': 30_000, '2026-01-04': 500 }

    const { mxN, mxNSurplus, mxNDeficit } = buildDayCells(start, end, dayExpenses, dayIncomes)

    expect(mxNSurplus).toBe(30_000)
    expect(mxNDeficit).toBe(90_000)
    // Shared scale = the larger of the two, so intensity stays comparable.
    expect(mxN).toBe(90_000)
  })

  it('reports a zero surplus side when every active day is a deficit', () => {
    const start = new Date(2026, 0, 1)
    const end = new Date(2026, 0, 3)
    const { mxNSurplus, mxNDeficit, mxN } = buildDayCells(
      start,
      end,
      { '2026-01-02': 7_000 },
      {},
    )
    expect(mxNSurplus).toBe(0)
    expect(mxNDeficit).toBe(7_000)
    expect(mxN).toBe(7_000)
  })
})
