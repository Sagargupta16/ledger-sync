import { motion } from 'motion/react'

import { rawColors } from '@/constants/colors'

import { safeNumber } from '../sankeyUtils'

interface SankeyLinkRendererProps {
  readonly sourceX: number
  readonly targetX: number
  readonly sourceY: number
  readonly targetY: number
  readonly sourceControlX: number
  readonly targetControlX: number
  readonly linkWidth: number
  readonly index: number
}

/**
 * Animated Sankey link: the ribbon fades in with a short, capped stagger.
 * A static dashed overlay keeps the flow direction legible without
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
}: SankeyLinkRendererProps) => {
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
      {/* Base ribbon: fades in from the source, staggered per link. */}
      <motion.path
        d={d}
        fill="none"
        stroke={rawColors.app.purple}
        strokeOpacity={0.25}
        strokeWidth={linkWidth}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.35, delay, ease: 'easeOut' }}
      />
      {/* Static direction texture, revealed with the base ribbon. */}
      <motion.path
        d={d}
        fill="none"
        stroke={rawColors.app.purple}
        strokeOpacity={0.18}
        strokeWidth={linkWidth}
        strokeDasharray="26 42"
        strokeLinecap="round"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2, delay: delay + 0.12 }}
      />
    </g>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function createSankeyLinkComponent() {
  const SankeyLinkComponent = (linkProps: {
    sourceX: number
    targetX: number
    sourceY: number
    targetY: number
    sourceControlX: number
    targetControlX: number
    linkWidth: number
    index: number
  }) => <SankeyLinkRenderer {...linkProps} />
  return SankeyLinkComponent
}
