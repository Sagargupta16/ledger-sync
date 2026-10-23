/**
 * Shared chart values that outlived the Recharts helpers: the bar corner
 * radii and the currency tooltip formatter. Grid, axis, reference, tooltip and
 * brush styling now live in the chart kit (`@/components/charts`).
 */

import { formatCurrency } from '@/lib/formatters'

/** Default rounded bar corners, clockwise from top-left: [topLeft, topRight, bottomRight, bottomLeft]. */
export const BAR_RADIUS: [number, number, number, number] = [5, 5, 0, 0]

/**
 * Currency formatter for chart tooltips: coerces a loose value to a number and
 * routes it through the app currency formatter.
 */
export function currencyTooltipFormatter(value: unknown): string {
  return formatCurrency(typeof value === 'number' ? value : Number(value) || 0)
}
