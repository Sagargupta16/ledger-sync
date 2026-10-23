/**
 * Animated SVG pie and donut, replacing Recharts' <Pie>. Once in view the slices sweep open clockwise
 * from 12 o'clock in sequence; on a data change they tween their angles (never their path strings).
 * The active slice (hover, tap, arrow keys, Home and End, or a legend via `activeKey`) springs out while the rest dim.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode, RefObject } from 'react'
import { animate as animateValue, motion, useMotionValue, useTransform } from 'motion/react'

import { SPRING } from '@/constants/animations'
import { formatCurrency, formatPercent } from '@/lib/formatters'

import ChartFrame from './ChartFrame'
import { useChartFrame } from './chartContext'
import { chartTransition, staggerDelay } from './chartMotion'
import { arcPath } from './paths'
import { usePrinting } from './usePrinting'

const TAU = Math.PI * 2
/** The active slice moves this far out along its bisector while its rim grows by GROW. */
const POP = 6
const GROW = 4
/** Space kept on every side of the pie so the active slice never clips. */
const RIM = POP + GROW + 2
const STEPS: Partial<Record<string, number>> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }

export interface PieDatum {
  readonly key: string
  readonly label: string
  readonly value: number
  readonly color: string
  /** False for a rollup such as "Other", which has nothing to drill into. */
  readonly selectable?: boolean
}

export interface PieChartProps {
  /** Slices in drawing order, already capped with `capPieSlices`; non-positive values are skipped. */
  readonly data: readonly PieDatum[]
  /** Hole radius as a share of the outer radius, 0 to 0.9; 0 draws a full pie. */
  readonly innerRadius?: number
  /** Gap between neighbouring slices, in radians. */
  readonly padAngle?: number
  /** Controlled active slice, so an external legend can drive the emphasis. */
  readonly activeKey?: string | null
  readonly onActiveChange?: (key: string | null) => void
  /** Drill-down: a mouse click, Enter, or a second tap on the active slice. */
  readonly onSelect?: (key: string) => void
  /** HTML centred in the hole, inside a size container that matches it. */
  readonly centerLabel?: ReactNode
  /** Amount format for the screen-reader label of the active slice. */
  readonly formatValue?: (value: number) => string
  readonly height?: number | 'fill'
  readonly ariaLabel?: string
}

type Slice = PieDatum & Readonly<{ start: number; end: number; share: number }>
type Geometry = Readonly<Record<'cx' | 'cy' | 'inner' | 'outer', number>>

/** Donut (default) or pie in its own measured frame. */
export default function PieChart({
  data, innerRadius = 0.62, padAngle = 0.012, activeKey, onActiveChange, onSelect, centerLabel,
  formatValue = formatCurrency, height = 300, ariaLabel,
}: PieChartProps) {
  const ratio = Math.min(0.9, Math.max(0, innerRadius))
  const slices = useMemo(() => layoutSlices(data), [data])
  const [ownActive, setOwnActive] = useState<string | null>(null)
  const current = slices.find((slice) => slice.key === (activeKey === undefined ? ownActive : activeKey))
  const setActive = (key: string | null) => {
    setOwnActive(key)
    onActiveChange?.(key)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') setActive(null)
    if (event.key === 'Enter' && current && current.selectable !== false) onSelect?.(current.key)
    const next = sliceForKey(event.key, current ? slices.indexOf(current) : -1, slices.length)
    if (next === undefined) return
    event.preventDefault()
    setActive(slices[next].key)
  }
  // The label box is sized in CSS from the overlay's own size (cqmin), so it needs no measuring.
  const hole = { '--pie-hole': `calc((100cqmin - ${2 * RIM}px) * ${0.85 * (ratio || 0.6)})` } as CSSProperties
  const overlay = (
    <div className="pointer-events-none absolute inset-0 grid place-items-center [container-type:size]">
      {centerLabel !== undefined && (
        <div style={hole} className="@container flex size-(--pie-hole) flex-col items-center justify-center text-center">{centerLabel}</div>
      )}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {current ? `${current.label}: ${formatValue(current.value)} (${formatPercent(current.share * 100)})` : ''}
      </p>
    </div>
  )

  return (
    <ChartFrame height={height} ariaLabel={ariaLabel} dataLength={slices.length} onKeyDown={onKeyDown}
      onBlur={() => setActive(null)} overlay={overlay}>
      <PieMarks slices={slices} ratio={ratio} padAngle={padAngle} activeKey={current?.key ?? null}
        setActive={setActive} onSelect={onSelect} />
    </ChartFrame>
  )
}

type MarksProps = Readonly<{
  slices: readonly Slice[]; ratio: number; padAngle: number; activeKey: string | null
  setActive: (key: string | null) => void; onSelect?: (key: string) => void
}>

function PieMarks({ slices, ratio, padAngle, activeKey, setActive, onSelect }: MarksProps) {
  const frame = useChartFrame()
  const printing = usePrinting()
  // Print and reduced motion draw final paths at once: nothing waits on an animation frame.
  const still = printing || !frame.animate
  const outer = Math.max(0, Math.min(frame.width, frame.height) / 2 - RIM)
  const geo: Geometry = { cx: frame.width / 2, cy: frame.height / 2, outer, inner: outer * ratio }
  const draw = (start: number, end: number, lift: number) => wedge(geo, padAngle, start, end, lift)
  const revealed = useRef(false)
  const hasSlices = slices.length > 0
  // Effects run children first, so slices mounted with the reveal still read false and sweep in.
  useEffect(() => {
    if (!frame.entered || !hasSlices) return
    revealed.current = true
    return () => { revealed.current = false }
  }, [frame.entered, hasSlices])

  const canSelect = (key: string | null) => onSelect !== undefined && slices.some((slice) => slice.key === key && slice.selectable !== false)
  // Every target under this <g> is an SVG element; one without data-slice reads as null.
  const keyAt = (event: PointerEvent<SVGGElement>) => (event.target instanceof SVGElement ? (event.target.dataset.slice ?? null) : null)
  // Hover is mouse only (a tap emulates it). The disc keyed '' holds the slice across gaps and the hole.
  const onPointerOver = (event: PointerEvent<SVGGElement>) => {
    const key = keyAt(event)
    if (event.pointerType === 'mouse' && key !== '') setActive(key)
  }
  // A click opens a slice. A tap shows it, and a second tap opens it, or clears it when it cannot open.
  const onPointerUp = (event: PointerEvent<SVGGElement>) => {
    const key = keyAt(event) || null
    const open = key !== null && canSelect(key)
    if (event.pointerType === 'mouse') {
      if (open && event.button === 0) onSelect?.(key)
      return
    }
    if (key !== activeKey) setActive(key)
    else if (open) onSelect?.(key)
    else setActive(null)
  }

  return (
    <g onPointerOver={onPointerOver} onPointerUp={onPointerUp}
      onPointerLeave={(event) => { if (event.pointerType === 'mouse') setActive(null) }}>
      <rect width={frame.width} height={frame.height} fill="transparent" />
      <circle cx={geo.cx} cy={geo.cy} r={outer + POP + GROW} fill="transparent" data-slice="" />
      {slices.map((slice, index) => (
        <PieSlice key={slice.key} slice={slice} draw={draw} delay={staggerDelay(index, slices.length)}
          active={slice.key === activeKey} dimmed={activeKey !== null && slice.key !== activeKey}
          pointer={canSelect(slice.key)} still={still} entered={frame.entered} revealed={revealed} />
      ))}
    </g>
  )
}

type SliceProps = Readonly<{
  slice: Slice; draw: (start: number, end: number, lift: number) => string; delay: number
  active: boolean; dimmed: boolean; pointer: boolean; still: boolean; entered: boolean; revealed: RefObject<boolean>
}>

/** One wedge. Its angles and lift are motion values, so animating never re-renders React. */
function PieSlice({ slice, draw, delay, active, dimmed, pointer, still, entered, revealed }: SliceProps) {
  const start = useMotionValue(slice.start)
  const end = useMotionValue(still ? slice.end : slice.start)
  const lift = useMotionValue(0)
  const d = useTransform(() => draw(start.get(), end.get(), lift.get()))

  useEffect(() => {
    if (still || !entered) return
    // The reveal opens each wedge from its own start, in sequence; later changes tween to the new split.
    const transition = revealed.current ? chartTransition('update', true) : chartTransition('arc', true, delay)
    const runs = [animateValue(start, slice.start, transition), animateValue(end, slice.end, transition)]
    return () => { for (const run of runs) run.stop() }
  }, [still, entered, slice.start, slice.end, delay, start, end, revealed])

  useEffect(() => {
    if (still) return
    const run = animateValue(lift, active ? 1 : 0, SPRING.control)
    return () => run.stop()
  }, [still, active, lift])

  const className = pointer ? 'cursor-pointer' : undefined
  if (still) return <path d={draw(slice.start, slice.end, active ? 1 : 0)} fill={slice.color} opacity={dimmed ? 0.5 : 1} className={className} data-slice={slice.key} />
  return (
    <motion.path d={d} fill={slice.color} className={className} data-slice={slice.key} initial={false}
      animate={{ opacity: dimmed ? 0.5 : 1 }} transition={chartTransition('hover', true)} />
  )
}

/** Clockwise angles from 12 o'clock for every positive, finite slice. */
function layoutSlices(data: readonly PieDatum[]): Slice[] {
  const positive = data.filter((datum) => Number.isFinite(datum.value) && datum.value > 0)
  const total = positive.reduce((sum, datum) => sum + datum.value, 0)
  let start = 0
  return positive.map((datum) => {
    const share = datum.value / total
    const slice = { ...datum, start, end: start + share * TAU, share }
    start = slice.end
    return slice
  })
}

/** The arc from `start` to `end`, lifted out along its bisector by `lift` (0 to 1). */
function wedge(geo: Geometry, padAngle: number, start: number, end: number, lift: number): string {
  const mid = (start + end) / 2
  // A lone full ring has no bisector to pop along, so it only grows.
  const pop = end - start < TAU - 1e-6 ? POP * lift : 0
  return arcPath({
    cx: geo.cx + pop * Math.sin(mid), cy: geo.cy - pop * Math.cos(mid), innerRadius: geo.inner,
    outerRadius: geo.outer + GROW * lift, startAngle: start, endAngle: end, padAngle,
  })
}

/**
 * The slice a key moves to from `from` (-1 when none is active), or undefined for keys left to the
 * page. Arrows wrap around the ring, a first Right landing on the first slice and a first Left on
 * the last; Home and End jump to the first and last slice.
 */
function sliceForKey(key: string, from: number, count: number): number | undefined {
  const step = STEPS[key]
  if (count === 0) return undefined
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  if (step === undefined) return undefined
  return from === -1 && step < 0 ? count - 1 : (from + step + count) % count
}
