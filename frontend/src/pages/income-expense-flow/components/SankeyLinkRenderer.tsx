import { useId } from 'react'
import { motion } from 'motion/react'

import { rawColors } from '@/constants/colors'

import { safeNumber } from '../sankeyUtils'
import type { SankeyView } from '../sankeyDrilldown'

interface SankeyLinkRendererProps {
  readonly sourceX: number
  readonly targetX: number
  readonly sourceY: number
  readonly targetY: number
  readonly sourceControlX: number
  readonly targetControlX: number
  readonly linkWidth: number
  readonly index: number
  readonly sourceColor?: string
  readonly targetColor?: string
}

/**
 * Animated Sankey link: the ribbon fades in with a short, capped stagger.
 * A fine directional trace keeps the flow direction legible without
 * continuously repainting every wide SVG path.
 */
export const SankeyLinkRenderer = ({
  sourceX: rawSX,
  targetX: rawTX,
  sourceY: rawSY,
  targetY: rawTY,
  sourceControlX: rawSCX,
  targetControlX: rawTCX,
  linkWidth: rawW,
  index,
  sourceColor = rawColors.app.purple,
  targetColor = rawColors.app.purple,
}: SankeyLinkRendererProps) => {
  const id = useId().replaceAll(':', '')
  const sourceX = safeNumber(rawSX)
  const targetX = safeNumber(rawTX)
  const sourceY = safeNumber(rawSY)
  const targetY = safeNumber(rawTY)
  const sourceControlX = safeNumber(rawSCX)
  const targetControlX = safeNumber(rawTCX)
  const linkWidth = Math.max(safeNumber(rawW), 1)

  const d = `M${sourceX},${sourceY}C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`

  const delay = Math.min(index * 0.03, 0.24)

  return (
    <g>
      <defs>
        <linearGradient id={`flow-${id}`} x1={sourceX} y1={sourceY} x2={targetX} y2={targetY} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={sourceColor} />
          <stop offset="100%" stopColor={targetColor} />
        </linearGradient>
        <marker id={`flow-arrow-${id}`} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <polygon points="0 0, 6 3.5, 0 7" fill={targetColor} />
        </marker>
      </defs>
      {/* Base ribbon: fades in from the source, staggered per link. */}
      <motion.path
        d={d}
        fill="none"
        stroke={`url(#flow-${id})`}
        strokeOpacity={0.28}
        strokeWidth={linkWidth}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.35, delay, ease: 'easeOut' }}
      />
      {/* A thin arrow follows the same curve without obscuring ribbon widths. */}
      <motion.path
        d={d}
        fill="none"
        stroke={`url(#flow-${id})`}
        strokeOpacity={0.65}
        strokeWidth={1}
        strokeDasharray="3 7"
        strokeLinecap="round"
        markerEnd={`url(#flow-arrow-${id})`}
        pointerEvents="none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2, delay: delay + 0.12 }}
      />
    </g>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function createSankeyLinkComponent(view?: SankeyView) {
  const SankeyLinkComponent = (linkProps: {
    sourceX: number
    targetX: number
    sourceY: number
    targetY: number
    sourceControlX: number
    targetControlX: number
    linkWidth: number
    index: number
  }) => {
    const link = view?.links[linkProps.index]
    return (
      <SankeyLinkRenderer
        {...linkProps}
        sourceColor={link ? view?.meta[link.source]?.color : undefined}
        targetColor={link ? view?.meta[link.target]?.color : undefined}
      />
    )
  }
  return SankeyLinkComponent
}
