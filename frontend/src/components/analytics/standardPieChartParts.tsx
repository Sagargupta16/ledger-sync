/**
 * Render helpers extracted from `StandardPieChart` to keep that component near
 * the repo's file-size rule. Not a public API -- import from the chart instead.
 */

import { Sector, type PieSectorShapeProps } from 'recharts'

import { chartDataTable } from '@/components/ui/chartDataTable'
import { capPieSlices, sliceClickTarget, type PieSliceDatum } from '@/components/ui/pieSlices'
import { getChartColor } from '@/constants/chartColors'

/**
 * A capped slice with its colour resolved onto the datum.
 *
 * Recharts merges each data row over the sector's props and reads `fill` from
 * there, so carrying the colour on the row is the supported replacement for a
 * `<Cell>` child -- which is deprecated and removed in Recharts 4.0 (see the
 * `@deprecated` tag on `recharts/types/component/Cell`). The same `fill` also
 * feeds the legend swatch and the tooltip marker, both of which read the datum
 * when no Cell is present.
 */
export type PieSliceRow = PieSliceDatum & { fill: string }

/**
 * Cap the series to a legible wedge count, then pin each wedge's colour to its
 * own row. Palette colours stay index-based, exactly as the `<Cell>` version
 * assigned them, but the index is resolved once here rather than at paint time,
 * so colour and slice can no longer come apart.
 */
export function buildPieSlices(
  data: readonly PieSliceDatum[],
  maxSlices: number,
): PieSliceRow[] {
  return capPieSlices(data, maxSlices).map((slice, i) => ({
    ...slice,
    fill: slice.color ?? getChartColor(i),
  }))
}

/**
 * The datum behind a sector. Recharts hands the original row back on `payload`,
 * which is how both the hover handlers and the shape renderer recover the slice
 * without indexing into the caller's array.
 */
export function slicePayload(entry: { readonly payload?: unknown }): PieSliceDatum {
  return (entry.payload ?? {}) as PieSliceDatum
}

/**
 * Per-sector paint: brighten the hovered wedge, fade the rest, and show a
 * pointer only where a click actually goes somewhere.
 *
 * Returned as a `shape` render prop rather than as `<Cell>` children. Beyond
 * replacing a component Recharts removes in 4.0, this drops the positional
 * coupling: Cell children were matched by rendered index, so the hover state
 * had to be tracked by index too. The renderer reads the slice off `payload`
 * and matches on its name instead.
 */
export function renderPieSectorShape(activeName: string | null, hasClickHandler: boolean) {
  return function PieSectorShape(props: PieSectorShapeProps) {
    const slice = slicePayload(props)
    const isActive = activeName !== null && slice.name === activeName
    const isDimmed = activeName !== null && !isActive
    // null for the "Other" rollup -- it isn't a category, so it can't be
    // filtered by name, and offering a pointer would promise a dead link.
    const clickable = hasClickHandler && sliceClickTarget(slice) !== null
    return (
      <Sector
        {...props}
        style={{
          filter: isActive ? 'brightness(1.18)' : 'brightness(1.05)',
          cursor: clickable ? 'pointer' : 'default',
          transition: 'opacity 200ms ease, filter 200ms ease',
          opacity: isDimmed ? 0.4 : 1,
          transformOrigin: '50% 50%',
        }}
      />
    )
  }
}

/**
 * Shrink the donut center value font as the string grows so it doesn't
 * overflow past the inner radius. Tuned against typical donut sizes
 * (160-300 px) and currency strings up to ~12 chars.
 */
export function pickCenterValueFontSize(length: number): number {
  if (length <= 6) return 22
  if (length <= 8) return 18
  if (length <= 10) return 15
  return 13
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
        value: (d) => (total > 0 ? `${((d.value / total) * 100).toFixed(1)}%` : '0%'),
      },
    ],
    caption,
    (d) => d.name,
  )
}
