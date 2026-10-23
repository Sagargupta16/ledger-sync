/**
 * Animated SVG radar for fixed 0-100 profiles (the data-viz rule keeps radar for bounded scores).
 * Rings, spokes and wrapped axis labels are static; each series grows out of the centre once the
 * chart scrolls into view and morphs its vertices when a score changes. Hover, a tap, the arrow
 * keys or Home and End pick an axis, which then shows its scores beside the label.
 */

import { useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { motion } from 'motion/react'

import ChartFrame from './ChartFrame'
import { useChartFrame } from './chartContext'
import { chartTransition } from './chartMotion'
import { linePath, type Point } from './paths'
import { usePrinting } from './usePrinting'

const TAU = Math.PI * 2
/** Gap between the outer ring and a label, and the height of one label line. */
const LABEL_GAP = 10
const LINE = 12
/** Labels longer than this wrap at the space nearest their middle. */
const WRAP_AT = 12
const SERIES_STAGGER = 0.12
const STEPS: Partial<Record<string, number>> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }

export interface RadarAxis {
  readonly key: string
  readonly label: string
}

export interface RadarSeries {
  readonly key: string
  readonly label: string
  readonly color: string
  /** Score per axis key, clamped to 0..max; a missing score plots at 0. */
  readonly values: Readonly<Record<string, number>>
}

export interface RadarChartProps {
  readonly axes: readonly RadarAxis[]
  readonly series: readonly RadarSeries[]
  /** Score at the outer ring (default 100). */
  readonly max?: number
  /** Guide rings (default 4). */
  readonly rings?: number
  /** Print each ring's score in the first gap between spokes. */
  readonly ringLabels?: boolean
  readonly dotRadius?: number
  readonly height?: number | 'fill'
  readonly ariaLabel?: string
}

type MarksProps = Required<Omit<RadarChartProps, 'height' | 'ariaLabel'>> & Readonly<{
  active: number | null
  setActive: (index: number | null) => void
}>

/** Radar in its own measured frame; focus it and step through the axes with the arrow keys, Home and End. */
export default function RadarChart({
  axes, series, max = 100, rings = 4, ringLabels = false, dotRadius = 3, height = 224, ariaLabel,
}: RadarChartProps) {
  const [active, setActive] = useState<number | null>(null)
  const count = axes.length
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') setActive(null)
    const next = axisForKey(event.key, active, count)
    if (next === undefined) return
    event.preventDefault()
    setActive(next)
  }

  return (
    <ChartFrame height={height} ariaLabel={ariaLabel} dataLength={count * series.length} onKeyDown={onKeyDown}
      onBlur={() => setActive(null)}>
      <RadarMarks axes={axes} series={series} max={max > 0 ? max : 100} rings={Math.max(1, Math.round(rings))}
        ringLabels={ringLabels} dotRadius={dotRadius} active={active !== null && active < count ? active : null}
        setActive={setActive} />
    </ChartFrame>
  )
}

function RadarMarks({ axes, series, max, rings, ringLabels, dotRadius, active, setActive }: MarksProps) {
  const frame = useChartFrame()
  const printing = usePrinting()
  // Print and reduced motion draw the final shapes at once: nothing waits on an animation frame.
  const still = printing || !frame.animate
  const count = axes.length
  const font = frame.isMobile ? 10 : 11
  const cx = frame.width / 2
  const cy = frame.height / 2
  // Room for two label lines above and below the rings, and for a label's width either side.
  const radius = Math.min(cx - (frame.isMobile ? 64 : 84), cy - LABEL_GAP - 2 * LINE)
  if (count < 3 || radius <= 0) return null

  const turn = (index: number) => (index / count) * TAU
  const at = (index: number, r: number): Point => ({ x: cx + r * Math.sin(turn(index)), y: cy - r * Math.cos(turn(index)) })
  const ringRadii = Array.from({ length: rings }, (_, index) => (radius * (index + 1)) / rings)
  const score = (item: RadarSeries, key: string) => {
    const value = item.values[key]
    return Number.isFinite(value) ? Math.max(0, Math.min(max, value)) : 0
  }
  // Series live in score space (100 = the outer ring), so a resize rescales them at once and only a
  // score change animates.
  const scorePoint = (key: string, index: number, value: number) => ({
    key, x: (100 * value * Math.sin(turn(index))) / max, y: (-100 * value * Math.cos(turn(index))) / max,
  })
  const onPointer = (event: PointerEvent<SVGRectElement>) => {
    const box = event.currentTarget.ownerSVGElement?.getBoundingClientRect()
    if (!box) return
    const angle = Math.atan2(event.clientX - box.left - cx, cy - (event.clientY - box.top))
    setActive(Math.round((angle + TAU) / (TAU / count)) % count)
  }

  return (
    <g>
      {ringRadii.map((r) => (
        <path key={r} d={`${linePath(axes.map((_, index) => at(index, r)), 'linear')}Z`} fill="none" stroke="var(--chart-grid)" />
      ))}
      {axes.map((axis, index) => {
        const tip = at(index, radius)
        const stroke = index === active ? 'var(--chart-reference-line)' : 'var(--chart-grid)'
        return <line key={axis.key} x1={cx} y1={cy} x2={tip.x} y2={tip.y} stroke={stroke} />
      })}
      {ringLabels && ringRadii.map((r, index) => (
        <text key={r} x={cx + r * Math.sin(Math.PI / count) + 3} y={cy - r * Math.cos(Math.PI / count)} dy="0.35em"
          fontSize={font - 1} fill="var(--chart-axis-color)">
          {formatScore((max * (index + 1)) / rings)}
        </text>
      ))}
      <g transform={`translate(${cx} ${cy}) scale(${radius / 100})`}>
        {series.map((item, index) => (
          <RadarShape key={item.key} color={item.color} active={active} delay={index * SERIES_STAGGER}
            points={axes.map((axis, axisIndex) => scorePoint(axis.key, axisIndex, score(item, axis.key)))}
            dotRadius={(dotRadius * 100) / radius} still={still} entered={frame.entered} />
        ))}
      </g>
      {axes.map((axis, index) => {
        const anchor = at(index, radius + LABEL_GAP)
        const lines = wrapLabel(axis.label)
        const scores = index === active && series.map((item) => (
          <tspan key={item.key} fill={item.color} fontWeight={600}>&nbsp;{formatScore(score(item, axis.key))}</tspan>
        ))
        return (
          <text key={axis.key} x={anchor.x} y={anchor.y + labelShift(Math.cos(turn(index)), lines.length, font)}
            textAnchor={labelAnchor(Math.sin(turn(index)))} fontSize={font} fill="var(--chart-axis-color)">
            {lines.map((line, row) => (
              <tspan key={line} x={anchor.x} dy={row === 0 ? 0 : LINE}>{line}{row === lines.length - 1 && scores}</tspan>
            ))}
          </text>
        )
      })}
      <rect width={frame.width} height={frame.height} fill="transparent" onPointerMove={onPointer}
        onPointerDown={onPointer} onPointerLeave={(event) => { if (event.pointerType === 'mouse') setActive(null) }} />
    </g>
  )
}

type ShapeProps = Readonly<{
  color: string; points: readonly (Point & { readonly key: string })[]; active: number | null
  dotRadius: number; delay: number; still: boolean; entered: boolean
}>

/** One series: grows out of the centre on entrance, then its outline and dots morph to new scores. */
function RadarShape({ color, points, active, dotRadius, delay, still, entered }: ShapeProps) {
  const morph = chartTransition('update', !still)
  const body = (
    <>
      <motion.path initial={false} animate={{ d: `${linePath(points, 'linear')}Z` }} transition={morph}
        fill={color} fillOpacity={0.18} stroke={color} strokeWidth={2} strokeLinejoin="round"
        vectorEffect="non-scaling-stroke" />
      {points.map((point, index) => (
        <motion.circle key={point.key} initial={false} fill={color} stroke="var(--color-card)" strokeWidth={1.5}
          vectorEffect="non-scaling-stroke" transition={{ ...morph, r: chartTransition('hover', !still) }}
          animate={{ cx: point.x, cy: point.y, r: index === active ? dotRadius * 1.5 : dotRadius }} />
      ))}
    </>
  )
  if (still) return <g>{body}</g>
  // The parent group sits on the centre, so scaling about 0,0 grows the series out of the middle.
  return (
    <motion.g style={{ originX: 0, originY: 0, transformBox: 'view-box' }} initial={{ scale: 0 }}
      animate={{ scale: entered ? 1 : 0 }} transition={chartTransition('arc', true, delay)}>
      {body}
    </motion.g>
  )
}

function labelAnchor(sin: number): 'start' | 'middle' | 'end' {
  if (Math.abs(sin) < 0.3) return 'middle'
  return sin > 0 ? 'start' : 'end'
}

/** Baseline offset of a label's first line: upper labels grow upward, lower ones down, side ones centre. */
function labelShift(cos: number, lines: number, font: number): number {
  if (cos > 0.3) return -(lines - 1) * LINE - 2
  if (cos < -0.3) return font * 0.8
  return font * 0.35 - ((lines - 1) * LINE) / 2
}

/** One line, or two split at the space nearest the middle. */
function wrapLabel(label: string): readonly string[] {
  if (label.length <= WRAP_AT) return [label]
  let cut = -1
  for (let index = 0; index < label.length; index++) {
    if (label[index] === ' ' && Math.abs(index - label.length / 2) < Math.abs(cut - label.length / 2)) cut = index
  }
  return cut === -1 ? [label] : [label.slice(0, cut), label.slice(cut + 1)]
}

function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

/**
 * The axis a key picks, or undefined for keys left to the page. Arrows wrap at both ends; from
 * nothing picked, Right starts at the first axis and Left at the last. Home and End jump to the
 * first and last axis.
 */
function axisForKey(key: string, index: number | null, count: number): number | undefined {
  const step = STEPS[key]
  if (count === 0) return undefined
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  if (step === undefined) return undefined
  return index === null && step < 0 ? count - 1 : ((index ?? -1) + step + count) % count
}
