/**
 * Standardized chart styling defaults for all Recharts visualizations.
 *
 * Usage:
 *   <CartesianGrid {...GRID_DEFAULTS} />
 *   <XAxis {...xAxisDefaults()} dataKey="period" />
 *   <YAxis {...yAxisDefaults()} />
 *
 * Gradient helper:
 *   <defs>{areaGradient('income', '#30d158')}</defs>
 *   <Area fill="url(#gradient-income)" />
 */

import { ReferenceLine } from 'recharts'

import { CHART_AXIS_COLOR, CHART_TEXT, CHART_SURFACE } from '@/constants/chartColors'
import { formatCurrency, formatCurrencyShort, formatDateTick } from '@/lib/formatters'
import { getSmartInterval } from '@/lib/chartUtils'
import { CHART_ANIMATION_THRESHOLD } from '@/constants'

// ─── CartesianGrid defaults ─────────────────────────────────────────────────

export const GRID_DEFAULTS = {
  strokeDasharray: '3 3',
  stroke: CHART_SURFACE.gridLine,
  vertical: false,
} as const

// ─── Axis defaults ──────────────────────────────────────────────────────────

export const AXIS_TICK = { fill: CHART_TEXT.subtle, fontSize: 11 } as const
export const AXIS_LINE = { stroke: CHART_SURFACE.axisLine } as const

export function xAxisDefaults(dataLength = 0, opts?: {
  angle?: number
  height?: number
  dateFormatter?: boolean
}) {
  return {
    stroke: CHART_AXIS_COLOR,
    tick: AXIS_TICK,
    tickLine: false,
    axisLine: AXIS_LINE,
    interval: dataLength > 12 ? getSmartInterval(dataLength) : 0,
    ...(opts?.angle !== undefined && {
      angle: opts.angle,
      textAnchor: 'end' as const,
      height: opts.height ?? 60,
    }),
    ...(opts?.dateFormatter && {
      tickFormatter: (v: string) => formatDateTick(v, dataLength),
    }),
  }
}

export function yAxisDefaults(opts?: {
  currency?: boolean
  width?: number
}) {
  return {
    stroke: CHART_AXIS_COLOR,
    tick: AXIS_TICK,
    tickLine: false,
    axisLine: AXIS_LINE,
    width: opts?.width ?? 60,
    ...(opts?.currency !== false && {
      tickFormatter: (value: number) => formatCurrencyShort(value),
    }),
  }
}

// ─── Area gradient helper ───────────────────────────────────────────────────

/**
 * Creates a <linearGradient> definition for premium area chart fills.
 *
 * @param id - Unique gradient ID (used as `fill="url(#gradient-{id})"`)
 * @param color - Hex color string
 * @param topOpacity - Opacity at the top of the area (default 0.3)
 * @param bottomOpacity - Opacity at the bottom (default 0.02)
 */
export function areaGradient(
  id: string,
  color: string,
  topOpacity = 0.3,
  bottomOpacity = 0.02,
) {
  const gradientId = `gradient-${id}`
  return (
    <linearGradient key={gradientId} id={gradientId} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={color} stopOpacity={topOpacity} />
      <stop offset="100%" stopColor={color} stopOpacity={bottomOpacity} />
    </linearGradient>
  )
}

/** Returns the fill URL string for an area gradient */
export function areaGradientUrl(id: string) {
  return `url(#gradient-${id})`
}

// ─── Bar radius helper ──────────────────────────────────────────────────────

/** Default rounded corners for bar charts [topLeft, topRight, bottomLeft, bottomRight] */
export const BAR_RADIUS: [number, number, number, number] = [4, 4, 0, 0]

/** Smaller radius for stacked/grouped bars */
export const BAR_RADIUS_SM: [number, number, number, number] = [3, 3, 0, 0]

// ─── Animation helper ───────────────────────────────────────────────────────

/** Check if animations should be enabled based on data size */
export function shouldAnimate(dataLength: number): boolean {
  return dataLength < CHART_ANIMATION_THRESHOLD
}

// ─── Active dot (hover glow) ────────────────────────────────────────────────

/** Active dot style for hover state on Line/Area charts */
export const ACTIVE_DOT = {
  r: 6,
  strokeWidth: 2,
  stroke: CHART_SURFACE.activeStroke,
  fill: 'currentColor', // inherits from the line/area color
} as const

// ─── Reference line helper ──────────────────────────────────────────────────

/**
 * Semantic reference-line variants. Charts kept hand-rolling `<ReferenceLine>`
 * with drifting opacities (0.15-0.45) and ad-hoc label styling; this maps the
 * intent to one consistent treatment.
 *
 * - `peak`  -- highest value marker (subtle dashed)
 * - `avg`   -- average / mean line (subtle dashed)
 * - `target`-- a neutral budget/threshold line (stronger so it reads as a line to clear)
 * - `goal`  -- a positive savings/goal line; rendered green so it carries the
 *             same "this is good to be above" semantic as the income palette
 * - `zero`  -- break-even baseline at y=0 (solid-ish, strong)
 */
type ReferenceLineVariant = 'peak' | 'avg' | 'target' | 'goal' | 'zero'

const REFERENCE_LINE_VARIANTS: Record<
  ReferenceLineVariant,
  { stroke: string; strokeDasharray?: string; labelFill?: string }
> = {
  peak: { stroke: CHART_SURFACE.referenceLine, strokeDasharray: '4 4' },
  avg: { stroke: CHART_SURFACE.referenceLine, strokeDasharray: '5 5' },
  target: { stroke: CHART_SURFACE.referenceLineStrong, strokeDasharray: '6 3' },
  goal: { stroke: rawColors.app.green, strokeDasharray: '6 3', labelFill: rawColors.app.green },
  zero: { stroke: CHART_SURFACE.referenceLineStrong },
}

interface ReferenceLineOptions {
  /** Horizontal line at this y value (most common). */
  y?: number
  /** Vertical line at this x value/category. */
  x?: number | string
  /** Visible label drawn on the line (right-aligned by default). */
  label?: string
  variant?: ReferenceLineVariant
}

/**
 * Build a consistently-styled Recharts `<ReferenceLine>`.
 *
 * Returns the element directly so call-sites read as
 * `{referenceLine({ y: peak, label: \`Peak: ${...}\`, variant: 'peak' })}`.
 * Pass a stable `key` via the wrapping array index isn't needed -- Recharts
 * children inside a chart don't require keys, but we set one from the inputs
 * to be safe when several are rendered together.
 */
export function referenceLine({ y, x, label, variant = 'peak' }: ReferenceLineOptions) {
  const style = REFERENCE_LINE_VARIANTS[variant]
  return (
    <ReferenceLine
      key={`ref-${variant}-${x ?? ''}-${y ?? ''}-${label ?? ''}`}
      x={x}
      y={y}
      stroke={style.stroke}
      strokeDasharray={style.strokeDasharray}
      label={
        label
          ? { value: label, position: 'insideTopRight', fill: style.labelFill ?? CHART_TEXT.subtle, fontSize: 10 }
          : undefined
      }
    />
  )
}

// ─── Tooltip value formatters ───────────────────────────────────────────────

/**
 * Currency formatter for Recharts `<Tooltip formatter={...} />`.
 *
 * Replaces the `(value) => formatCurrency(typeof value === 'number' ? value : 0)`
 * snippet duplicated across ~8 chart call-sites. Coerces the loose Recharts
 * `ValueType` to a number and routes through the app currency formatter.
 */
export function currencyTooltipFormatter(value: unknown): string {
  return formatCurrency(typeof value === 'number' ? value : Number(value) || 0)
}

// ─── Legend defaults ────────────────────────────────────────────────────────

export const LEGEND_DEFAULTS = {
  wrapperStyle: { paddingTop: '16px', fontSize: '12px' },
  iconType: 'circle' as const,
  iconSize: 8,
}

// ─── Brush (drag-to-zoom) defaults ──────────────────────────────────────────

import { rawColors } from '@/constants/colors'

/**
 * Custom Brush traveller (the draggable handle at each end of the time-range
 * slider). Recharts' default traveller is a flat 1px-stroked rectangle that
 * reads as a hairline; this renders a rounded blue grip pill with two grip
 * lines so it looks like a handle you can actually grab -- matching the app's
 * accent + tactile feel on both desktop and touch.
 *
 * Recharts passes the geometry Recharts computed for us; we paint within it.
 * Kept as a camelCase render function (not a PascalCase component) so this
 * defaults module stays a plain helpers file -- mirrors ``referenceLine``.
 */
function renderBrushTraveller({
  x,
  y,
  width,
  height,
}: {
  x: number
  y: number
  width: number
  height: number
}) {
  // Center a comfortable fixed-width grip within whatever travellerWidth was
  // allotted, so the handle stays a chunky pill regardless of the config.
  const gripW = Math.max(width, 16)
  const cx = x + width / 2
  const gripX = cx - gripW / 2
  const targetW = Math.max(width, 44)
  const targetH = Math.max(height, 44)
  const targetX = cx - targetW / 2
  const targetY = y + height / 2 - targetH / 2
  const lineGap = 3
  const lineHalf = Math.min(7, height / 2 - 5)
  const lineTop = y + height / 2 - lineHalf
  const lineBottom = y + height / 2 + lineHalf
  return (
    <g>
      <rect
        x={targetX}
        y={targetY}
        width={targetW}
        height={targetH}
        fill="transparent"
        pointerEvents="all"
      />
      {/* Handle body: rounded pill in the app blue */}
      <rect
        x={gripX}
        y={y}
        width={gripW}
        height={height}
        rx={5}
        ry={5}
        fill={rawColors.app.blue}
        stroke={rawColors.app.blueVibrant}
        strokeWidth={1.5}
      />
      {/* Two grip lines so it reads as a draggable handle */}
      <line x1={cx - lineGap} y1={lineTop} x2={cx - lineGap} y2={lineBottom} stroke="rgba(255,255,255,0.9)" strokeWidth={1.5} strokeLinecap="round" />
      <line x1={cx + lineGap} y1={lineTop} x2={cx + lineGap} y2={lineBottom} stroke="rgba(255,255,255,0.9)" strokeWidth={1.5} strokeLinecap="round" />
    </g>
  )
}

/**
 * Visual defaults for the Recharts ``<Brush>`` component used as a
 * drag-to-zoom slider under time-series charts. A custom rounded-pill
 * traveller (see ``BrushTraveller``) plus a taller hit area and a softly
 * tinted selection window so the affordance reads as a grabbable control
 * rather than disappearing into the chart background.
 *
 * Usage (caller still owns ``dataKey``, ``startIndex``, and any
 * ``tickFormatter``):
 *
 * ```tsx
 * <Brush {...BRUSH_DEFAULTS} dataKey="date" startIndex={...} tickFormatter={...} />
 * ```
 */
export const BRUSH_DEFAULTS = {
  height: 34,
  travellerWidth: 16,
  traveller: (props: { x: number; y: number; width: number; height: number }) =>
    renderBrushTraveller(props),
  // Hairline frame around the overview strip; the traveller carries the accent.
  // Theme-aware ink/white hairline (SVG attr -> concrete value, not var()).
  stroke: rawColors.chart.svgStroke,
  // Selection window: a blue wash so the kept range reads as "selected"
  // against the dimmed full-history overview behind it.
  fill: 'rgba(74,158,255,0.12)',
  fillOpacity: 1,
  // 34px wrapper gives touch users a comfortable drag target on tablets.
} as const
