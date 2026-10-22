/**
 * Pure helpers behind `StandardBarChart`: bar paint and grouping, the baseline
 * statistic, reference-line mapping and the screen-reader table. Kept out of
 * the component so each rule can be tested without painting the chart. Not a
 * public API -- import from the chart instead.
 */

import type { ChartRow } from '@/components/charts/chartContext'
import type { ReferenceLineProps, ReferenceLineVariant } from '@/components/charts/References'
import { chartDataTable } from '@/components/ui/chartDataTable'
import { formatChartDate } from '@/lib/chartDateLabels'
import { medianOf } from '@/lib/distribution'
import { formatCurrencyShort } from '@/lib/formatters'

export interface BarConfig {
  key: string
  color: string
  label?: string
  /** Per-item colors, indexed by the row's position in `data`. */
  cellColors?: string[]
  /** Per-row color function (alternative to cellColors). Receives the row and its index in `data`. */
  getCellColor?: (row: Record<string, unknown>, index: number) => string
  stackId?: string
  fillOpacity?: number
  /** Corner radii; the largest rounds the corners away from zero (default 5). */
  radius?: [number, number, number, number]
  /** Thickest the bar may grow, in px (default 36); it never outgrows its band. */
  barSize?: number
}

export interface ReferenceLineConfig {
  x?: number | string
  y?: number | string
  label?: string
  /**
   * Semantic treatment (`peak` | `avg` | `target` | `goal` | `zero`), shared
   * with every other chart family. Preferred over `color`/`strokeDasharray`.
   */
  variant?: ReferenceLineVariant
  /** Escape hatch: explicit stroke color. Ignored when `variant` is set. */
  color?: string
  /** Escape hatch: explicit dash pattern. Ignored when `variant` is set. */
  strokeDasharray?: string
}

export interface BaselineOptions {
  /**
   * How many points to summarize, counted from the END of the series. Only for
   * chronological series; cyclical buckets (day of week) have no "recent" end.
   */
  window?: number
  /** `'median'` (default; one bonus month cannot drag it) or `'mean'`. */
  statistic?: 'median' | 'mean'
  /** Prefix before the value, default `Typical`. */
  label?: string
}

export type BaselineProp = boolean | BaselineOptions

/** A bar's colour: its cell colour by row index in the full data, else the series colour. */
export function barFill(bar: BarConfig, row: ChartRow, index: number): string {
  return bar.getCellColor?.(row, index) ?? bar.cellColors?.[index] ?? bar.color
}

export interface BarSlot {
  /** Side-by-side position in the band: one slot per unstacked series, one per stack. */
  readonly groupIndex: number
  readonly groupCount: number
  readonly stackId?: string
  /** Keys sharing this bar's stack, bottom to top. */
  readonly stackKeys?: readonly string[]
}

/** Where each bar sits in its band and what it stacks with; `stacked` puts every bar in one stack. */
export function barSlots(bars: readonly BarConfig[], stacked = false): BarSlot[] {
  const stackOf = (bar: BarConfig) => (stacked ? 'stack' : bar.stackId)
  const slots: string[] = []
  const slotIndex = bars.map((bar, index) => {
    const stackId = stackOf(bar)
    const slot = stackId === undefined ? `series:${index}` : `stack:${stackId}`
    if (!slots.includes(slot)) slots.push(slot)
    return slots.indexOf(slot)
  })
  return bars.map((bar, index) => {
    const stackId = stackOf(bar)
    const base = { groupIndex: slotIndex[index], groupCount: slots.length }
    if (stackId === undefined) return base
    return { ...base, stackId, stackKeys: bars.filter((other) => stackOf(other) === stackId).map((other) => other.key) }
  })
}

/** The first series as numbers, 0 for gaps: what the baseline summarizes and the brush overview draws. */
export function leadSeries(data: ReadonlyArray<object>, bars: readonly BarConfig[]): number[] {
  const key = bars[0]?.key
  if (key === undefined) return []
  return data.map((row) => Number((row as ChartRow)[key]) || 0)
}

export interface BaselineMark {
  readonly value: number
  readonly label: string
}

/**
 * The "which of these bars is unusual?" line: the median (or mean) of the
 * first series, labelled like `Typical: ₹20K`. Null when not opted in, when
 * there is nothing to summarize, and for the ranking layout, where a value
 * line across categories means nothing.
 */
export function baselineValue(
  baseline: BaselineProp | undefined,
  data: ReadonlyArray<object>,
  bars: readonly BarConfig[],
  layout: 'horizontal' | 'vertical',
): BaselineMark | null {
  if (!baseline || layout !== 'horizontal') return null
  const options: BaselineOptions = baseline === true ? {} : baseline
  const scoped = options.window === undefined ? data : data.slice(-Math.max(1, options.window))
  const values = leadSeries(scoped, bars).filter((value) => Number.isFinite(value))
  if (values.length === 0) return null
  const value = options.statistic === 'mean'
    ? values.reduce((sum, item) => sum + item, 0) / values.length
    : medianOf(values)
  return { value, label: `${options.label ?? 'Typical'}: ${formatCurrencyShort(value)}` }
}

/**
 * Kit props for one configured line. As in Recharts, `y` is the value axis of
 * column charts and `x` the value axis of rankings; the other one names a
 * category. Without a variant the line keeps its legacy strong, dashed look.
 */
export function referenceLineProps(ref: ReferenceLineConfig, layout: 'horizontal' | 'vertical'): ReferenceLineProps {
  const [onValue, onCategory] = layout === 'vertical' ? [ref.x, ref.y] : [ref.y, ref.x]
  return {
    ...(typeof onValue === 'number' && { value: onValue }),
    ...(onCategory !== undefined && { category: String(onCategory) }),
    label: ref.label,
    ...(ref.variant
      ? { variant: ref.variant }
      : { color: ref.color ?? 'var(--chart-reference-line-strong)', dash: ref.strokeDasharray ?? '3 3' }),
  }
}

/**
 * Screen-reader equivalent of the bars: one row per data point, one column per
 * series. Gives AT users the numbers the SVG paths can't convey.
 *
 * `rowHeaderName` names the category axis, which is NOT always time -- the
 * vertical (ranking) layout puts categories on it, where a "Period" header would
 * announce "Period: Lean" on the FIRE variants chart.
 */
export function renderBarDataTable(
  data: ReadonlyArray<object>,
  bars: readonly BarConfig[],
  labelKey: string,
  rowHeaderName: string,
  caption: string,
  formatValue: (value: number) => string,
) {
  const rows = data as ReadonlyArray<Record<string, unknown>>
  return chartDataTable<Record<string, unknown>>(
    rows,
    [
      { header: rowHeaderName, rowHeader: true, value: (row) => formatChartDate(axisLabel(row[labelKey])) },
      ...bars.map((bar) => ({
        header: bar.label ?? bar.key,
        value: (row: Record<string, unknown>) => formatValue(Number(row[bar.key]) || 0),
      })),
    ],
    caption,
    (row, i) => `${axisLabel(row[labelKey])}-${i}`,
  )
}

/**
 * Stringify a category-axis label for the screen-reader table.
 *
 * `String()` on an object yields `[object Object]`, and this table IS the chart
 * for assistive-tech users -- a row announced as "[object Object]: ₹12,000"
 * conveys nothing, and nothing upstream constrains `labelKey` to a primitive.
 * Falls back to the JSON form, which at least carries the data.
 */
function axisLabel(value: unknown): string {
  if (value == null) return ''
  // Narrow POSITIVELY to the primitives that stringify usefully: excluding
  // `object` from `unknown` is not representable in TS, so the negative form
  // (`if (typeof value === 'object') ...` then `String(value)`) leaves `value`
  // as `unknown` and can still reach `String()` with an object.
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return value.toString()
  }
  if (typeof value === 'symbol') return value.toString()
  return JSON.stringify(value) ?? ''
}
