/**
 * Text for the hole of a chart-kit PieChart (its `centerLabel`): an optional
 * small line above, an amount that counts to each new figure, and a caption.
 * The amount sizes itself to the hole box in container query units, so a long
 * currency string shrinks instead of spilling over the ring. Render it only
 * inside a kit chart: it waits for the chart to scroll into view, so the
 * count-up plays together with the slices' sweep. Each frame goes straight
 * into the amount's text node, so a hover renders the readout once rather
 * than on every frame.
 */

import { motion } from 'motion/react'

import { useChartFrame } from '@/components/charts/chartContext'
import { useAnimatedValue } from '@/hooks/useAnimatedValue'

/** Mono digits run about 0.62em; the extra keeps a margin inside the hole box. */
const EM_PER_CHAR = 0.66
const MAX_VALUE_PX = 22

interface PieCenterReadoutProps {
  /** Small line above the amount, such as the active slice's name. */
  readonly eyebrow?: string
  /** Formatted amount; counts from the previous figure to this one. */
  readonly value?: string
  /** Small line below, such as "Total" or a share. */
  readonly caption?: string
}

/**
 * The counting amount. Its own component, so the MotionValue the span subscribes to is dropped
 * together with the span when the amount goes away, instead of outliving it.
 */
function CountedAmount({ value }: { readonly value: string }) {
  const { entered } = useChartFrame()
  const counted = useAnimatedValue(entered ? value : '')
  const fontSize = `min(${MAX_VALUE_PX}px, ${(100 / (Math.max(1, value.length) * EM_PER_CHAR)).toFixed(2)}cqi)`
  return (
    // Held invisible, at its final width, until the chart enters and the count starts.
    <motion.span
      style={{ fontSize }}
      className={`whitespace-nowrap font-mono font-semibold leading-tight text-(--chart-text-primary) ${entered ? '' : 'invisible'}`}
    >
      {entered ? counted : value}
    </motion.span>
  )
}

export default function PieCenterReadout({ eyebrow, value = '', caption }: PieCenterReadoutProps) {
  return (
    <>
      {eyebrow && (
        <span className="max-w-full truncate text-[10px] leading-4 text-(--chart-text-muted)">{eyebrow}</span>
      )}
      {value && <CountedAmount value={value} />}
      {caption && (
        <span className="mt-0.5 max-w-full truncate text-[11px] leading-4 text-(--chart-text-subtle)">{caption}</span>
      )}
    </>
  )
}
