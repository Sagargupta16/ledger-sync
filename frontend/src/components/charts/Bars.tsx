/**
 * Bar mark for CartesianChart (categoryKind 'band'), one <Bars> per series, replacing Recharts'
 * Bar, Cell and LabelList. Columns or ranking rows, side by side (groupIndex, groupCount) or
 * stacked (stackId); bars grow out of the zero line on entry and morph between data states.
 */

import { useState, type KeyboardEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'

import { useCartesian, useChartFrame, type CartesianState, type ChartRow, type PlotBox } from './chartContext'
import { CHART_MOTION, chartTransition, staggerDelay } from './chartMotion'
import { roundedRectPath, type CornerRadii } from './paths'

/** Far-end corner radius of a plain bar, as BAR_RADIUS had it. */
const RADIUS = 5
const BAR_SIZE = 36
const GROUP_GAP = 4
const DIMMED = 0.45
const LABEL_SIZE = 10
const LABEL_GAP = 4
// Floor for sizes and corner radii: roundedRectPath returns '' at size 0 and drops an arc at
// radius 0. Above it every bar state has the same path commands, so Motion can morph `d`.
const EPSILON = 0.001

export interface BarsProps {
  /** Row field of this series; list it in CartesianChart's `series` too. */
  readonly dataKey: string
  readonly color: string
  /** Per-bar colour (Recharts' Cell); `index` is the row's position in the full data. */
  readonly colorFor?: (row: ChartRow, index: number) => string
  /** Fixed, or per bar (e.g. faded projected months). */
  readonly fillOpacity?: number | ((row: ChartRow, index: number) => number)
  /** Outline, such as the dashed edge of a projected segment. */
  readonly stroke?: string
  readonly strokeDasharray?: string
  /** Radius of the corners away from zero: default 5, or 0 for stacked segments, which all round unless `stackKeys` is set. */
  readonly radius?: number
  /** Keys of this bar's stack, bottom to top, so `radius` rounds only each row's outermost segment. */
  readonly stackKeys?: readonly string[]
  /** Slot among side-by-side series, and how many series share a band. */
  readonly groupIndex?: number
  readonly groupCount?: number
  /** Thickest a bar may grow (default 36) and the space between grouped bars (default 4), in px. */
  readonly barSize?: number
  readonly gap?: number
  /** Value label at the bar end, inside when it fits; '' draws none. */
  readonly label?: (value: number, row: ChartRow) => string
  /** Click, Enter or Space on a bar; makes bars focusable. `index` is in the full data. */
  readonly onSelect?: (row: ChartRow, index: number) => void
  /** Active-band highlight; default on for groupIndex 0, and in a stack only for its bottom series (needs stackKeys). */
  readonly highlightBand?: boolean
}

interface BarShape {
  /** `key`: the category, suffixed when one repeats (AnimatePresence); `index`: visible row, as activeIndex. */
  key: string
  index: number
  row: ChartRow
  value: number
  /** Final rect; `base` is flat on the zero line (first reveal), `seat` flat on the bar's own base (later enter and exit). */
  rect: PlotBox
  base: PlotBox
  seat: PlotBox
  radii: CornerRadii
  /** `up` extends toward larger values (up, or right when vertical); `outer` has no later stacked segment beyond it. */
  up: boolean
  outer: boolean
}

/** One bar series, drawn from CartesianChart's scales with ChartFrame's motion settings. */
export default function Bars(props: BarsProps) {
  const chart = useCartesian()
  const frame = useChartFrame()
  // The first reveal staggers bars up from the zero line; later changes morph them.
  const [introPlayed, setIntroPlayed] = useState(frame.entered)
  const { dataKey, color, colorFor, fillOpacity = 1, stroke, strokeDasharray, label, onSelect, stackKeys } = props
  const { activeIndex, rowOffset, rows } = chart
  const intro = frame.entered && !introPlayed
  const hover = chartTransition('hover', frame.animate)
  const update = chartTransition('update', frame.animate)
  const first = (props.groupIndex ?? 0) === 0 && (!chart.stacked(dataKey) || stackKeys?.[0] === dataKey)
  const highlightAt = (props.highlightBand ?? first) ? activeIndex : null

  return (
    <g>
      <AnimatePresence initial={false}>
        {highlightAt !== null && (
          <motion.path
            key="band"
            className="pointer-events-none fill-(--chart-cursor)"
            initial={{ d: bandPath(chart, highlightAt, props), opacity: 0 }}
            animate={{ d: bandPath(chart, highlightAt, props), opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={hover}
          />
        )}
        {layoutBars(chart, props).map((shape) => {
          const index = rowOffset + shape.index
          const fill = colorFor?.(shape.row, index) ?? color
          const opacity = typeof fillOpacity === 'function' ? fillOpacity(shape.row, index) : fillOpacity
          const delay = intro ? staggerDelay(shape.index, rows.length) : 0
          const geometry = intro ? chartTransition('bar', frame.animate, delay) : update
          const text = label?.(shape.value, shape.row) ?? ''
          const spot = text ? labelSpot(shape, text, chart.layout === 'horizontal') : null
          // A faint bar mostly shows the card, so its label keeps the card's text colour.
          const onBar = spot?.inside === true && opacity >= 0.6
          const labelDelay = intro ? delay + CHART_MOTION.bar * 0.7 : CHART_MOTION.update * 0.7
          const name = `${chart.label(shape.index)}: ${text || String(shape.value)}`
          return (
            <motion.g
              key={`bar:${shape.key}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: activeIndex === null || activeIndex === shape.index ? 1 : DIMMED }}
              exit={{ opacity: 0, transition: update }}
              transition={hover}
            >
              <motion.path
                initial={{ d: barPath(intro ? shape.base : shape.seat, shape.radii) }}
                animate={{ d: barPath(frame.entered ? shape.rect : shape.base, shape.radii) }}
                exit={{ d: barPath(shape.seat, shape.radii), transition: update }}
                transition={geometry}
                onAnimationStart={intro ? () => setIntroPlayed(true) : undefined}
                fill={fill}
                fillOpacity={opacity}
                stroke={stroke}
                strokeDasharray={strokeDasharray}
                {...(onSelect ? selectProps(() => onSelect(shape.row, index), name, () => chart.setActiveIndex(shape.index)) : {})}
              />
              {spot && (
                <motion.text
                  initial={{ attrX: spot.x, attrY: spot.y, opacity: 0 }}
                  animate={{ attrX: spot.x, attrY: spot.y, opacity: frame.entered ? 1 : 0 }}
                  transition={{ default: geometry, opacity: chartTransition('hover', frame.animate, labelDelay) }}
                  dy={spot.dy}
                  textAnchor={spot.anchor}
                  fontSize={LABEL_SIZE}
                  style={onBar ? { fill: textOn(fill) } : undefined}
                  className={`pointer-events-none font-mono font-medium ${onBar ? '' : 'fill-(--chart-text-muted)'}`}
                >
                  {text}
                </motion.text>
              )}
            </motion.g>
          )
        })}
      </AnimatePresence>
    </g>
  )
}

/** Final geometry of every drawable bar; gaps (null) and zeros draw nothing. */
function layoutBars(chart: CartesianState, props: BarsProps): BarShape[] {
  const { dataKey, stackKeys } = props
  const { category, numberAt } = chart
  const horizontal = chart.layout === 'horizontal'
  const scale = chart.scaleFor(dataKey)
  const stack = chart.stacked(dataKey)
  const [lo, hi] = [Math.min(...scale.range), Math.max(...scale.range)]
  const pixel = (value: number) => Math.min(hi, Math.max(lo, scale(value)))
  const zero = pixel(0)
  const { thickness, offset } = groupSlot(category.bandwidth, props)
  const radius = Math.max(EPSILON, props.radius ?? (stack ? 0 : RADIUS))
  // Stacks grow outward in series order, so a later value of the same sign covers this segment.
  const later = stack && stackKeys ? stackKeys.slice(stackKeys.indexOf(dataKey) + 1) : []
  const repeats = new Map<string, number>()
  return chart.rows.flatMap((row, index) => {
    const value = numberAt(row, dataKey)
    if (!value) return []
    const up = value > 0
    const a = pixel(stack?.[index]?.y0 ?? 0)
    const b = pixel(stack?.[index]?.y1 ?? value)
    const outer = later.every((key) => Math.sign(numberAt(row, key) ?? 0) !== (up ? 1 : -1))
    const start = category.start(index) + offset
    const rect = horizontal
      ? { x: start, y: Math.min(a, b), width: thickness, height: Math.abs(b - a) }
      : { x: Math.min(a, b), y: start, width: Math.abs(b - a), height: thickness }
    const flat = (edge: number) => (horizontal ? { ...rect, y: edge, height: 0 } : { ...rect, x: edge, width: 0 })
    const name = chart.label(index)
    const seen = repeats.get(name) ?? 0
    repeats.set(name, seen + 1)
    const radii = farEndRadii(horizontal, up, outer ? radius : EPSILON)
    return [{ key: seen ? `${name}#${seen}` : name, index, row, value, rect, base: flat(zero), seat: flat(a), radii, up, outer }]
  })
}

/** This series' bar thickness and offset inside a band, and the span of its whole group. */
function groupSlot(band: number, { groupIndex = 0, groupCount = 1, barSize = BAR_SIZE, gap = GROUP_GAP }: BarsProps) {
  const count = Math.max(1, groupCount)
  const space = count > 1 ? Math.min(gap, band / 2 / (count - 1)) : 0
  const thickness = Math.max(EPSILON, Math.min(barSize, (band - space * (count - 1)) / count))
  const span = thickness * count + space * (count - 1)
  return { thickness, span, offset: (band - span) / 2 + groupIndex * (thickness + space) }
}

/** Rounds the two corners away from zero; the base corners stay square. */
function farEndRadii(horizontal: boolean, up: boolean, r: number): CornerRadii {
  if (horizontal) return up ? [r, r, EPSILON, EPSILON] : [EPSILON, EPSILON, r, r]
  return up ? [EPSILON, r, r, EPSILON] : [r, EPSILON, EPSILON, r]
}

const barPath = ({ x, y, width, height }: PlotBox, radii: CornerRadii) =>
  roundedRectPath(x, y, Math.max(EPSILON, width), Math.max(EPSILON, height), radii)

/** Highlight behind the active band: hugs the bar group, at most one step wide. */
function bandPath(chart: CartesianState, index: number, props: BarsProps): string {
  const { plot, category } = chart
  const size = Math.min(category.step, groupSlot(category.bandwidth, props).span + 16)
  const start = category.center(index) - size / 2
  const rect = chart.layout === 'horizontal'
    ? { x: start, y: plot.y, width: size, height: plot.height }
    : { x: plot.x, y: start, width: plot.width, height: size }
  return barPath(rect, [4, 4, 4, 4])
}

interface LabelSpot { x: number; y: number; anchor: 'start' | 'middle' | 'end'; dy: string; inside: boolean }

/** On the bar at its far end when the text fits (`inside`), else just beyond it; an inner stack segment has no beyond. */
function labelSpot({ rect, up, outer }: BarShape, text: string, horizontal: boolean): LabelSpot | null {
  // Tabular mono digits are about 0.6em wide; there is no layout pass to measure with.
  const width = text.length * LABEL_SIZE * 0.62
  const inside = horizontal
    ? rect.height >= LABEL_SIZE + LABEL_GAP * 2 && rect.width >= width + LABEL_GAP
    : rect.width >= width + LABEL_GAP * 2 && rect.height >= LABEL_SIZE + 2
  if (!inside && !outer) return null
  // Inside a positive bar and outside a negative one both sit on the low-value side of the far edge.
  const back = up === inside
  if (horizontal) {
    const edge = up ? rect.y : rect.y + rect.height
    return { x: rect.x + rect.width / 2, y: edge + (back ? LABEL_GAP : -LABEL_GAP), anchor: 'middle', dy: back ? '0.71em' : '0', inside }
  }
  const edge = up ? rect.x + rect.width : rect.x
  return { x: edge + (back ? -LABEL_GAP : LABEL_GAP), y: rect.y + rect.height / 2, anchor: back ? 'end' : 'start', dy: '0.35em', inside }
}

/** Black or white, whichever reads on `color`; relative colour syntax, so var() colours work too. */
const textOn = (color: string) => `oklch(from ${color} clamp(0, (0.7 - l) * 1000, 1) 0 0)`

/** Click, Enter and Space select the bar; focusing it moves the active band there. */
function selectProps(select: () => void, name: string, focus: () => void) {
  const onKeyDown = (event: KeyboardEvent<SVGPathElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    select()
  }
  const className = 'cursor-pointer outline-none focus-visible:stroke-ring focus-visible:stroke-2'
  return { role: 'button', tabIndex: 0, 'aria-label': name, className, onClick: select, onFocus: focus, onKeyDown }
}
