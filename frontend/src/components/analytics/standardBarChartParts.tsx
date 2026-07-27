/**
 * Render helpers extracted from `StandardBarChart` to keep that component near
 * the repo's file-size rule. Not a public API -- import from the chart instead.
 */

import { Rectangle, ReferenceLine, type BarShapeProps } from 'recharts'

import { referenceLine, type ReferenceLineVariant } from '@/components/ui/chartDefaults'
import { chartDataTable } from '@/components/ui/chartDataTable'
import { baselineLine, type BaselineOptions } from '@/components/ui/chartBaseline'
import { CHART_TEXT, CHART_SURFACE } from '@/constants/chartColors'

export interface BarConfig {
  key: string
  color: string
  label?: string
  /** Per-item colors: provide an array matching data length */
  cellColors?: string[]
  /** Per-row color function (alternative to cellColors). Receives the row and index, returns hex. */
  getCellColor?: (row: Record<string, unknown>, index: number) => string
  stackId?: string
  fillOpacity?: number
  radius?: [number, number, number, number]
  barSize?: number
}

export interface ReferenceLineConfig {
  x?: number | string
  y?: number | string
  label?: string
  /**
   * Semantic treatment from `chartDefaults` (`peak` | `avg` | `target` | `goal`
   * | `zero`). Preferred over `color`/`strokeDasharray` -- it keeps this chart's
   * reference lines identical to the ones the area/line charts draw.
   */
  variant?: ReferenceLineVariant
  /** Escape hatch: explicit stroke color. Ignored when `variant` is set. */
  color?: string
  /** Escape hatch: explicit dash pattern. Ignored when `variant` is set. */
  strokeDasharray?: string
}

export type BaselineProp = boolean | (BaselineOptions & { label?: string })

function resolveCellColor(
  bar: BarConfig,
  row: Record<string, unknown>,
  index: number,
): string | undefined {
  if (bar.getCellColor) return bar.getCellColor(row, index)
  if (bar.cellColors?.[index] !== undefined) return bar.cellColors[index]
  return undefined
}

export function buildChartMargin(
  margin: { top?: number; right?: number; bottom?: number; left?: number } | undefined,
  xAngle: number | undefined,
) {
  return {
    top: margin?.top ?? 8,
    right: margin?.right ?? 12,
    bottom: margin?.bottom ?? (xAngle ? 20 : 8),
    left: margin?.left ?? 4,
  }
}

export function buildGridProps(
  gridDefaults: Record<string, unknown>,
  hideVerticalGrid: boolean | undefined,
  hideHorizontalGrid: boolean | undefined,
) {
  return {
    ...gridDefaults,
    ...(hideVerticalGrid !== undefined && { vertical: !hideVerticalGrid }),
    ...(hideHorizontalGrid !== undefined && { horizontal: !hideHorizontalGrid }),
  }
}

/**
 * Per-bar paint: (a) per-item colors and (b) dimming the non-hovered bars. For
 * single-series ranking charts this stays on even without custom colors -- so
 * hovering one bar isolates it (the same "focus one, fade the rest" affordance
 * the pie chart uses). `activeIndex` null means nothing hovered -> everything
 * full opacity.
 *
 * Returns a `shape` render prop rather than `<Cell>` children. `Cell` is
 * deprecated and removed in Recharts 4.0 (see the `@deprecated` tag on
 * `recharts/types/component/Cell`); `shape` is the documented replacement.
 * It also fixes a real mis-colouring: Cell children are matched positionally
 * against the RENDERED bar list, which drops zero-height bars, so a single
 * zero-value row slid every colour below it onto the wrong category. `shape`
 * receives the row on `payload`, so colour and datum can no longer come apart.
 *
 * Returns null when neither feature is requested, letting the caller omit the
 * prop entirely and keep Recharts' default rectangle.
 */
export function renderBarShape(
  bar: BarConfig,
  activeIndex: number | null,
  isolate: boolean,
) {
  const hasCustomColor = Boolean(bar.cellColors || bar.getCellColor)
  if (!hasCustomColor && !isolate) return undefined
  return function BarShape(props: BarShapeProps) {
    const row = (props.payload ?? {}) as Record<string, unknown>
    // `index` is the position within the rendered slice; the pre-filter index
    // lives on `originalDataIndex`, which is what `cellColors`/`activeIndex`
    // are indexed by (both come from the caller's own data array).
    const rowIndex = props.originalDataIndex ?? props.index
    const color = resolveCellColor(bar, row, rowIndex) ?? bar.color
    const dimmed = isolate && activeIndex !== null && activeIndex !== rowIndex
    return (
      <Rectangle
        {...props}
        fill={color}
        fillOpacity={dimmed ? 0.35 : (bar.fillOpacity ?? 1)}
        style={{ transition: 'fill-opacity 200ms ease' }}
      />
    )
  }
}

/**
 * Render one configured reference line. A `variant` routes through the shared
 * `referenceLine()` primitive so bar charts match every other chart family;
 * without one we keep the legacy explicit color/dash path so existing callers
 * are byte-identical.
 */
export function renderReferenceLine(ref: ReferenceLineConfig) {
  if (ref.variant) {
    return referenceLine({
      // `referenceLine` types `y` as a number; a string y (rare, category axis)
      // falls through as undefined rather than silently mistyping.
      ...(typeof ref.y === 'number' && { y: ref.y }),
      ...(ref.x !== undefined && { x: ref.x }),
      label: ref.label,
      variant: ref.variant,
    })
  }
  return (
    <ReferenceLine
      key={`${ref.x ?? ''}${ref.y ?? ''}${ref.label ?? ''}`}
      x={ref.x}
      y={ref.y}
      stroke={ref.color ?? CHART_SURFACE.referenceLineStrong}
      strokeDasharray={ref.strokeDasharray ?? '3 3'}
      label={ref.label ? { value: ref.label, fill: CHART_TEXT.subtle, fontSize: 10 } : undefined}
    />
  )
}

/**
 * "Which of these bars are actually unusual?" line -- the median of the first
 * bar series, drawn with the shared `avg` treatment. Returns null for the
 * vertical (ranking) layout, where a y-axis baseline would be meaningless.
 */
export function renderBaseline(
  baseline: BaselineProp | undefined,
  data: ReadonlyArray<object>,
  bars: BarConfig[],
  layout: 'horizontal' | 'vertical',
) {
  if (!baseline || layout !== 'horizontal' || bars.length === 0) return null
  const options = baseline === true ? undefined : baseline
  const key = bars[0].key
  return baselineLine(
    data,
    (row) => Number((row as Record<string, unknown>)[key]) || 0,
    { ...options, label: options?.label ?? 'Typical' },
  )
}

/**
 * Screen-reader equivalent of the bars: one row per data point, one column per
 * series. Gives AT users the numbers Recharts' `<path>` elements can't convey.
 *
 * `rowHeaderName` names the category axis, which is NOT always time -- the
 * vertical (ranking) layout puts categories on it, where a "Period" header would
 * announce "Period: Lean" on the FIRE variants chart.
 */
export function renderBarDataTable(
  data: ReadonlyArray<object>,
  bars: BarConfig[],
  labelKey: string,
  rowHeaderName: string,
  caption: string,
  formatValue: (value: number) => string,
) {
  const rows = data as ReadonlyArray<Record<string, unknown>>
  return chartDataTable<Record<string, unknown>>(
    rows,
    [
      { header: rowHeaderName, rowHeader: true, value: (row) => axisLabel(row[labelKey]) },
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
