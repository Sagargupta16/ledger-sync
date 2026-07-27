/**
 * Shared chart utilities for consistent visualization behavior.
 *
 * - Smart axis label intervals that prevent overlap
 * - Data downsampling for large datasets (200+ points)
 * - Currency-aware label formatters for Recharts LabelList
 */

import { CHART_TEXT } from '@/constants/chartColors'
import { formatCurrencyShort } from './formatters'

/**
 * Calculate a smart tick interval that prevents label overlap.
 * Adjusts based on data length and available chart width.
 *
 * @param dataLength - Number of data points
 * @param maxLabels - Max labels to show (default 12)
 */
export function getSmartInterval(dataLength: number, maxLabels = 12): number {
  if (dataLength <= maxLabels) return 0 // Show all
  return Math.ceil(dataLength / maxLabels) - 1
}

/**
 * Downsample a time-series dataset by averaging values within each bucket.
 * Keeps data under maxPoints for smooth SVG rendering.
 *
 * @param data - Array of data points with a `date` or period key
 * @param valueKeys - Keys to average (e.g. ['income', 'expense'])
 * @param maxPoints - Target number of points (default 200)
 * @param dateKey - Key containing the date/period string (default 'date')
 */
export function downsampleTimeSeries<T extends Record<string, unknown>>(
  data: T[],
  valueKeys: string[],
  maxPoints = 200,
  dateKey = 'date',
): T[] {
  if (data.length <= maxPoints) return data

  const bucketSize = Math.ceil(data.length / maxPoints)
  const result: T[] = []

  for (let i = 0; i < data.length; i += bucketSize) {
    const bucket = data.slice(i, i + bucketSize)
    const aggregated = { ...bucket[Math.floor(bucket.length / 2)] } as Record<string, unknown>

    // Use the middle point's date as representative
    aggregated[dateKey] = bucket[Math.floor(bucket.length / 2)][dateKey]

    // Average all numeric value keys
    for (const key of valueKeys) {
      const values = bucket.map((d) => Number(d[key]) || 0)
      aggregated[key] = values.reduce((a, b) => a + b, 0) / values.length
    }

    result.push(aggregated as T)
  }

  return result
}

/**
 * Narrow a Recharts tooltip `label` down to the text it actually carries.
 *
 * Recharts declares `labelFormatter`'s first argument as `ReactNode`, but at
 * runtime the value is the active tooltip-axis tick value -- `string | number`
 * (`selectActiveLabel` -> `combineActiveLabel` -> `tooltipTicks[n].value`), and
 * the formatter is only called at all when that value is non-nullish. Typing a
 * call-site parameter as the declared `ReactNode` and then interpolating it
 * would let an element/object reach a template literal and render the literal
 * text `[object Object]` inside a tooltip, so scalars are passed through and
 * anything else collapses to an empty string.
 *
 * @param label - Raw first argument handed to `labelFormatter`
 */
export function tooltipLabelString(label: unknown): string {
  if (typeof label === 'string') return label
  if (typeof label === 'number') return String(label)
  return ''
}

/**
 * Recharts LabelList formatter for currency values on bar charts.
 * Shows abbreviated currency (e.g. "₹1.2L") for readability.
 */
export function barLabelFormatter(value: number): string {
  if (value === 0) return ''
  return formatCurrencyShort(value)
}

/**
 * Recharts LabelList render props for dark-theme bar labels.
 * Returns style object suitable for <LabelList> content prop.
 */
export const barLabelStyle = {
  fill: CHART_TEXT.secondary,
  fontSize: 10,
  fontWeight: 500,
} as const

/** Rolling-average window shared by every monthly trend chart, in months. */
export const ROLLING_AVG_MONTHS = 3

/**
 * Count the rolling-average points that actually exist on a series.
 *
 * A trailing average is `undefined`/`null` until a full window is behind it, so
 * there are always fewer average points than data points. That count has to
 * travel to the chart for two reasons: recharts strokes a polyline through
 * DEFINED points only, so one point emits `M x,y Z` and paints nothing (probed
 * against recharts 3.10), and the caption must not promise a line that cannot
 * be drawn.
 */
export function countRollingAvgPoints<T>(
  series: readonly T[],
  avg: (row: T) => number | null | undefined,
): number {
  return series.filter((row) => avg(row) != null).length
}

/**
 * What a caption may honestly claim about a rolling-average line, given how
 * many average points actually exist.
 *
 * Exactly `windowMonths` complete months is the DEFAULT view on several pages,
 * which is the single-invisible-point case -- so describe what is on screen
 * rather than what the window label implies.
 */
export function rollingAvgCaption(pointCount: number, windowMonths: number): string {
  if (pointCount === 0) {
    return `A ${windowMonths}-month rolling average needs ${windowMonths} completed months, so none is drawn yet.`
  }
  if (pointCount === 1) {
    return `Only one ${windowMonths}-month average exists so far, so it is marked as a point rather than a line.`
  }
  return `Rolling average uses a ${windowMonths}-month window and spans the last ${pointCount} months.`
}
