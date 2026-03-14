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

import { CHART_AXIS_COLOR, CHART_TEXT, CHART_SURFACE } from '@/constants/chartColors'
import { formatCurrencyShort, formatDateTick } from '@/lib/formatters'
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

// ─── Legend defaults ────────────────────────────────────────────────────────

export const LEGEND_DEFAULTS = {
  wrapperStyle: { paddingTop: '16px', fontSize: '12px' },
  iconType: 'circle' as const,
  iconSize: 8,
}
