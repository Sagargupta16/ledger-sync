/**
 * SVG cursor for CartesianChart: a dashed hairline through the active point on
 * line and area charts, a soft band across the active slot on bar charts. It
 * fades in where it appears, glides between categories on the same short spring
 * as CartesianTooltip and fades out. Render it among the marks, before the bars,
 * so the band sits behind them. Replaces the Recharts Tooltip `cursor`.
 */

import type { ReactElement } from 'react'
import { AnimatePresence, motion } from 'motion/react'

import { useCartesian, useChartFrame } from './chartContext'
import { CHART_EASE, CHART_MOTION } from './chartMotion'

/** Same spring as CartesianTooltip, so the cursor and the box travel together. */
const GLIDE = { type: 'spring', visualDuration: CHART_MOTION.hover, bounce: 0.15 } as const
/** Corner radius of the bar band, as the Recharts bar cursor had. */
const BAND_RADIUS = 4
/** The old CHART_LINE_CURSOR_STYLE: a fine dashed rule that reads through filled areas. */
const HAIRLINE = { stroke: 'var(--chart-reference-line-strong)', strokeWidth: 1, strokeDasharray: '3 4' }
const BAND = { fill: 'var(--chart-cursor)' }

/** Marks the inspected category; draws nothing while no row is active. */
export default function Crosshair() {
  const { animate } = useChartFrame()
  const { activeIndex, category, plot, layout } = useCartesian()
  const horizontal = layout === 'horizontal'
  const transition = animate
    ? { default: GLIDE, opacity: { duration: CHART_MOTION.hover, ease: CHART_EASE } }
    : { duration: 0 }

  let mark: ReactElement | null = null
  if (activeIndex !== null) {
    const center = category.center(activeIndex)
    if (category.bandwidth > 0) {
      // The whole slot, gaps included, clipped to the plot at either end.
      const [low, high] = horizontal ? [plot.x, plot.x + plot.width] : [plot.y, plot.y + plot.height]
      const start = Math.max(low, center - category.step / 2)
      const size = Math.max(0, Math.min(high, center + category.step / 2) - start)
      const band = horizontal
        ? { attrX: start, attrY: plot.y, width: size, height: plot.height }
        : { attrX: plot.x, attrY: start, width: plot.width, height: size }
      mark = (
        <motion.rect
          key="band"
          rx={BAND_RADIUS}
          pointerEvents="none"
          style={BAND}
          initial={{ ...band, opacity: 0 }}
          animate={{ ...band, opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={transition}
        />
      )
    } else {
      const line = horizontal
        ? { x1: center, x2: center, y1: plot.y, y2: plot.y + plot.height }
        : { x1: plot.x, x2: plot.x + plot.width, y1: center, y2: center }
      mark = (
        <motion.line
          key="line"
          pointerEvents="none"
          style={HAIRLINE}
          initial={{ ...line, opacity: 0 }}
          animate={{ ...line, opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={transition}
        />
      )
    }
  }
  return <AnimatePresence>{mark}</AnimatePresence>
}
