import { useCallback, useMemo, useState, type CSSProperties, type RefObject } from 'react'

import { useInView } from 'motion/react'

import { CHART_EASE, CHART_MOTION, chartTransition, staggerDelay } from '@/components/charts/chartMotion'
import { usePrinting } from '@/components/charts/usePrinting'
import { useMotionStore } from '@/store/motionStore'

// Motion's inView constructs an IntersectionObserver unguarded; jsdom has none.
const HAS_OBSERVER = typeof IntersectionObserver !== 'undefined'
const NO_ELEMENT = { current: null }

/** A cell before the wave reaches it: faded out at half size. */
export const HEATMAP_HIDDEN = { opacity: 0, scale: 0.5 }

/** Opacity of days outside a highlighted legend level. */
export const HEATMAP_DIMMED = 0.3

/** What every cell needs from the section to move in step with the grid. */
export interface HeatmapMotion {
  /** Full motion and not printing. */
  animate: boolean
  /** The grid has scrolled into view, or never waits (Reduced, print, tests). */
  entered: boolean
  /** The wave-in is starting: cells still carry their week stagger. */
  intro: boolean
  /** Called when the wave starts, so later changes drop the stagger. */
  onIntroStart?: () => void
}

/** Final state at once, for a cell drawn outside the section. */
export const HEATMAP_STILL: HeatmapMotion = { animate: false, entered: true, intro: false }

/**
 * Entrance state for the year heatmap, decided the way ChartFrame decides it
 * for charts: animate only in Full motion and never while printing, and hold
 * the wave until the grid first scrolls into view.
 */
export function useHeatmapMotion(ref: RefObject<HTMLElement | null>): HeatmapMotion {
  const reduced = useMotionStore((state) => state.mode === 'reduced')
  const printing = usePrinting()
  const inView = useInView(HAS_OBSERVER ? ref : NO_ELEMENT, { once: true, amount: 0.2 })
  const animate = !reduced && !printing
  const entered = !animate || inView || !HAS_OBSERVER
  // A grid that never waited (Reduced, tests) has no wave left to play.
  const [introPlayed, setIntroPlayed] = useState(entered)
  const onIntroStart = useCallback(() => setIntroPlayed(true), [])
  const intro = animate && entered && !introPlayed
  return useMemo(
    () => ({ animate, entered, intro, onIntroStart }),
    [animate, entered, intro, onIntroStart],
  )
}

/**
 * Motion transition for one cell: week by week for the wave-in, so a full
 * year finishes in about a second, then the quick hover fade for highlights.
 */
export function heatmapCellTransition(timing: HeatmapMotion, week: number, weeks: number) {
  return timing.intro
    ? chartTransition('bar', true, staggerDelay(week, weeks))
    : chartTransition('hover', timing.animate)
}

/**
 * The left-to-right retint after a year, range or metric change. Swatches
 * are var() and color-mix() strings that follow the theme tokens, which
 * Motion cannot tween, so the browser transitions them: each week waits its
 * stagger. Reduced and print get none, so the final colours paint at once.
 */
export function heatmapSweepStyle(animate: boolean, week: number, weeks: number): CSSProperties | undefined {
  if (!animate) return undefined
  const delay = Math.round(staggerDelay(week, weeks) * 1000)
  return {
    transitionProperty: 'background-color, outline-color',
    transitionDuration: `${CHART_MOTION.update}s, ${CHART_MOTION.hover}s`,
    transitionTimingFunction: `cubic-bezier(${CHART_EASE.join(', ')})`,
    transitionDelay: `${delay}ms, 0ms`,
  }
}
