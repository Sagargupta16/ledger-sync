/**
 * Pure helpers behind `StandardPieChart`, kept here so that component stays
 * near the repo's file-size rule: slice capping with theme-following colours,
 * the mapping onto the chart kit's PieChart data, the radius conversion, and
 * the screen-reader table. Not a public API -- import the chart instead.
 */

import type { PieDatum } from '@/components/charts/PieChart'
import { chartDataTable } from '@/components/ui/chartDataTable'
import { capPieSlices, sliceClickTarget, type PieSliceDatum } from '@/components/ui/pieSlices'
import { SEMANTIC_COLORS, getChartColor } from '@/constants/chartColors'
import { formatPercent } from '@/lib/formatters'

/** A capped slice whose `fill` resolves the live theme's colour on every read. */
type PieSliceRow = PieSliceDatum & { readonly fill: string }

/** A radius as a share of the frame, the form callers have always passed it in. */
export type PieRadius = `${number}%`

/**
 * Cap the series to a legible wedge count, then pin each wedge's colour to its
 * own row. Palette colours stay index-based, but the index is resolved once
 * here, so colour and slice can never come apart; the ledger swatch, the
 * wedge and the Other rollup all read the same `fill`.
 */
export function buildPieSlices(
  data: readonly PieSliceDatum[],
  maxSlices: number,
): PieSliceRow[] {
  return capPieSlices(data, maxSlices).map((slice, i) => ({
    ...slice,
    // A stable datum can still pick up refreshed theme tokens.
    get fill() { return slice.isOther ? SEMANTIC_COLORS.muted : (slice.color ?? getChartColor(i)) },
  }))
}

/**
 * The slices as the kit's PieChart draws them. Call it on every render rather
 * than memoising it: reading `fill` here is what repaints the wedges after a
 * theme toggle. The Other rollup is not selectable, so the kit gives it no
 * pointer and never opens it -- it deep-links to no category.
 */
export function toPieData(slices: readonly PieSliceRow[]): PieDatum[] {
  return slices.map((slice) => ({
    key: slice.name,
    label: slice.name,
    value: slice.value,
    color: slice.fill,
    selectable: sliceClickTarget(slice) !== null,
  }))
}

/**
 * The kit's hole-to-rim ratio from the '%' radii callers pass. The kit draws
 * the rim as large as the frame allows, so only the ratio still shapes the
 * ring; an inner radius of '0%' draws a full pie.
 */
export function holeRatio(inner: PieRadius, outer: PieRadius): number {
  const ratio = Number.parseFloat(inner) / Number.parseFloat(outer)
  return Number.isFinite(ratio) ? Math.min(0.9, Math.max(0, ratio)) : 0
}

/**
 * Caption for the sr-only table. Prefers the caller's `ariaLabel`; otherwise
 * describes the data generically. `centerLabel` is NOT usable here -- it is a
 * donut-hole word like "Total", which captions nothing.
 */
export function pickTableCaption(ariaLabel: string | undefined, sliceCount: number): string {
  if (ariaLabel) return ariaLabel
  return `Chart data: ${sliceCount} ${sliceCount === 1 ? 'category' : 'categories'} by amount`
}

/**
 * Screen-reader equivalent of the wedges -- the actual numbers, including how
 * much the "Other" wedge rolled up, which the visual chart can only hint at.
 */
export function renderPieDataTable(
  data: readonly PieSliceDatum[],
  caption: string,
  formatValue: (value: number) => string,
) {
  const total = data.reduce((sum, d) => sum + d.value, 0)
  return chartDataTable<PieSliceDatum>(
    data,
    [
      { header: 'Category', rowHeader: true, value: (d) => d.name },
      { header: 'Amount', value: (d) => formatValue(d.value) },
      {
        header: 'Share',
        value: (d) => (total > 0 ? formatPercent((d.value / total) * 100) : '0%'),
      },
    ],
    caption,
    (d) => d.name,
  )
}
