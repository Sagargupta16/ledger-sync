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
  readonly payload: { name: string; depth?: number; targetNodes?: number[] }
  readonly meta: readonly SankeyNodeMeta[]
  readonly chartWidth: number
  readonly fontSize: number
  /** origin = the node's center in chart px, so the next view can zoom in from it. */
  readonly onDrill: (crumb: DrillCrumb, origin?: { x: number; y: number }) => void
}

function wrapNodeLabel(name: string, lineLimit: number): string[] {
  const labelLines: string[] = []
  for (const word of name.split(' ')) {
    const last = labelLines.at(-1)
    if (last && last.length + word.length < lineLimit) {
      labelLines[labelLines.length - 1] = `${last} ${word}`
    } else {
      labelLines.push(word)
    }
  }
  return labelLines
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

  const onLeftSide = payload.depth === undefined
    ? x < chartWidth / 2
    : payload.depth === 0 || (payload.targetNodes?.length ?? 0) > 0
  const labelX = onLeftSide ? x - 12 : x + width + 12
  const anchor: 'end' | 'start' = onLeftSide ? 'end' : 'start'
  const lineLimit = payload.depth === 0 || !payload.targetNodes?.length ? 23 : 17
  const labelLines = wrapNodeLabel(payload.name, lineLimit)
  const lineHeight = fontSize + 3
  const labelY = y + height / 2 - (labelLines.length * lineHeight + 23) / 2

  const interactiveProps = drill
    ? drillableGroupProps(
        `${payload.name}, ${formatCurrency(value)}. Press Enter to see breakdown`,
        () => onDrill(drill, { x: x + width / 2, y: y + height / 2 }),
        setHovered,
      )
    : {}

  return (
    <g {...interactiveProps}>
      <title>{`${payload.name}: ${formatCurrency(value)} (${percentage}%)`}</title>
      {drill && (
        <rect
          x={x - 6}
          y={y - Math.max(0, (44 - height) / 2)}
          width={width + 12}
          height={Math.max(height, 44)}
          fill="transparent"
          stroke={hovered ? fillColor : 'transparent'}
          strokeWidth={1}
          rx={6}
        />
      )}
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={fillColor}
        fillOpacity={drill && hovered ? 1 : 0.9}
        stroke={fillColor}
        strokeWidth={drill && hovered ? 2 : 0}
        rx={3}
        ry={3}
      />
      <text
        x={labelX}
        y={labelY}
        textAnchor={anchor}
        dominantBaseline="middle"
        fill={rawColors.chart.textPrimary}
        fontSize={fontSize}
        fontWeight="500"
        style={{
          paintOrder: 'stroke',
          stroke: 'var(--color-surface-1)',
          strokeWidth: 4,
          strokeLinejoin: 'round',
          textDecoration: drill && hovered ? 'underline' : 'none',
        }}
      >
        {labelLines.map((line, lineIndex) => (
          <tspan key={`${lineIndex}-${line}`} x={labelX} dy={lineIndex === 0 ? 0 : lineHeight}>
            {line}{drill && lineIndex === labelLines.length - 1 ? ' ›' : ''}
          </tspan>
        ))}
      </text>
      <text
        x={labelX}
        y={labelY + labelLines.length * lineHeight + 3}
        textAnchor={anchor}
        dominantBaseline="middle"
        fill={rawColors.chart.textPrimary}
        fontFamily="var(--font-mono)"
        fontSize={fontSize}
        fontWeight="600"
        style={{ paintOrder: 'stroke', stroke: 'var(--color-surface-1)', strokeWidth: 4 }}
      >
        {formatCurrency(value)}
      </text>
      <text
        x={labelX}
        y={labelY + labelLines.length * lineHeight + 20}
        textAnchor={anchor}
        dominantBaseline="middle"
        fill={rawColors.chart.textSubtle}
        fontFamily="var(--font-mono)"
        fontSize={11}
        style={{ paintOrder: 'stroke', stroke: 'var(--color-surface-1)', strokeWidth: 3 }}
      >
        {percentage}%
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
