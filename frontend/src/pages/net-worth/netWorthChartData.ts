import type { NetWorthPoint } from '@/lib/finance/netWorth'

import type { NetWorthChartRow } from './components/netWorthChartView'
import { PROJECTION_HORIZON_MONTHS, projectNetWorthCompound } from './netWorthCompound'
import { downsampleToMonthly } from './netWorthProjection'

interface NetWorthChartDataInputs {
  readonly showProjection: boolean
  readonly anchor: NetWorthPoint | null
  /** Average monthly saving and the sample standard deviation of those months. */
  readonly monthlyGrowth: number
  readonly sigma: number
  /** Yearly rate the saving compounds at; 0 makes the projection the straight line. */
  readonly annualGrowth: number
  readonly chartSeries: readonly NetWorthPoint[]
  readonly monthEndSeries: readonly NetWorthPoint[]
  readonly filteredNetWorthData: Array<Record<string, number | string>>
}

/** Trend rows as plain points, for the anchor, the month-end series and the milestones. */
export function toNetWorthPoints(rows: ReadonlyArray<Record<string, number | string>>): NetWorthPoint[] {
  return rows.map((p) => ({ date: p.date as string, netWorth: p.netWorth as number }))
}

/**
 * The trend chart's rows: the recorded history, then (with the projection on)
 * the compound median and its band, plus the previous straight line under
 * `linear` so the two models can be compared on one axis.
 */
export function buildNetWorthChartData({
  showProjection,
  anchor,
  monthlyGrowth,
  sigma,
  annualGrowth,
  chartSeries,
  monthEndSeries,
  filteredNetWorthData,
}: NetWorthChartDataInputs): NetWorthChartRow[] {
  if (!showProjection || monthlyGrowth <= 0 || anchor === null) {
    // Long ranges collapse to month-end points: an all-time view was
    // feeding ~1,500 daily points into the SVG area chart (slow paint,
    // sub-pixel segments), while the projection path below already renders
    // at monthly resolution. Short windows keep full daily fidelity.
    if (filteredNetWorthData.length > 366) {
      const byDate = new Map(filteredNetWorthData.map((p) => [p.date as string, p]))
      return downsampleToMonthly(chartSeries).map((p) => byDate.get(p.date) ?? { date: p.date, netWorth: p.netWorth })
    }
    return filteredNetWorthData
  }
  const historicalPoints = monthEndSeries.map((p): NetWorthChartRow => ({
    date: p.date,
    netWorth: p.netWorth,
    projected: null,
    linear: null,
    // [low, high] band, split by toNetWorthPlotRows into projectionLow and
    // projectionHigh for the chart; null on historical points so the band
    // only paints forward of the anchor.
    projectionBand: null,
  }))
  const anchorPoint: NetWorthChartRow = {
    date: anchor.date,
    netWorth: null,
    projected: anchor.netWorth,
    linear: anchor.netWorth,
    // Anchor point: band collapses to the value (zero uncertainty at t=0).
    projectionBand: [anchor.netWorth, anchor.netWorth],
  }
  // The same horizon the milestone ETAs compound over, so both read one path.
  const projectedPoints = projectNetWorthCompound(anchor, monthlyGrowth, sigma, annualGrowth, PROJECTION_HORIZON_MONTHS)
    .map((p): NetWorthChartRow => ({
      date: p.date,
      netWorth: null,
      projected: p.compound,
      linear: p.linear,
      projectionBand: [p.lower, p.upper],
    }))
  return [...historicalPoints, anchorPoint, ...projectedPoints]
}
