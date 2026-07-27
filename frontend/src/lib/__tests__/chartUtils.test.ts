/**
 * Guards the rolling-average contract shared by Income Analysis, Spending
 * Analysis and Trends & Forecasts.
 *
 * A trailing average has no value until a full window sits behind it, so there
 * are always fewer average points than data points. Three pages used to divide a
 * short leading window by its own length and plot the result under a "3m avg"
 * legend -- the first point was one month's value verbatim. Abstaining fixes the
 * number but creates a second problem: recharts strokes a polyline through
 * DEFINED points only, so a single point emits `M x,y Z` and paints nothing. The
 * count therefore has to reach the chart, and the caption has to describe what is
 * actually on screen rather than what the window label implies.
 */

import { describe, expect, it } from 'vitest'

import {
  ROLLING_AVG_MONTHS,
  countRollingAvgPoints,
  rollingAvgCaption,
} from '../chartUtils'

describe('ROLLING_AVG_MONTHS', () => {
  it('matches the window the backend computes', () => {
    // `calculations_helpers.ROLLING_AVG_MONTHS` -- the income trend's averages
    // arrive pre-computed, so a divergence here would mislabel the wire data.
    expect(ROLLING_AVG_MONTHS).toBe(3)
  })
})

describe('countRollingAvgPoints', () => {
  it('counts only the points that carry a real average', () => {
    const series = [
      { avg: undefined },
      { avg: undefined },
      { avg: 150000 },
      { avg: 120000 },
    ]
    expect(countRollingAvgPoints(series, (row) => row.avg)).toBe(2)
  })

  it('treats null the same as undefined', () => {
    // The backend sends `null` over the wire; hooks map it to `undefined` for
    // recharts. Both shapes reach this helper depending on the call site.
    const series = [{ avg: null }, { avg: 0 }, { avg: 200 }]
    expect(countRollingAvgPoints(series, (row) => row.avg)).toBe(2)
  })

  it('counts a legitimate zero average', () => {
    // A three-month window of no income averages to 0. That is a real point and
    // must be drawn -- a truthiness check here would have dropped it.
    expect(countRollingAvgPoints([{ avg: 0 }], (row) => row.avg)).toBe(1)
  })

  it('is 0 for an empty series', () => {
    expect(countRollingAvgPoints([], (row: { avg?: number }) => row.avg)).toBe(0)
  })

  it('is 0 when no month has a full window yet', () => {
    const series = [{ avg: undefined }, { avg: undefined }]
    expect(countRollingAvgPoints(series, (row) => row.avg)).toBe(0)
  })
})

describe('rollingAvgCaption', () => {
  it('says nothing is drawn when no average exists', () => {
    const caption = rollingAvgCaption(0, 3)
    expect(caption).toContain('needs 3 completed months')
    expect(caption).toContain('none is drawn yet')
  })

  it('calls a single average a point, not a line', () => {
    // Exactly `windowMonths` complete months is the DEFAULT FY view on these
    // pages, so this branch is the common case, not an edge case.
    const caption = rollingAvgCaption(1, 3)
    expect(caption).toContain('Only one 3-month average')
    expect(caption).toContain('point rather than a line')
  })

  it('reports the span once a line can actually be stroked', () => {
    const caption = rollingAvgCaption(5, 3)
    expect(caption).toContain('3-month window')
    expect(caption).toContain('last 5 months')
  })

  it('honours a window other than three months', () => {
    expect(rollingAvgCaption(0, 6)).toContain('needs 6 completed months')
    expect(rollingAvgCaption(1, 6)).toContain('Only one 6-month average')
    expect(rollingAvgCaption(4, 6)).toContain('6-month window')
  })

  it('never claims a longer span than the points it was given', () => {
    for (const count of [2, 3, 7, 12]) {
      expect(rollingAvgCaption(count, ROLLING_AVG_MONTHS)).toContain(`last ${count} months`)
    }
  })
})
