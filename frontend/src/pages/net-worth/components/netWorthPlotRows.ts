import type { NetWorthChartRow } from './netWorthChartView'

/** A chart row the SVG kit can plot: plain values, the projection band split in two. */
export type NetWorthPlotRow = Record<string, number | string | null>

/**
 * One row per date for the trend chart.
 *
 * useNetWorth lists the projection anchor twice: as the last recorded point and
 * as the first projected one. Recharts merged the two through
 * `allowDuplicatedCategory={false}`, but the chart kit plots by index, so a
 * repeated date would draw the anchor twice and open a gap where the history
 * meets the projection. Rows sharing a date merge, a later non-null value
 * filling an earlier gap, and the `[low, high]` band tuple becomes
 * `projectionLow` and `projectionHigh` for AreaSeries band mode.
 */
export function toNetWorthPlotRows(rows: readonly NetWorthChartRow[]): NetWorthPlotRow[] {
  const byDate = new Map<string, NetWorthPlotRow>()
  for (const row of rows) {
    const date = String(row.date)
    const merged: NetWorthPlotRow = { ...byDate.get(date) }
    for (const [key, value] of Object.entries(row)) {
      if (Array.isArray(value)) {
        if (key === 'projectionBand') [merged.projectionLow, merged.projectionHigh] = value
      } else if (value !== null || !(key in merged)) {
        merged[key] = value
      }
    }
    byDate.set(date, merged)
  }
  return [...byDate.values()]
}

/** The row's recorded trend, or its projected median; NaN where it has neither. */
export function trendValue(row: NetWorthPlotRow): number {
  const value = typeof row.netWorth === 'number' ? row.netWorth : row.projected
  return typeof value === 'number' ? value : Number.NaN
}
