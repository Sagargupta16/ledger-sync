/**
 * Pie/donut slice capping (data-viz-fit rule).
 *
 * Extracted from `chartDefaults` so that module stays at its previous size --
 * this is the only place the "fold the tail into Other" rule lives.
 */

import { SEMANTIC_COLORS } from '@/constants/chartColors'

export interface PieSliceDatum {
  name: string
  value: number
  color?: string
  /**
   * Set only on the synthetic wedge produced by `capPieSlices`. It is a rollup
   * of several categories, not a category, so consumers must not treat `name`
   * as a filterable value (see `sliceClickTarget`).
   */
  isOther?: boolean
}

/**
 * Hard ceiling on wedge count. The project standard (CLAUDE.md, "data-viz-fit
 * rules") is "pie/donut only <=7 slices" -- past that, adjacent wedges become
 * indistinguishable and the 12-color palette starts repeating hues. Real data
 * has 12 expense categories, so the cap has to be structural, not per-call-site.
 */
export const MAX_PIE_SLICES = 7

/**
 * Fold a many-category series into at most `maxSlices` wedges.
 *
 * Sorts descending by value, keeps the largest `maxSlices - 1`, and merges the
 * genuine tail into one muted "Other (N categories)" slice whose value is the
 * exact sum of what it replaced -- the rendered total always equals the input
 * total, so a percentage read off the chart is still trustworthy. The wedge name
 * carries the folded-category count so both the legend and the tooltip say how
 * much is hiding in there.
 *
 * Non-positive values are dropped (a pie can't render a negative wedge).
 *
 * @param maxSlices - Total wedges to render, "Other" included. 0 disables capping.
 */
export function capPieSlices(
  data: readonly PieSliceDatum[],
  maxSlices: number = MAX_PIE_SLICES,
): PieSliceDatum[] {
  const positive = data.filter((d) => d.value > 0)
  if (maxSlices <= 0 || positive.length <= maxSlices) return [...positive]

  const sorted = [...positive].sort((a, b) => b.value - a.value)
  const head = sorted.slice(0, maxSlices - 1)
  const tail = sorted.slice(maxSlices - 1)
  // Capping only triggers above `maxSlices` items, so the tail always holds >= 2.
  const otherValue = tail.reduce((sum, d) => sum + d.value, 0)
  return [
    ...head,
    {
      name: `Other (${tail.length} categories)`,
      value: otherValue,
      color: SEMANTIC_COLORS.muted,
      isOther: true,
    },
  ]
}

/**
 * The category name a click on this wedge should filter by, or `null` when the
 * wedge is not a category.
 *
 * The "Other (N categories)" rollup has no matching `transaction.category`, so
 * deep-linking it (`/transactions?category=Other (6 categories)`) lands the user
 * on a permanently empty list. Every clickable pie surface -- wedge and legend
 * row alike -- routes through this so the dead link can't come back.
 */
export function sliceClickTarget(slice: PieSliceDatum): string | null {
  return slice.isOther ? null : slice.name
}
