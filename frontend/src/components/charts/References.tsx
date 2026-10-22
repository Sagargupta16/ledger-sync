/**
 * Reference marks for CartesianChart: a rule at a value or category, a band, and a marked
 * point. They skip what the visible domain leaves out, enter after the series and glide.
 */

import { useState } from 'react'
import { motion } from 'motion/react'

import { useCartesian, useChartFrame, type CartesianState } from './chartContext'
import { CHART_EASE, CHART_MOTION, chartTransition } from './chartMotion'
import type { LinearScale } from './scales'

/** The semantic treatments of the old chartDefaults referenceLine() helper. */
export type ReferenceLineVariant = 'peak' | 'avg' | 'target' | 'goal' | 'zero'
/** Right/Left is the text alignment, as in Recharts (insideTopRight sits left of a vertical line); `end` is past the drawn end. */
export type ReferenceLabelPosition = 'insideTopRight' | 'insideTopLeft' | 'end'

type ValueAxis = 'left' | 'right'
type Span = readonly [number, number]
type Spot = Readonly<{ x: number; y: number; anchor: 'start' | 'middle' | 'end'; dy?: string }>

const VARIANTS: Record<ReferenceLineVariant, { stroke: string; dash?: string; label?: string }> = {
  peak: { stroke: 'var(--chart-reference-line)', dash: '3 5' },
  avg: { stroke: 'var(--chart-reference-line)', dash: '3 5' },
  target: { stroke: 'var(--chart-reference-line-strong)', dash: '6 3' },
  goal: { stroke: 'var(--color-app-green)', dash: '6 3', label: 'var(--color-app-green)' },
  zero: { stroke: 'var(--chart-reference-line-strong)' },
}

/** References start once the series is under way; labels and dots follow the line. */
const DELAY = 0.35
const LABEL_DELAY = DELAY + CHART_MOTION.draw * 0.7
const DOT_DELAY = DELAY + CHART_MOTION.draw * 0.5
const POP = { type: 'spring', bounce: 0.5, visualDuration: 0.45, delay: DOT_DELAY } as const
const PULSE = { duration: 0.9, ease: CHART_EASE, delay: DOT_DELAY + 0.1 }
/** Gap between a mark and its label; inset of a label from the line's end. */
const GAP = 5
const INSET = 8
const SUBTLE = 'var(--chart-text-subtle)'
const TEXT = { fontSize: 10, fontFamily: 'var(--font-mono)' } as const

interface MarkProps {
  readonly axis?: ValueAxis
  /** Stroke of a line, fill of an area or dot: a CSS color, var() included. */
  readonly color?: string
  readonly label?: string
  readonly labelColor?: string
}

/** Set `value` (on `axis`, default left) or `category`; `value` wins when both are set. */
export interface ReferenceLineProps extends MarkProps {
  readonly value?: number
  /** Category key; the line crosses that category's centre. */
  readonly category?: string
  readonly variant?: ReferenceLineVariant
  /** Overrides for the variant's dash ('none' is solid) and stroke width. */
  readonly dash?: string
  readonly strokeWidth?: number
  readonly labelPosition?: ReferenceLabelPosition
}

/** A rule across the plot: draws in left to right (bottom to top when vertical), glides on change. */
export function ReferenceLine({
  value, axis, category, variant = 'peak', color, dash, strokeWidth = 1,
  label, labelPosition = 'insideTopRight', labelColor,
}: ReferenceLineProps) {
  const state = useCartesian()
  const frame = useChartFrame()
  const [drawn, setDrawn] = useState(false)
  const span = value === undefined ? categorySpan(state, category) : valueSpan(axisScale(state, axis), value)
  // Mounted from the first paint and driven by `entered`: a mark that mounts
  // later inside AnimatePresence initial={false} (the route frame) would skip
  // its entrance, as on a hard load or deep link.
  if (!span) return null
  const shown = frame.entered
  const { plot } = state
  // A value line runs along the category axis, a category line along the value axis.
  const horizontal = (value !== undefined) === (state.layout === 'horizontal')
  const at = (span[0] + span[1]) / 2
  const [from, to] = horizontal ? [plot.x, plot.x + plot.width] : [plot.y + plot.height, plot.y]
  const look = VARIANTS[variant]
  // Growing x2/y2 keeps dashes crisp (pathLength overwrites them); once drawn, resizes glide.
  const tip = (pixel: number) => (horizontal ? { x2: pixel } : { y2: pixel })
  return (
    <motion.g initial={false} animate={horizontal ? { x: 0, y: at } : { x: at, y: 0 }} transition={chartTransition('update', frame.animate)}>
      <motion.line
        {...(horizontal ? { x1: from, y1: 0, y2: 0 } : { x1: 0, y1: from, x2: 0 })}
        initial={false}
        animate={tip(shown ? to : from)}
        transition={drawn ? chartTransition('update', frame.animate) : chartTransition('draw', frame.animate, DELAY)}
        onAnimationComplete={() => {
          if (shown) setDrawn(true)
        }}
        style={{ stroke: color ?? look.stroke, strokeDasharray: dash ?? look.dash, strokeWidth }}
      />
      {label && <ReferenceLabel {...labelSpot(horizontal, from, to, labelPosition)} text={label}
        color={labelColor ?? look.label ?? SUBTLE} delay={LABEL_DELAY} animate={frame.animate} shown={shown} />}
    </motion.g>
  )
}

/** Bounds on the value axis, the category axis, or both for a rectangle. */
export interface ReferenceAreaProps extends MarkProps {
  /** Value-axis bounds, clipped to the visible domain; omit to span the whole axis. */
  readonly value?: Span
  /** First and last category keys, both bands included; omit to span every category. */
  readonly category?: readonly [string, string]
  /** Fill opacity, 0 to 1. */
  readonly opacity?: number
}

/** A soft band between two values and/or two categories, labelled top-left; fades in after the series. */
export function ReferenceArea({
  value, axis, category, color = SUBTLE, opacity = 0.08, label, labelColor = SUBTLE,
}: ReferenceAreaProps) {
  const state = useCartesian()
  const frame = useChartFrame()
  const { plot, layout } = state
  const scale = axisScale(state, axis)
  const v = value ? valueSpan(scale, ...value) : scale.range
  const every: Span = layout === 'horizontal' ? [plot.x, plot.x + plot.width] : [plot.y, plot.y + plot.height]
  const c = category ? categorySpan(state, ...category) : every
  if (!v || !c) return null
  const [xs, ys] = layout === 'horizontal' ? [c, v] : [v, c]
  const [x, y] = [Math.min(...xs), Math.min(...ys)]
  return (
    <motion.g initial={false} animate={{ opacity: frame.entered ? 1 : 0 }} transition={chartTransition('area', frame.animate, DELAY)}>
      <motion.rect initial={false} transition={chartTransition('update', frame.animate)} style={{ fill: color, fillOpacity: opacity }}
        animate={{ attrX: x, attrY: y, width: Math.abs(xs[1] - xs[0]), height: Math.abs(ys[1] - ys[0]) }} />
      {label && <text x={x + INSET} y={y + INSET} dy="0.71em" style={{ ...TEXT, fill: labelColor }}>{label}</text>}
    </motion.g>
  )
}

/** A dot at (`category`, `value`); `r` is its radius in px. */
export interface ReferenceDotProps extends MarkProps {
  readonly category: string
  readonly value: number
  readonly r?: number
}

/** A marked point such as a peak, labelled above: pops in on a spring with one fading pulse ring. */
export function ReferenceDot({
  category, value, axis, color = 'var(--color-app-blue)', r = 4, label, labelColor = SUBTLE,
}: ReferenceDotProps) {
  const state = useCartesian()
  const frame = useChartFrame()
  const c = categorySpan(state, category)
  const v = valueSpan(axisScale(state, axis), value)
  if (!c || !v) return null
  const shown = frame.entered
  const along = (c[0] + c[1]) / 2
  const point = state.layout === 'horizontal' ? { x: along, y: v[0] } : { x: v[0], y: along }
  return (
    <motion.g initial={false} animate={point} transition={chartTransition('update', frame.animate)}>
      {frame.animate && (
        <motion.circle r={r} vectorEffect="non-scaling-stroke" initial={false}
          animate={shown ? { scale: [1, 3], opacity: [0.6, 0] } : { scale: 1, opacity: 0 }}
          transition={PULSE} style={{ fill: 'none', stroke: color, strokeWidth: 1.5 }} />
      )}
      <motion.circle r={r} initial={false} animate={{ scale: shown ? 1 : 0 }}
        transition={frame.animate ? POP : { duration: 0 }} style={{ fill: color, stroke: 'var(--chart-active-stroke)', strokeWidth: 2 }} />
      {label && <ReferenceLabel x={0} y={-(r + GAP)} anchor="middle" text={label} color={labelColor}
        delay={DOT_DELAY + 0.25} animate={frame.animate} shown={shown} />}
    </motion.g>
  )
}

function ReferenceLabel({ x, y, anchor, dy, text, color, delay, animate, shown }: Spot & Readonly<{ text: string; color: string; delay: number; animate: boolean; shown: boolean }>) {
  return (
    <motion.text x={x} y={y} dy={dy} textAnchor={anchor} initial={false}
      animate={{ opacity: shown ? 1 : 0 }} transition={chartTransition('update', animate, delay)} style={{ ...TEXT, fill: color }}>
      {text}
    </motion.text>
  )
}

const axisScale = (state: CartesianState, axis?: ValueAxis): LinearScale =>
  axis === 'right' ? (state.value2 ?? state.value) : state.value

/** Pixels of [a, b] clipped to the value domain; null when it misses the domain. */
function valueSpan(scale: LinearScale, a: number, b = a): Span | null {
  const [min, max] = scale.domain
  const lo = Math.max(Math.min(a, b), min)
  const hi = Math.min(Math.max(a, b), max)
  return lo <= hi ? [scale(lo), scale(hi)] : null
}

/** Pixels from key a's band start to key b's band end; null unless both keys are visible. */
function categorySpan({ category }: CartesianState, a?: string, b = a): Span | null {
  const i = category.keys.findIndex((key) => key === a)
  const j = category.keys.findIndex((key) => key === b)
  if (i < 0 || j < 0) return null
  return [category.start(Math.min(i, j)), category.start(Math.max(i, j)) + category.bandwidth]
}

/** Label spot in the line's own frame, where the line sits at 0 on its cross axis. */
function labelSpot(horizontal: boolean, from: number, to: number, position: ReferenceLabelPosition): Spot {
  const left = position === 'insideTopLeft'
  if (horizontal) {
    if (position === 'end') return { x: to + GAP, y: 0, anchor: 'start', dy: '0.32em' }
    return { x: left ? from + INSET : to - INSET, y: -GAP, anchor: left ? 'start' : 'end' }
  }
  if (position === 'end') return { x: 0, y: to - GAP, anchor: 'middle' }
  return { x: left ? GAP : -GAP, y: to + INSET, anchor: left ? 'start' : 'end', dy: '0.71em' }
}
