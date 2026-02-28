/**
 * Shared chart utilities for consistent visualization behavior.
 *
 * - Smart axis label intervals that prevent overlap
 * - Data downsampling for large datasets (200+ points)
 * - Currency-aware label formatters for Recharts LabelList
 */

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
  fill: '#f5f5f7',
  fontSize: 10,
  fontWeight: 500,
} as const
