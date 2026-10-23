/**
 * Motion tokens for every chart mark. One place sets how long a line takes to
 * draw, how bars stagger and how a data change morphs, so all charts move
 * alike. Durations are seconds (Motion's unit).
 */

export const CHART_EASE = [0.22, 1, 0.36, 1] as const

export const CHART_MOTION = {
  /** Line stroke drawing from the first point to the last. */
  draw: 1.1,
  /** Area fill wiping in behind its line. */
  area: 1,
  /** One bar growing from the baseline. */
  bar: 0.7,
  /** One pie or donut slice sweeping open. */
  arc: 0.9,
  /** Morph between two data states after a filter or range change; users repeat these. */
  update: 0.4,
  /** Hover and focus emphasis. */
  hover: 0.18,
  /** Longest delay any staggered mark waits, so a whole entrance stays near one second. */
  maxStagger: 0.45,
  /** Delay between neighbouring marks before the cap applies. */
  step: 0.04,
} as const

export type ChartMotionKind = 'draw' | 'area' | 'bar' | 'arc' | 'update' | 'hover'

/** Delay for mark `index` of `count`: a fixed step, compressed to the cap on long series. */
export function staggerDelay(index: number, count: number): number {
  if (count <= 1) return 0
  return Math.min(index * CHART_MOTION.step, (index / (count - 1)) * CHART_MOTION.maxStagger)
}

/** A Motion `transition` for one mark; zero duration when the chart does not animate. */
export function chartTransition(kind: ChartMotionKind, animate: boolean, delay = 0) {
  return animate
    ? { duration: CHART_MOTION[kind], ease: CHART_EASE, delay }
    : { duration: 0 }
}
