import { motion } from 'framer-motion'

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
 * Animated Sankey link: the ribbon draws in left-to-right on mount (staggered
 * by index), then a soft dash shimmer keeps drifting along the flow direction
 * forever -- money visibly "flowing" through the pipes, like the reference
 * sankey animation. The shimmer is SMIL on stroke-dashoffset (compositor-only,
 * no React re-renders); the draw-in is framer-motion pathLength.
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

  // Slower drift on thicker ribbons reads as the same "volume speed".
  const flowDuration = 2.4 + Math.min(linkWidth / 60, 1.6)

  return (
    <g>
      {/* Base ribbon: draws in from the source, staggered per link. */}
      <motion.path
        d={d}
        fill="none"
        stroke={rawColors.app.purple}
        strokeOpacity={0.25}
        strokeWidth={linkWidth}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.8, delay: index * 0.06, ease: 'easeOut' }}
      />
      {/* Flow shimmer: long soft dashes drifting toward the target, forever. */}
      <path
        d={d}
        fill="none"
        stroke={rawColors.app.purple}
        strokeOpacity={0.18}
        strokeWidth={linkWidth}
        strokeDasharray="26 42"
        strokeLinecap="round"
      >
        <animate
          attributeName="stroke-dashoffset"
          from="68"
          to="0"
          dur={`${flowDuration}s`}
          repeatCount="indefinite"
        />
      </path>
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
