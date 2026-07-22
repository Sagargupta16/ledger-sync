import type { CSSProperties } from 'react'
import { CHART_TEXT, CHART_SURFACE } from '@/constants/chartColors'

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
  backgroundColor: CHART_SURFACE.tooltipBg,
  border: `1px solid ${CHART_SURFACE.tooltipBorder}`,
  borderRadius: '10px',
  backdropFilter: 'blur(12px)',
  color: CHART_TEXT.primary,
  padding: '12px 16px',
  boxShadow: `0 8px 24px ${CHART_SURFACE.tooltipShadow}`,
}

export const CHART_TOOLTIP_LABEL_STYLE: CSSProperties = {
  color: CHART_TEXT.muted,
  marginBottom: '4px',
  fontWeight: 500,
}

export const CHART_TOOLTIP_ITEM_STYLE: CSSProperties = {
  color: CHART_TEXT.primary,
  padding: '2px 0',
}

/** Cursor style for BarChart hover highlight (subtle instead of default white) */
export const CHART_CURSOR_STYLE = { fill: CHART_SURFACE.cursor }

/**
 * The tooltip box glides to follow the cursor instead of teleporting between
 * data points. Recharts positions the wrapper absolutely and updates left/top
 * per move; a short transform/opacity transition on the wrapper turns those
 * jumps into a smooth slide + fade -- applied to every chart in the app at
 * once via `chartTooltipProps`.
 */
export const CHART_TOOLTIP_WRAPPER_STYLE: CSSProperties = {
  transition: 'transform 120ms ease-out, opacity 120ms ease-out',
  outline: 'none',
}

/** Spread-friendly object for Recharts <Tooltip {...chartTooltipProps} /> */
export const chartTooltipProps = {
  contentStyle: CHART_TOOLTIP_STYLE,
  labelStyle: CHART_TOOLTIP_LABEL_STYLE,
  itemStyle: CHART_TOOLTIP_ITEM_STYLE,
  wrapperStyle: CHART_TOOLTIP_WRAPPER_STYLE,
  cursor: CHART_CURSOR_STYLE,
  // Recharts animates the tooltip's reposition when this is on.
  isAnimationActive: true,
  animationDuration: 200,
  animationEasing: 'ease-out' as const,
} as const
