import type { CSSProperties } from 'react'
import { CHART_TEXT, CHART_SURFACE } from '@/constants/chartColors'
import { isMotionReduced } from '@/store/motionStore'

/**
 * Shared chart tooltip styling for Recharts.
 *
 * Usage with Recharts <Tooltip>:
 *   <Tooltip
 *     contentStyle={CHART_TOOLTIP_STYLE}
 *     labelStyle={CHART_TOOLTIP_LABEL_STYLE}
 *     itemStyle={CHART_TOOLTIP_ITEM_STYLE}
 *   />
 *
 * Or use the spread helper:
 *   <Tooltip {...chartTooltipProps} />
 */

export const CHART_TOOLTIP_STYLE: CSSProperties = {
  get backgroundColor() { return CHART_SURFACE.tooltipBg },
  get border() { return `1px solid ${CHART_SURFACE.tooltipBorder}` },
  borderRadius: '12px',
  get color() { return CHART_TEXT.primary },
  padding: '12px 14px',
  boxShadow: `0 4px 8px -4px ${CHART_SURFACE.tooltipShadow}, 0 16px 32px -12px ${CHART_SURFACE.tooltipShadow}`,
  maxWidth: 'min(320px, calc(100vw - 32px))',
  fontSize: '12px',
  fontVariantNumeric: 'tabular-nums',
  lineHeight: 1.5,
}

export const CHART_TOOLTIP_LABEL_STYLE: CSSProperties = {
  get color() { return CHART_TEXT.muted },
  marginBottom: '8px',
  fontSize: '11px',
  fontWeight: 600,
}

export const CHART_TOOLTIP_ITEM_STYLE: CSSProperties = {
  get color() { return CHART_TEXT.primary },
  padding: '4px 0',
  fontVariantNumeric: 'tabular-nums',
}

/** Cursor style for BarChart hover highlight (subtle instead of default white) */
export const CHART_CURSOR_STYLE = {
  get fill() { return CHART_SURFACE.cursor },
  radius: 4,
}

/** A fine crosshair keeps the selected period readable through filled areas. */
export const CHART_LINE_CURSOR_STYLE = {
  get stroke() { return CHART_SURFACE.referenceLineStrong },
  strokeWidth: 1,
  strokeDasharray: '3 4',
}

/**
 * The tooltip box glides to follow the cursor instead of teleporting between
 * data points. Recharts positions the wrapper absolutely and updates left/top
 * per move; a short transform/opacity transition on the wrapper turns those
 * jumps into a smooth slide + fade -- applied to every chart in the app at
 * once via `chartTooltipProps`.
 */
export const CHART_TOOLTIP_WRAPPER_STYLE: CSSProperties = {
  get transition() {
    return isMotionReduced() ? 'none' : 'transform 140ms ease-out, opacity 140ms ease-out'
  },
  outline: 'none',
  zIndex: 20,
}

/** Spread-friendly object for Recharts <Tooltip {...chartTooltipProps} /> */
export const chartTooltipProps = {
  contentStyle: CHART_TOOLTIP_STYLE,
  labelStyle: CHART_TOOLTIP_LABEL_STYLE,
  itemStyle: CHART_TOOLTIP_ITEM_STYLE,
  wrapperStyle: CHART_TOOLTIP_WRAPPER_STYLE,
  cursor: CHART_CURSOR_STYLE,
  // Object spread evaluates the getter on render, keeping every chart aligned
  // with the persisted motion setting without duplicating store subscriptions.
  get isAnimationActive() {
    return !isMotionReduced()
  },
  offset: 14,
  animationDuration: 140,
  animationEasing: 'ease-out' as const,
} as const
