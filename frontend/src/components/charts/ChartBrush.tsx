/**
 * Drag-to-zoom brush below a chart: a faint overview of the whole series with a
 * selection window that pans, resizes and steps by keyboard. Every change goes
 * through useChartRange, so the plot zooms while tables keep every row.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { animate, motion, useInView, useMotionValue, useTransform } from 'motion/react'

import type { ChartRangeControl } from '@/components/ui/useChartRange'
import { formatChartDate, formatChartPeriod } from '@/lib/chartDateLabels'
import { SPRING } from '@/constants/animations'
import { useMotionStore } from '@/store/motionStore'

import { chartTransition } from './chartMotion'
import { areaPath, linePath, type Point } from './paths'
import { linearScale } from './scales'
import { useElementSize } from './useElementSize'
import { usePrinting } from './usePrinting'

export interface ChartBrushProps {
  /** Zoom state from useChartRange; the chart gets the same range as `visibleRange`. */
  readonly range: ChartRangeControl
  /** One number per label, drawn as the overview of the full series. */
  readonly values?: readonly number[]
  /** Overview color, as a CSS color or var(). */
  readonly color?: string
  /** Strip height in px; 36 by default, 44 on touch screens. */
  readonly height?: number
  /** Label text beside the handles and as the slider value; defaults to chart dates. */
  readonly formatLabel?: (label: string) => string
  readonly ariaLabel?: string
}

type DragKind = 'start' | 'end' | 'pan'
type IndexRange = { startIndex: number; endIndex: number }

/** One press: where it began, the latest whole-step range (null until the first move) and the last one sent. */
type DragState = {
  kind: DragKind; pointer: number; x: number; width: number
  from: IndexRange; next: IndexRange | null; sent: IndexRange; frame: number
}

const KEY_STEPS = new Map([
  ['ArrowLeft', -1], ['ArrowDown', -1], ['ArrowRight', 1], ['ArrowUp', 1],
  ['PageDown', -12], ['PageUp', 12], ['Home', -Infinity], ['End', Infinity],
])
/** The app's pill spring, settling to a fraction of a pixel on this 0-1 scale. */
const GLIDE = { ...SPRING.activePill, restDelta: 0.0005 }

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const toLeft = (fraction: number) => `${fraction * 100}%`
const toRight = (fraction: number) => `${(1 - fraction) * 100}%`
// Each label hangs outside its handle and slides back inside at the strip's ends.
const startShift = (fraction: number) => `max(0px, calc(100% - var(--brush-w) * ${fraction}))`
const endShift = (fraction: number) => `min(0px, calc(var(--brush-w) * ${1 - fraction} - 100%))`

/** Range brush for a zoomable chart; renders nothing below five points. */
export default function ChartBrush(props: ChartBrushProps) {
  // Size and in-view observers attach on mount, so the strip mounts only when shown.
  if (props.range.labels.length < 5) return null
  return <Brush {...props} />
}

const HAS_OBSERVER = typeof IntersectionObserver !== 'undefined'
const NO_ELEMENT = { current: null }

function Brush({ range, values, color = 'var(--color-primary)', height, formatLabel, ariaLabel = 'Chart range' }: ChartBrushProps) {
  const { labels, startIndex, endIndex, setRange } = range
  const count = labels.length
  const track = useRef<HTMLDivElement>(null)
  const drag = useRef<DragState | null>(null)
  const size = useElementSize(track)
  // Motion's inView constructs an IntersectionObserver unguarded; jsdom has none.
  const inView = useInView(HAS_OBSERVER ? track : NO_ELEMENT, { once: true, amount: 0.5 })
  const printing = usePrinting()
  const reduced = useMotionStore((state) => state.mode === 'reduced')
  const [dragKind, setDragKind] = useState<DragKind | null>(null)
  // Window edges as fractions of the strip; every position below is a percentage of them.
  const f0 = useMotionValue(startIndex / count)
  const f1 = useMotionValue((endIndex + 1) / count)
  const left0 = useTransform(f0, toLeft)
  const left1 = useTransform(f1, toLeft)
  const right0 = useTransform(f0, toRight)
  const right1 = useTransform(f1, toRight)
  const shift0 = useTransform(f0, startShift)
  const shift1 = useTransform(f1, endShift)
  const paths = useMemo(() => overview(values, count, size.width, size.height), [values, count, size.width, size.height])
  const animated = !reduced && !printing
  const drawn = !animated || inView || !HAS_OBSERVER
  const shown = formatLabel ?? formatChartPeriod
  const spoken = formatLabel ?? formatChartDate

  // Presets, keys and a released drag glide the window onto whole indices;
  // mid-drag it follows the pointer instead.
  useEffect(() => {
    if (dragKind) return
    const transition = animated ? GLIDE : { duration: 0 }
    const glides = [animate(f0, startIndex / count, transition), animate(f1, (endIndex + 1) / count, transition)]
    return () => glides.forEach((glide) => glide.stop())
  }, [startIndex, endIndex, count, dragKind, animated, f0, f1])

  const begin = (kind: DragKind, event: PointerEvent<HTMLDivElement>) => {
    const width = track.current?.clientWidth ?? 0
    if (drag.current || width === 0 || (event.pointerType === 'mouse' && event.button !== 0)) return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    const from = { startIndex, endIndex }
    drag.current = { kind, pointer: event.pointerId, x: event.clientX, width, from, next: null, sent: from, frame: 0 }
  }

  const flush = (state: DragState) => {
    cancelAnimationFrame(state.frame)
    state.frame = 0
    const { next, sent } = state
    if (!next || (next.startIndex === sent.startIndex && next.endIndex === sent.endIndex)) return
    state.sent = next
    setRange(next)
  }

  const move = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current
    if (!state || state.pointer !== event.pointerId) return
    if (!state.next) {
      f0.stop()
      f1.stop()
      setDragKind(state.kind)
    }
    // The window follows the pointer in fractional steps; the chart gets whole ones, once a frame.
    const steps = ((event.clientX - state.x) / state.width) * count
    const live = stepRange(state.kind, state.from, steps, count)
    f0.set(live.startIndex / count)
    f1.set((live.endIndex + 1) / count)
    state.next = stepRange(state.kind, state.from, Math.round(steps), count)
    if (!state.frame) state.frame = requestAnimationFrame(() => flush(state))
  }

  const end = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current
    if (!state || state.pointer !== event.pointerId) return
    flush(state)
    drag.current = null
    setDragKind(null)
  }

  const keyStep = (kind: DragKind) => (event: KeyboardEvent<HTMLDivElement>) => {
    const step = KEY_STEPS.get(event.key)
    if (step === undefined) return
    event.preventDefault()
    setRange(stepRange(kind, { startIndex, endIndex }, step, count))
  }

  // A 44px target biased outward from its edge, so a narrow window keeps room to pan.
  const handle = (kind: 'start' | 'end') => {
    const isStart = kind === 'start'
    const index = isStart ? startIndex : endIndex
    return (
      <motion.div
        role="slider" tabIndex={0} aria-label={isStart ? 'Range start' : 'Range end'}
        aria-valuemin={isStart ? 0 : startIndex} aria-valuemax={isStart ? endIndex : count - 1}
        aria-valuenow={index} aria-valuetext={spoken(labels[index])}
        className={`group absolute top-1/2 z-10 flex h-[max(2.75rem,var(--brush-h))] w-11 -translate-y-1/2 cursor-ew-resize touch-none items-center focus-visible:outline-none ${isStart ? '-ml-[30px] justify-end pr-2' : '-ml-3.5 pl-2'}`}
        style={{ left: isStart ? left0 : left1 }}
        onPointerDown={(event) => begin(kind, event)}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onLostPointerCapture={end}
        onKeyDown={keyStep(kind)}
      >
        <span className={`flex h-[calc(var(--brush-h)_-_10px)] w-3 items-center justify-center rounded-full bg-primary shadow-sm transition group-hover:bg-app-blue-vibrant group-focus-visible:ring-2 group-focus-visible:ring-[var(--focus-ring)] ${dragKind === kind ? 'scale-110' : ''}`}>
          <span className="h-2.5 w-[5px] border-x border-on-accent" />
        </span>
        {/* The dragged edge's date (both while panning): under the handle with a mouse, above it on touch. */}
        <motion.span
          aria-hidden="true"
          className={`pointer-events-none absolute top-full mt-1 whitespace-nowrap rounded-md border border-border bg-surface-tooltip px-1.5 py-0.5 text-xs font-medium tabular-nums text-foreground shadow-sm transition-opacity pointer-coarse:top-auto pointer-coarse:bottom-full pointer-coarse:mt-0 pointer-coarse:mb-2 ${isStart ? 'right-3.5' : 'left-3.5'} ${dragKind === kind || dragKind === 'pan' ? 'opacity-100' : 'opacity-0'}`}
          style={{ x: isStart ? shift0 : shift1 }}
        >
          {shown(labels[index])}
        </motion.span>
      </motion.div>
    )
  }

  const style = { '--brush-w': `${size.width}px`, ...(height === undefined ? {} : { '--brush-h': `${height}px` }) } as CSSProperties
  const dimmed = 'absolute inset-y-0 bg-card/60'

  return (
    <fieldset aria-label={ariaLabel} className="m-0 mt-2 min-w-0 border-0 p-0 px-3">
      <div
        ref={track}
        style={style}
        className={`relative h-(--brush-h) select-none rounded-md border border-(--chart-svg-stroke) [--brush-h:36px] pointer-coarse:[--brush-h:44px] ${values?.length ? '' : 'bg-(--chart-grid)'}`}
      >
        {paths && (
          <svg width={size.width} height={size.height} className="absolute inset-0" aria-hidden="true" focusable="false">
            <motion.path
              d={paths.area} style={{ fill: color }} fillOpacity={0.14} transition={chartTransition('area', animated, 0.25)}
              initial={{ opacity: drawn ? 1 : 0 }} animate={{ opacity: drawn ? 1 : 0 }}
            />
            <motion.path
              d={paths.line} fill="none" style={{ stroke: color }} strokeOpacity={0.6} strokeWidth={1.5} strokeLinejoin="round"
              initial={{ pathLength: drawn ? 1 : 0 }} animate={{ pathLength: drawn ? 1 : 0 }} transition={chartTransition('draw', animated)}
            />
          </svg>
        )}
        <motion.div className={`${dimmed} left-0 rounded-l-[5px]`} style={{ right: right0 }} />
        <motion.div className={`${dimmed} right-0 rounded-r-[5px]`} style={{ left: left1 }} />
        {handle('start')}
        <motion.div
          role="slider" tabIndex={0} aria-label="Selected range"
          aria-valuemin={0} aria-valuemax={count - 1 - endIndex + startIndex} aria-valuenow={startIndex}
          aria-valuetext={`${spoken(labels[startIndex])} to ${spoken(labels[endIndex])}`}
          className={`absolute inset-y-0 touch-pan-y rounded-[5px] bg-primary/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${dragKind === 'pan' ? 'cursor-grabbing' : 'cursor-grab'}`}
          style={{ left: left0, right: right1 }}
          onPointerDown={(event) => begin('pan', event)}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          onLostPointerCapture={end}
          onKeyDown={keyStep('pan')}
        />
        {handle('end')}
      </div>
    </fieldset>
  )
}

/** Line and area paths of the whole series inside the strip; null when there is nothing to draw. */
function overview(values: readonly number[] | undefined, count: number, width: number, height: number) {
  const finite = values?.filter((value) => Number.isFinite(value)) ?? []
  if (width <= 0 || height <= 0 || finite.length === 0) return null
  const y = linearScale([Math.min(...finite), Math.max(...finite)], [height - 3, 3], { nice: false })
  // A gap carries the last number forward, like connectNulls on the chart.
  let last = finite[0]
  const top: Point[] = Array.from({ length: count }, (_, index) => {
    const value = values?.[index] ?? Number.NaN
    if (Number.isFinite(value)) last = value
    return { x: (index / (count - 1)) * width, y: y(last) }
  })
  return { line: linePath(top), area: areaPath(top, top.map(({ x }) => ({ x, y: height }))) }
}

/** Moves one edge, or the whole window for a pan, by `step` points without leaving the data. */
function stepRange(kind: DragKind, { startIndex, endIndex }: IndexRange, step: number, count: number): IndexRange {
  if (kind === 'start') return { startIndex: clamp(startIndex + step, 0, endIndex), endIndex }
  if (kind === 'end') return { startIndex, endIndex: clamp(endIndex + step, startIndex, count - 1) }
  const start = clamp(startIndex + step, 0, count - 1 - (endIndex - startIndex))
  return { startIndex: start, endIndex: start + endIndex - startIndex }
}
