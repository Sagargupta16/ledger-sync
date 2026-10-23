/**
 * Two-step entrance for marks that run from history into a forecast, used inside
 * a CartesianChart. The marks wipe in from the left up to the boundary category;
 * once the chart's reference tint (0.35s in) has faded up, the forecast continues
 * from the boundary to the end. The clip lifts when the entrance ends, so later
 * data changes and resizes morph exactly as the chart kit draws them.
 */

import { useState, type ReactNode } from 'react'
import { motion } from 'motion/react'

import { useCartesian, useChartFrame } from '@/components/charts/chartContext'
import { CHART_EASE, CHART_MOTION } from '@/components/charts/chartMotion'

/** Clip overhang, so round caps, wide strokes and dots at the edges are never shaved. */
const PAD = 8
/** Seconds before the forecast continues: the history is drawn and the tint mostly in. */
const CONTINUE_DELAY = 0.7

interface ProjectionRevealProps {
  /** Category key of the last historical row; without one the kit's own entrance plays. */
  readonly boundary?: string
  readonly children: ReactNode
}

export default function ProjectionReveal({ boundary, children }: ProjectionRevealProps) {
  const { category, plot } = useCartesian()
  const frame = useChartFrame()
  const [done, setDone] = useState(false)
  const index = boundary === undefined ? -1 : category.keys.indexOf(boundary)
  const clipping = frame.animate && !done && index >= 0
  const id = `${frame.chartId}-projection-reveal`
  const split = index >= 0 ? category.center(index) : plot.x
  // Unit rects scaled over each span, so a resize rescales them without restarting the wipe.
  const span = (from: number, to: number) =>
    `translate(${from} ${-PAD}) scale(${Math.max(0, to - from)} ${frame.height + PAD * 2})`
  const width = frame.entered ? 1 : 0

  // The same defs and group render throughout, so lifting the clip never remounts the marks.
  return (
    <>
      <defs>
        {clipping && (
          <clipPath id={id}>
            <motion.rect x={0} y={0} height={1} transform={span(plot.x - PAD, split)}
              initial={{ width: 0 }} animate={{ width }}
              transition={{ duration: CHART_MOTION.draw, ease: CHART_EASE }} />
            <motion.rect x={0} y={0} height={1} transform={span(split, plot.x + plot.width + PAD)}
              initial={{ width: 0 }} animate={{ width }}
              transition={{ duration: CHART_MOTION.draw, ease: CHART_EASE, delay: CONTINUE_DELAY }}
              onAnimationComplete={() => {
                if (frame.entered) setDone(true)
              }} />
          </clipPath>
        )}
      </defs>
      <g clipPath={clipping ? `url(#${id})` : undefined}>{children}</g>
    </>
  )
}
