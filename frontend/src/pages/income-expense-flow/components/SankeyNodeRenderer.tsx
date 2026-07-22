import { useState } from 'react'

import { rawColors } from '@/constants/colors'
import { formatCurrency } from '@/lib/formatters'

import { safeNumber } from '../sankeyUtils'
import type { DrillCrumb, SankeyNodeMeta } from '../sankeyDrilldown'

interface SankeyNodeRendererProps {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly index: number
  readonly payload: { name: string }
  readonly meta: readonly SankeyNodeMeta[]
  readonly chartWidth: number
  readonly fontSize: number
  /** origin = the node's center in chart px, so the next view can zoom in from it. */
  readonly onDrill: (crumb: DrillCrumb, origin?: { x: number; y: number }) => void
}

/**
 * Button semantics for a drillable node <g>: pointer cursor, hover ring,
 * Enter/Space activation (recharts has no per-node keyboard support of its
 * own -- SVG2 tabindex works on any element).
 */
function drillableGroupProps(
  label: string,
  activate: () => void,
  setHovered: (v: boolean) => void,
): React.SVGProps<SVGGElement> {
  return {
    role: 'button',
    tabIndex: 0,
    'aria-label': label,
    onClick: activate,
    onKeyDown: (e: React.KeyboardEvent<SVGGElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        activate()
      }
    },
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
    onFocus: () => setHovered(true),
    onBlur: () => setHovered(false),
    style: { cursor: 'pointer', outline: 'none' },
  }
}

export const SankeyNodeRenderer = ({
  x: rawX,
  y: rawY,
  width: rawWidth,
  height: rawHeight,
  index,
  payload,
  meta,
  chartWidth,
  fontSize,
  onDrill,
}: SankeyNodeRendererProps) => {
  const [hovered, setHovered] = useState(false)
  const x = safeNumber(rawX)
  const y = safeNumber(rawY)
  const width = safeNumber(rawWidth)
  const height = safeNumber(rawHeight)

  const nodeMeta = meta[index]
  const value = nodeMeta?.value ?? 0
  const percentage = (nodeMeta?.pct ?? 0).toFixed(1)
  const fillColor = nodeMeta?.color ?? rawColors.app.purple
  const drill = nodeMeta?.drill ?? null

  const onLeftSide = x < chartWidth / 2
  const labelX = onLeftSide ? x - 8 : x + width + 8
  const anchor: 'end' | 'start' = onLeftSide ? 'end' : 'start'

  const interactiveProps = drill
    ? drillableGroupProps(
        `${payload.name}, ${formatCurrency(value)}. Press Enter to see breakdown`,
        () => onDrill(drill, { x: x + width / 2, y: y + height / 2 }),
        setHovered,
      )
    : {}

  return (
    <g {...interactiveProps}>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={fillColor}
        fillOpacity={drill && hovered ? 1 : 0.9}
        stroke={fillColor}
        strokeWidth={drill && hovered ? 2 : 0}
        rx={4}
        ry={4}
      />
      <text
        x={labelX}
        y={y + height / 2 - fontSize * 0.25}
        textAnchor={anchor}
        dominantBaseline="middle"
        fill={rawColors.chart.textPrimary}
        fontSize={fontSize}
        fontWeight="600"
        style={drill ? { textDecoration: hovered ? 'underline' : 'none' } : undefined}
      >
        {payload.name}
        {drill ? ' ›' : ''}
      </text>
      <text
        x={labelX}
        y={y + height / 2 + fontSize * 0.9}
        textAnchor={anchor}
        dominantBaseline="middle"
        fill={rawColors.app.purple}
        fontSize={fontSize - 2}
        fontWeight="500"
      >
        {formatCurrency(value)} ({percentage}%)
      </text>
    </g>
  )
}

interface SankeyNodeWrapperProps {
  readonly meta: readonly SankeyNodeMeta[]
  readonly chartWidth: number
  readonly fontSize: number
  readonly onDrill: (crumb: DrillCrumb) => void
}

// eslint-disable-next-line react-refresh/only-export-components
export function createSankeyNodeComponent(context: SankeyNodeWrapperProps) {
  const SankeyNodeComponent = (nodeProps: {
    x: number
    y: number
    width: number
    height: number
    index: number
    payload: { name: string }
  }) => (
    <SankeyNodeRenderer
      {...nodeProps}
      meta={context.meta}
      chartWidth={context.chartWidth}
      fontSize={context.fontSize}
      onDrill={context.onDrill}
    />
  )
  return SankeyNodeComponent
}
