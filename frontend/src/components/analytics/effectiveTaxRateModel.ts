/**
 * Pure helpers behind EffectiveTaxRateChart: where the old regime starts to cost
 * less, which curve row carries the user's marker, and the tooltip rows.
 */

import type { TooltipSeries } from '@/components/charts/CartesianTooltip'
import type { TaxRateCurvePoint } from '@/lib/finance/taxRateCurve'
import { formatPercent } from '@/lib/formatters'

/** First positive income at which the old regime's effective rate is below the new one's. */
export function findCrossoverIncome(points: readonly TaxRateCurvePoint[]): number | null {
  const crossing = points.find((point) =>
    point.newRegimeRate !== undefined && point.income > 0 && point.oldRegimeRate < point.newRegimeRate)
  return crossing?.income ?? null
}

/**
 * Income of the curve row nearest `income`, or null for an empty curve. The x
 * axis is a point scale over the curve's evenly spaced rows and reference marks
 * sit on a row, so with 101 rows a marker lands at most half a step (0.5% of the
 * range) from the exact income.
 */
export function nearestCurveIncome(points: readonly TaxRateCurvePoint[], income: number): number | null {
  let nearest: number | null = null
  for (const point of points) {
    if (nearest === null || Math.abs(point.income - income) < Math.abs(nearest - income)) nearest = point.income
  }
  return nearest
}

const formatRate = (value: number) => formatPercent(value, false, 2)

/** Old regime first, as the curves are painted; the new regime only in years that offer it. */
export function taxRateTooltipSeries(
  colors: { readonly old: string; readonly new: string },
  newRegimeAvailable: boolean,
): TooltipSeries[] {
  const old: TooltipSeries = { key: 'oldRegimeRate', label: 'Old Regime', color: colors.old, format: formatRate }
  if (!newRegimeAvailable) return [old]
  return [old, { key: 'newRegimeRate', label: 'New Regime', color: colors.new, format: formatRate }]
}
