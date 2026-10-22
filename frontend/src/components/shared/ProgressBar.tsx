import { useRef, useState } from 'react'
import { cubicBezier, motion, useInView } from 'motion/react'

import { CHART_EASE, CHART_MOTION, chartTransition } from '@/components/charts/chartMotion'
import { usePrinting } from '@/components/charts/usePrinting'
import { colors } from '@/constants/colors'
import { useMotionStore } from '@/store/motionStore'

/**
 * Shared progress / bullet bar.
 *
 * Before this, ~10 files hand-rolled `h-2 bg-muted/30 rounded-full` + an inner
 * `width: %` div, each slightly different. This is the one primitive for
 * "actual vs target" metrics:
 *   - `value`/`max`         -> fill width (clamped 0-100%)
 *   - `target`              -> a tick marking the goal/threshold on the track
 *   - `bands`               -> qualitative background zones (bullet-graph style)
 *   - `color`               -> fill color (defaults to app blue)
 *
 * Motion: the fill grows from empty the first time the bar scrolls into view,
 * then tweens to each new value; the target tick fades in as the growing fill
 * reaches it, or as the fill stops short of it. Reduced motion and printing
 * paint the final state at once.
 *
 * Keep it presentational: callers pass CSS color tokens, never hex. Every color
 * here lands in a DOM style, so prefer `colors.app.*` (`var(--color-app-*)`):
 * a var() follows a theme toggle, a resolved `rawColors` value keeps the old one.
 */
interface Band {
  /** Upper bound of this band as a percent of `max` (0-100). */
  readonly upTo: number
  /** Background color for the zone (token, low alpha recommended). */
  readonly color: string
}

interface ProgressBarProps {
  readonly value: number
  /** Denominator; the fill is `value/max`. Default 100 (value is already a %). */
  readonly max?: number
  /** Fill color, any CSS color (prefer a `colors.*` var()). Default app blue. */
  readonly color?: string
  /** Track height in px. Default 8. */
  readonly height?: number
  /** Draw a target tick at this value (same scale as `value`). */
  readonly target?: number
  /** Qualitative background zones, ascending by `upTo`. Renders a bullet graph. */
  readonly bands?: readonly Band[]
  /** Accessible label; renders a native progress element for assistive technology. */
  readonly ariaLabel?: string
  readonly className?: string
}

const HAS_OBSERVER = typeof IntersectionObserver !== 'undefined'
const NO_ELEMENT = { current: null }
const fillEase = cubicBezier(...CHART_EASE)

/** Clipped rather than scaled, so the fill's rounded end keeps its shape at every width. */
const fillClip = (pct: number) => `inset(0 ${100 - pct}% 0 0 round 9999px)`

/** Share of the eased entrance gone by when the fill edge first covers `fraction` of its run. */
function crossingTime(fraction: number): number {
  if (fraction >= 1) return 1
  let low = 0
  let high = 1
  for (let step = 0; step < 10; step++) {
    const mid = (low + high) / 2
    if (fillEase(mid) < fraction) low = mid
    else high = mid
  }
  return high
}

export default function ProgressBar({
  value,
  max = 100,
  color = colors.app.blue,
  height = 8,
  target,
  bands,
  ariaLabel,
  className = '',
}: ProgressBarProps) {
  const ref = useRef<HTMLDivElement>(null)
  const reduced = useMotionStore((state) => state.mode === 'reduced')
  const printing = usePrinting()
  // Motion's inView constructs an IntersectionObserver unguarded; jsdom has none. Any
  // visible pixel counts: a bar in a sideways-scrolling table may never show half of itself.
  const inView = useInView(HAS_OBSERVER ? ref : NO_ELEMENT, { once: true })
  // The first fill grows over CHART_MOTION.bar; once it has, value changes tween quickly.
  const [grown, setGrown] = useState(false)
  const moving = !reduced && !printing
  const shown = !moving || inView || !HAS_OBSERVER

  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  const targetPct =
    target !== undefined && max > 0 ? Math.max(0, Math.min(100, (target / max) * 100)) : null
  const semanticMax = max > 0 ? max : 100
  const semanticValue = Math.max(0, Math.min(semanticMax, value))
  const update = chartTransition('update', moving)
  // Seconds into the entrance when the fill edge reaches the tick, or stops short of it.
  const tickDelay =
    grown || targetPct === null ? 0 : crossingTime(pct > 0 ? targetPct / pct : 1) * CHART_MOTION.bar

  return (
    <>
      {ariaLabel && (
        <progress
          className="sr-only"
          value={semanticValue}
          max={semanticMax}
          aria-label={ariaLabel}
        />
      )}
      <div
        ref={ref}
        aria-hidden
        className={`relative w-full rounded-full overflow-hidden bg-[var(--overlay-3)] ${className}`}
        style={{ height }}
      >
        {/* Qualitative bands (bullet graph background); a new scale glides them with the fill. */}
        {bands?.map((band, i) => {
          const start = i === 0 ? 0 : bands[i - 1].upTo
          return (
            <motion.div
              key={`band-${band.upTo}`}
              className="absolute inset-y-0"
              style={{ backgroundColor: band.color }}
              initial={false}
              animate={{ left: `${start}%`, width: `${Math.max(0, band.upTo - start)}%` }}
              transition={update}
            />
          )
        })}

        {/* Fill: grows from empty once in view, then tweens between values. */}
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ backgroundColor: color }}
          initial={moving ? { clipPath: fillClip(0) } : false}
          animate={{ clipPath: fillClip(shown ? pct : 0) }}
          transition={grown ? update : chartTransition('bar', moving)}
          onAnimationComplete={() => {
            if (shown) setGrown(true)
          }}
        />

        {/* Target tick: fades in as the fill reaches it, glides when the target moves. */}
        {targetPct !== null && (
          <motion.div
            className="absolute inset-y-0 w-0.5 bg-[var(--overlay-8)]"
            initial={moving ? { opacity: 0, left: `${targetPct}%` } : false}
            animate={{ opacity: shown ? 1 : 0, left: `${targetPct}%` }}
            transition={{ opacity: chartTransition('hover', moving, tickDelay), left: update }}
          />
        )}
      </div>
    </>
  )
}
