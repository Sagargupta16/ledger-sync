/**
 * Line marks for the chart kit. LineSeries strokes one value series and rings
 * the active row; SeriesPath is the animated geometry it shares with AreaSeries.
 * A solid stroke draws in with `pathLength`; a dashed stroke or a fill wipes in
 * through a clip (`pathLength` overwrites dash patterns). New data morphs `d`,
 * which Motion only interpolates between paths of one command structure, so a
 * new point count remounts the path and replays a quick wipe. A resize jumps.
 * Hovering changes only the active row: the geometry is memoized and SeriesPath
 * is a memo component, so the paths skip those renders and only the ring moves.
 */

import { memo, useMemo, useState } from 'react'
import { motion } from 'motion/react'

import { useCartesian, useChartFrame, type FrameState, type PlotBox } from './chartContext'
import { CHART_MOTION, chartTransition, staggerDelay } from './chartMotion'
import { areaPath, linePath, type Curve, type Point } from './paths'
import type { CategoryScale } from './scales'

const SERIES_STAGGER = 0.12 // seconds each later series waits before it enters
const CLIP_PAD = 8 // clip overhang, so round caps, wide strokes and dots are never shaved
const POP = { type: 'spring', visualDuration: CHART_MOTION.hover, bounce: 0.4 } as const

/** Pixel y per visible row; null is a gap. */
type Ys = readonly (number | null)[]

/** Defaults: strokeWidth 2.25, curve 'monotone', connectNulls true, showDots 'auto', activeDot true. */
export interface LineSeriesProps {
  /** Row field to plot. Its series spec picks the axis; a stackId plots the stack top. */
  readonly dataKey: string
  readonly color: string
  readonly strokeWidth?: number
  /** strokeDasharray such as '6 4'. A dashed line wipes in instead of drawing. */
  readonly dash?: string
  readonly curve?: Curve
  /** Bridge null rows, or break the line into separate segments at them. */
  readonly connectNulls?: boolean
  /** 'auto' marks a lone numeric point; true marks every point. */
  readonly showDots?: 'auto' | boolean
  /** Ring on the hovered or keyboard-focused row. */
  readonly activeDot?: boolean
  readonly opacity?: number
  /** Position among sibling series; each later one enters 0.12s after the last. */
  readonly seriesIndex?: number
}

/** A stroked value series: draws in left to right, morphs with the data, rings the active row. */
export default function LineSeries({ showDots = 'auto', activeDot = true, ...path }: LineSeriesProps) {
  const { rows, numberAt, stacked, scaleFor, category, plot, activeIndex } = useCartesian()
  const { dataKey } = path
  const scale = scaleFor(dataKey)
  const stack = stacked(dataKey)
  const top = useMemo(() => rows.map((row, index) => {
    const value = stack ? stack[index].y1 : numberAt(row, dataKey)
    return value === null ? null : scale(value)
  }), [rows, numberAt, scale, stack, dataKey])
  const count = top.filter((y) => y !== null).length
  const activeY = activeIndex === null ? null : top[activeIndex]
  return (
    <g>
      <SeriesPath {...path} top={top} category={category} plot={plot}
        dots={showDots === true || (showDots === 'auto' && count === 1)} />
      {activeDot && activeIndex !== null && activeY !== null && (
        <ActiveDot x={category.center(activeIndex)} y={activeY} color={path.color} />
      )}
    </g>
  )
}

export interface SeriesPathProps extends Omit<LineSeriesProps, 'showDots' | 'activeDot'> {
  /** The stroke, or a fill's top edge. */
  readonly top: Ys
  /** A fill's bottom edge. Given means this path is a gradient fill. */
  readonly bottom?: Ys
  /** The chart's category scale and plot box, passed in so a hover never re-renders the path. */
  readonly category: CategoryScale
  readonly plot: PlotBox
  /** Fill opacity at the top (default 0.22), fading to 0 at the bottom. */
  readonly fillOpacity?: number
  /** Mark every point with a small dot. */
  readonly dots?: boolean
}

/** What the last render drew, kept to tell a morph from a remount or a resize. */
interface Shape {
  readonly structure: string // curve and run lengths; `d` morphs only between equal ones
  readonly box: string // plot box `d` was laid out in
  readonly d: string
  readonly epoch: number // bumped per structure change; remounts the path and its clip
  readonly rewipe: boolean // the structure changed after the entrance: replay a quick wipe
  readonly snap: boolean // the last change was a resize: jump instead of morphing
}

/** One series' animated path: a stroke, or a gradient fill when `bottom` is given. */
export const SeriesPath = memo(function SeriesPath({
  dataKey, color, top, bottom, category, plot, fillOpacity = 0.22, strokeWidth = 2.25, dash,
  curve = 'monotone', connectNulls = true, opacity, seriesIndex = 0, dots = false,
}: SeriesPathProps) {
  const frame = useChartFrame()
  const { runs, d, structure } = useMemo(() => {
    const found = toRuns(top, bottom, category, connectNulls)
    return {
      runs: found,
      d: found.map((run) => (bottom ? areaPath(run.top, run.bottom, curve) : linePath(run.top, curve))).join(''),
      structure: `${curve}|${found.map((run) => run.top.length).join(',')}`,
    }
  }, [top, bottom, category, connectNulls, curve])
  const box = `${plot.x},${plot.y},${plot.width},${plot.height}`
  const [shape, setShape] = useState<Shape>(() => ({ structure, box, d, epoch: 0, rewipe: false, snap: true }))
  // Previous-render bookkeeping, updated during render as React documents.
  const next = nextShape(shape, { structure, box, d }, frame)
  if (next) setShape(next)

  const isFill = bottom !== undefined
  const id = `${frame.chartId}-${dataKey.replaceAll(/[^\w-]/g, '_')}`
  const clipId = `${id}-${isFill ? 'area' : 'line'}-clip`
  const wipes = isFill || Boolean(dash)
  const clipped = frame.animate && (wipes || shape.rewipe)
  const drawing = frame.animate && !wipes && !shape.rewipe // a solid stroke yet to draw in
  const visible = frame.entered ? 1 : 0
  const delay = seriesIndex * SERIES_STAGGER
  const { morph, draw, fade, wipe } = pathTransitions(shape, frame.animate, isFill, delay)
  const marks = dots ? runs.flatMap((run) => run.top) : []
  const pop = (index: number) =>
    frame.animate ? { ...POP, delay: delay + staggerDelay(index, marks.length) } : { duration: 0 }
  // A unit rect scaled over the plot, so a resize rescales the clip without disturbing a wipe.
  const clipBox = `translate(${plot.x - CLIP_PAD} ${-CLIP_PAD}) scale(${plot.width + CLIP_PAD * 2} ${frame.height + CLIP_PAD * 2})`

  return (
    <>
      <defs>
        {isFill && (
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={fillOpacity} />
            <stop offset="55%" stopColor={color} stopOpacity={fillOpacity * 0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        )}
        {clipped && (
          <clipPath id={clipId}>
            <motion.rect key={shape.epoch} x={0} y={0} height={1} transform={clipBox}
              initial={{ width: 0 }} animate={{ width: visible }} transition={wipe} />
          </clipPath>
        )}
      </defs>
      <g key={`${shape.epoch}${wipes ? 'w' : 'd'}`} clipPath={clipped ? `url(#${clipId})` : undefined}>
        <motion.path
          initial={drawing ? { d, pathLength: 0, opacity: 0 } : false}
          animate={wipes ? { d } : { d, pathLength: visible, opacity: visible }}
          transition={{ d: morph, pathLength: draw, opacity: fade }}
          fill={isFill ? `url(#${id})` : 'none'} stroke={isFill ? 'none' : color}
          strokeWidth={strokeWidth} strokeDasharray={dash} strokeOpacity={opacity}
          strokeLinecap="round" strokeLinejoin="round"
        />
        {marks.map((point, index) => (
          <motion.circle key={point.row} r={3} fill={color} fillOpacity={opacity}
            initial={drawing ? { cx: point.x, cy: point.y, scale: 0 } : false}
            animate={{ cx: point.x, cy: point.y, scale: visible }}
            transition={{ cx: morph, cy: morph, scale: pop(index) }} />
        ))}
      </g>
    </>
  )
})

/** The bookkeeping after this render, or null when nothing changed: a new structure remounts, a new box snaps, new data morphs. */
function nextShape(shape: Shape, { structure, box, d }: Pick<Shape, 'structure' | 'box' | 'd'>, frame: FrameState): Shape | null {
  if (shape.structure !== structure) {
    // Growing out of an empty path is still the entrance, so it keeps the full draw.
    const rewipe = frame.animate && frame.entered && shape.d !== ''
    return { structure, box, d, epoch: shape.epoch + 1, rewipe, snap: true }
  }
  if (shape.box !== box || shape.d !== d) return { ...shape, box, d, snap: shape.box !== box }
  return null
}

/** The path's morph, draw, fade and wipe transitions, from what the last render drew. */
function pathTransitions(shape: Shape, animate: boolean, isFill: boolean, delay: number) {
  const entrance = isFill ? 'area' : 'draw'
  return {
    morph: shape.snap ? { duration: 0 } : chartTransition('update', animate),
    draw: chartTransition('draw', animate, delay),
    // A round cap paints a dot at length 0, so the head also fades in as it starts.
    fade: chartTransition('hover', animate, delay),
    wipe: shape.rewipe ? chartTransition('update', true) : chartTransition(entrance, true, delay),
  }
}

/** The active-row ring: series fill, a surface-coloured outline, a spring on appear. */
function ActiveDot({ x, y, color }: { readonly x: number; readonly y: number; readonly color: string }) {
  const { animate } = useChartFrame()
  return (
    <motion.circle cx={x} cy={y} r={4.5} fill={color} strokeWidth={2} className="stroke-card"
      initial={animate ? { scale: 0 } : false} animate={{ scale: 1 }}
      transition={animate ? POP : { duration: 0 }} />
  )
}

/** A plotted point; `row` is its visible row index, a stable key for its dot. */
interface RowPoint extends Point { readonly row: number }

interface Run { readonly top: RowPoint[]; readonly bottom: Point[] }

/** Rows with a value become points; a gap ends the run unless nulls are bridged. */
function toRuns(top: Ys, bottom: Ys | undefined, category: CategoryScale, connectNulls: boolean): Run[] {
  const runs: Run[] = []
  let run: Run = { top: [], bottom: [] }
  for (let row = 0; row < top.length; row++) {
    const y = top[row]
    const y0 = bottom ? bottom[row] : 0
    if (y !== null && y0 !== null) {
      const x = category.center(row)
      run.top.push({ x, y, row })
      run.bottom.push({ x, y: y0 })
    } else if (!connectNulls && run.top.length > 0) {
      runs.push(run)
      run = { top: [], bottom: [] }
    }
  }
  if (run.top.length > 0) runs.push(run)
  return runs
}
