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
  backgroundColor: 'rgba(17, 24, 39, 0.95)',
  border: '1px solid rgba(255, 255, 255, 0.12)',
  borderRadius: '12px',
  backdropFilter: 'blur(12px)',
  color: '#fff',
  padding: '12px 16px',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
}

export const CHART_TOOLTIP_LABEL_STYLE: CSSProperties = {
  color: '#8e8e93',
  marginBottom: '4px',
  fontWeight: 500,
}

export const CHART_TOOLTIP_ITEM_STYLE: CSSProperties = {
  color: '#fff',
  padding: '2px 0',
}

/** Spread-friendly object for Recharts <Tooltip {...chartTooltipProps} /> */
export const chartTooltipProps = {
  contentStyle: CHART_TOOLTIP_STYLE,
  labelStyle: CHART_TOOLTIP_LABEL_STYLE,
  itemStyle: CHART_TOOLTIP_ITEM_STYLE,
} as const
