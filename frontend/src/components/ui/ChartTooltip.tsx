import type { CSSProperties } from 'react'

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
  backgroundColor: 'rgba(26, 26, 28, 0.95)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: '10px',
  backdropFilter: 'blur(12px)',
  color: '#fafafa',
  padding: '12px 16px',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
}

export const CHART_TOOLTIP_LABEL_STYLE: CSSProperties = {
  color: '#a1a1aa',
  marginBottom: '4px',
  fontWeight: 500,
}

export const CHART_TOOLTIP_ITEM_STYLE: CSSProperties = {
  color: '#fafafa',
  padding: '2px 0',
}

/** Cursor style for BarChart hover highlight (subtle instead of default white) */
export const CHART_CURSOR_STYLE = { fill: 'rgba(255, 255, 255, 0.06)' }

/** Spread-friendly object for Recharts <Tooltip {...chartTooltipProps} /> */
export const chartTooltipProps = {
  contentStyle: CHART_TOOLTIP_STYLE,
  labelStyle: CHART_TOOLTIP_LABEL_STYLE,
  itemStyle: CHART_TOOLTIP_ITEM_STYLE,
  cursor: CHART_CURSOR_STYLE,
} as const
