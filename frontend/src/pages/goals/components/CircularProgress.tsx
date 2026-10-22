import { useRef, useState } from 'react'
import { motion, useInView } from 'motion/react'

import { CHART_EASE, CHART_MOTION, chartTransition } from '@/components/charts/chartMotion'
import { usePrinting } from '@/components/charts/usePrinting'
import { cssVar } from '@/constants/colors'
import { useMotionStore } from '@/store/motionStore'

const HAS_OBSERVER = typeof IntersectionObserver !== 'undefined'
const NO_ELEMENT = { current: null }
/** Share of an eased sweep by which the ring reads as closed; the ripple starts there. */
const CLOSED_AT = 0.6
/** One outline ripple off a ring that just closed, in the chart kit's pulse style. */
const RIPPLE = { duration: 0.6, ease: CHART_EASE }

/**
 * Goal ring. Sweeps open from empty when it scrolls into view, then tweens to
 * each new value. Progress is clamped to 0-100, and a sweep that closes the
 * ring sends out one ripple.
 */
export default function CircularProgress({
  progress,
  color,
  size = 80,
}: Readonly<{ progress: number; color: string; size?: number }>) {
  const ref = useRef<SVGSVGElement>(null)
  const reduced = useMotionStore((state) => state.mode === 'reduced')
  const printing = usePrinting()
  // Motion's inView constructs an IntersectionObserver unguarded; jsdom has none.
  const inView = useInView(HAS_OBSERVER ? ref : NO_ELEMENT, { once: true, amount: 0.5 })
  // The entrance sweeps over CHART_MOTION.arc; once it has, value changes use the quicker update.
  const [swept, setSwept] = useState(false)
  const moving = !reduced && !printing
  const shown = !moving || inView || !HAS_OBSERVER

  const strokeWidth = 6
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  // NaN never equals itself, so it would loop the bookkeeping below; it draws as empty.
  const fraction = Number.isNaN(progress) ? 0 : Math.max(0, Math.min(100, progress)) / 100
  const to = shown ? fraction : 0
  // Previous-render bookkeeping: the last sweep target, and how many sweeps closed the ring.
  const [ring, setRing] = useState({ to, closes: 0 })
  if (ring.to !== to) {
    setRing({ to, closes: ring.to < 1 && to >= 1 ? ring.closes + 1 : ring.closes })
  }
  const rippleDelay = (swept ? CHART_MOTION.update : CHART_MOTION.arc) * CLOSED_AT

  // Strokes go through `style` (a CSS declaration), so var() tokens resolve at
  // paint time and the ring follows a theme toggle without a re-render.
  return (
    <svg ref={ref} width={size} height={size} className="transform -rotate-90 overflow-visible" aria-hidden="true">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        style={{ stroke: cssVar('--chart-svg-stroke') }}
        strokeWidth={strokeWidth}
      />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        style={{ stroke: color }}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        initial={moving ? { strokeDashoffset: circumference } : false}
        animate={{ strokeDashoffset: circumference * (1 - to) }}
        transition={chartTransition(swept ? 'update' : 'arc', moving)}
        onAnimationComplete={() => {
          if (shown) setSwept(true)
        }}
        className="transition-colors duration-700 ease-out"
      />
      {moving && ring.closes > 0 && (
        <motion.circle
          key={ring.closes}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          style={{ stroke: color }}
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          initial={{ opacity: 0 }}
          animate={{ scale: [1, 1.25], opacity: [0.6, 0] }}
          transition={{ ...RIPPLE, delay: rippleDelay }}
        />
      )}
    </svg>
  )
}
