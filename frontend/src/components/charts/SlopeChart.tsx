/**
 * Animated SVG slope chart: one line per item from its start-period value on the left axis to its end-period value
 * on the right, both on one value scale. Names (and start values, given room) sit left; end values and rank moves
 * sit right; crowded labels spread apart with a hairline back to their point. Once in view the lines draw left to
 * right in turn, and new data slides every mark to its new place by item key. Hover, a tap or the arrow keys bring
 * one item forward with a readout; the arrow keys also speak it through a polite live region.
 */

import { useEffect, useMemo, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { AnimatePresence, motion, type Transition } from 'motion/react'

import { formatCurrency } from '@/lib/formatters'

import ChartFrame from './ChartFrame'
import { useChartFrame } from './chartContext'
import { CHART_EASE, CHART_MOTION, chartTransition, staggerDelay } from './chartMotion'
import { linePath } from './paths'
import {
  RANK_GAP, describeItem, layoutSlope, moveText, pickPoint, rankWords, slopeHeight, slopeItems, stepIndex,
  type SlopeDatum, type SlopeDirection, type SlopeItem, type SlopeLayout, type SlopePoint,
} from './slopeLayout'

export type { SlopeDatum, SlopeDirection } from './slopeLayout'

/** Final positions (motion off); the entrance; slides, and quick draws for new items, after a data change. */
type Phase = 'still' | 'intro' | 'live'

/** Dot radius, the opacity of items behind the active one, and how near its point a label sits before it needs a leader. */
const [DOT, FADED, LEADER_MIN] = [3.5, 0.2, 2]
const [INSTANT, LEAVE] = [{ duration: 0 }, { duration: 0.2, ease: CHART_EASE }]
const POP = { type: 'spring', visualDuration: CHART_MOTION.hover, bounce: 0.4 } as const
// `chart-tooltip` is the print stylesheet's hook (overrides.css hides it on paper). Tailwind's translate composes with Motion's transform.
const LAYER = 'chart-tooltip pointer-events-none absolute left-1/2 z-20 w-max max-w-[min(280px,calc(100%_-_8px))] -translate-x-1/2'
const BOX = 'rounded-[12px] border border-[var(--chart-tooltip-border)] bg-[var(--chart-tooltip-bg)] px-3.5 py-3 text-xs leading-normal tabular-nums text-[color:var(--chart-text-primary)] shadow-[0_4px_8px_-4px_rgba(0,0,0,0.4),0_16px_32px_-12px_rgba(0,0,0,0.4)]'

/** Defaults: direction 'income', formatValue formatCurrency, and a height that grows with the item count. */
export interface SlopeChartProps {
  /** One line per entry, 3 to 10 reading best; `startLabel` and `endLabel` name the periods over the two axes. */
  readonly data: readonly SlopeDatum[]
  readonly startLabel: string
  readonly endLabel: string
  /** Which way is good news for the line colour; a line whose values read the same is muted. */
  readonly direction?: SlopeDirection
  /** Amounts on the labels, in the readout and in the live region. */
  readonly formatValue?: (value: number) => string
  readonly height?: number
  readonly mobileHeight?: number
  /** One-sentence description; the frame is announced as a single image. */
  readonly ariaLabel?: string
}

/** The item being read; `spoken` when the arrow keys picked it, so only keyboard inspection is announced. */
interface Reading { readonly key: string; readonly spoken: boolean }

/** Slope chart in its own measured frame; focus it and use the arrow keys, Home and End to read the items. */
export default function SlopeChart({
  data, startLabel, endLabel, direction = 'income', formatValue = formatCurrency, height, mobileHeight, ariaLabel,
}: SlopeChartProps) {
  const items = useMemo(() => slopeItems(data, direction, formatValue), [data, direction, formatValue])
  const [reading, setReading] = useState<Reading | null>(null)
  const current = items.find((item) => item.key === reading?.key) // a key the new data lacks reads as nothing
  // Hover and taps read silently and a second tap on the same item clears it; same state back skips the render.
  const read = (key: string | null, toggle: boolean) => setReading((now) => {
    if (key === null || (toggle && now?.key === key)) return null
    return now?.key === key && !now.spoken ? now : { key, spoken: false }
  })
  // Escape clears the reading first and otherwise bubbles, so a dialog around the chart can still take it.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = stepIndex(event.key, current ? items.indexOf(current) : -1, items.length)
    if (event.key === 'Escape' && current) {
      setReading(null)
      event.stopPropagation()
    } else if (next === null) return
    else setReading({ key: items[next].key, spoken: true })
    event.preventDefault()
  }
  const shared = { items, startLabel, endLabel, activeKey: current?.key ?? null }
  return (
    <div className="min-w-0">
      <ChartFrame height={height ?? slopeHeight(items.length, false)} mobileHeight={mobileHeight ?? slopeHeight(items.length, true)}
        ariaLabel={ariaLabel} dataLength={items.length} onKeyDown={onKeyDown} onBlur={() => setReading(null)}
        overlay={<SlopeReadout {...shared} />}>
        <SlopeMarks {...shared} read={read} />
      </ChartFrame>
      {/* Beside the frame, not in it: the frame's role="img" hides every descendant from assistive tech. */}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {current && reading?.spoken ? describeItem(current, startLabel, endLabel) : ''}
      </p>
    </div>
  )
}

type SharedProps = Readonly<{ items: readonly SlopeItem[]; startLabel: string; endLabel: string; activeKey: string | null }>

/** The layout at the frame's size; the marks and the readout each call it, so the two always agree. */
function useSlopeLayout({ items, startLabel, endLabel }: SharedProps): SlopeLayout {
  const { width, height, isMobile } = useChartFrame()
  return useMemo(() => layoutSlope(items, { width, height, mobile: isMobile }, startLabel, endLabel),
    [items, width, height, isMobile, startLabel, endLabel])
}

/** Both axes with their period names, then the items, the active one last, under one target reading the nearest item. */
function SlopeMarks({ read, ...shared }: SharedProps & Readonly<{ read: (key: string | null, toggle: boolean) => void }>) {
  const frame = useChartFrame()
  const layout = useSlopeLayout(shared)
  const count = layout.points.length
  const [introDone, setIntroDone] = useState(!frame.animate) // mounted without motion: no entrance to play later
  useEffect(() => {
    if (introDone || !frame.animate || !frame.entered || count === 0) return
    // The last line has drawn by its stagger delay plus one draw; anything mounted after that is new data.
    const timer = setTimeout(() => setIntroDone(true), (staggerDelay(count - 1, count) + CHART_MOTION.draw) * 1000)
    return () => clearTimeout(timer)
  }, [introDone, frame.animate, frame.entered, count])
  // Previous-render bookkeeping: a resize jumps every mark, as across the kit; a data change slides them.
  const box = `${frame.width}x${frame.height}`
  const [seen, setSeen] = useState({ box, items: shared.items, snap: true })
  if (seen.box !== box || seen.items !== shared.items) setSeen({ box, items: shared.items, snap: seen.box !== box })
  let phase: Phase = 'still'
  if (frame.animate) phase = introDone ? 'live' : 'intro'
  const move = seen.snap ? INSTANT : chartTransition('update', frame.animate)
  const [moving, opacity] = [phase !== 'still', phase !== 'intro' || frame.entered ? 1 : 0]
  const fade = { default: move, opacity: chartTransition('update', moving) }
  const [y1, y2] = [layout.top - layout.line / 2, layout.bottom + layout.line / 2]
  const axes = [{ id: 'start', x: layout.x0, header: layout.headers[0] }, { id: 'end', x: layout.x1, header: layout.headers[1] }]
  const active = layout.points.find((candidate) => candidate.key === shared.activeKey)
  const drawn = active ? [...layout.points.filter((candidate) => candidate !== active), active] : layout.points
  const keyAt = (event: PointerEvent<SVGRectElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return pickPoint(layout, event.clientX - rect.left, event.clientY - rect.top)?.key ?? null
  }
  return (
    <g fontSize={layout.font}>
      {axes.map(({ id, x, header }) => (
        <g key={id}>
          <motion.line initial={moving && { x1: x, x2: x, y1, y2, opacity: 0 }} animate={{ x1: x, x2: x, y1, y2, opacity }}
            transition={fade} className="stroke-(--chart-reference-line)" />
          <motion.g initial={moving && { x: header.x, opacity: 0 }} animate={{ x: header.x, opacity }} transition={fade}>
            <text textAnchor="middle" className="fill-muted-foreground font-medium">
              {header.lines.map((line) => <tspan key={line.text} x={0} y={line.y}>{line.text}</tspan>)}
            </text>
          </motion.g>
        </g>
      ))}
      <AnimatePresence>
        {drawn.map((item) => (
          <SlopeLine key={item.key} point={item} layout={layout} phase={phase} entered={frame.entered} move={move}
            delay={staggerDelay(layout.points.indexOf(item), count)} on={item === active} dimmed={active !== undefined && item !== active} />
        ))}
      </AnimatePresence>
      {/* One target over the whole frame: a hover or tap anywhere reads the nearest item, so no target is small. */}
      <rect width={frame.width} height={frame.height} fill="transparent"
        onPointerMove={(event) => { if (event.pointerType === 'mouse') read(keyAt(event), false) }}
        onPointerDown={(event) => { if (event.pointerType !== 'mouse') read(keyAt(event), true) }}
        onPointerLeave={(event) => { if (event.pointerType === 'mouse') read(null, false) }} />
    </g>
  )
}

type LineProps = Readonly<{
  point: SlopePoint; layout: SlopeLayout; phase: Phase; entered: boolean; move: Transition; delay: number; on: boolean; dimmed: boolean
}>

/** One item: its line, each end's leader and dot, and both labels, every mark sliding with the item's data. */
function SlopeLine({ point, layout, phase, entered, move, delay, on, dimmed }: LineProps) {
  const { x0, x1, lead } = layout
  const [moving, intro, opacity] = [phase !== 'still', phase === 'intro', phase !== 'intro' || entered ? 1 : 0]
  // The entrance draws each line in turn; a line that arrives with new data draws quickly, at once.
  const start = intro ? delay : 0
  const arrive = start + (intro ? CHART_MOTION.draw : CHART_MOTION.update) * 0.85
  const fade = (at: number) => ({ default: move, opacity: chartTransition('hover', moving, at) })
  const hover = chartTransition('hover', moving)
  const d = linePath([{ x: x0, y: point.y0 }, { x: x1, y: point.y1 }], 'linear')
  const r = on ? DOT + 1.5 : DOT
  const [left, right] = [{ x: x0 - lead, y: point.label0 }, { x: x1 + lead, y: point.label1 }]
  const ends = [
    { id: 'start', cx: x0, cy: point.y0, at: start, leader: { x1: left.x + 3, y1: left.y, x2: x0 - DOT - 2, y2: point.y0 } },
    { id: 'end', cx: x1, cy: point.y1, at: arrive, leader: { x1: right.x - 3, y1: right.y, x2: x1 + DOT + 2, y2: point.y1 } },
  ]
  return (
    <motion.g initial={false} animate={{ opacity: dimmed ? FADED : 1 }} transition={hover}
      exit={{ opacity: 0, transition: moving ? LEAVE : INSTANT }}>
      <motion.path initial={moving && { d, pathLength: 0, opacity: 0, strokeWidth: 2 }}
        animate={{ d, pathLength: opacity, opacity, strokeWidth: on ? 3 : 2 }} fill="none" stroke={point.color} strokeLinecap="round"
        transition={{ ...fade(start), pathLength: intro ? chartTransition('draw', true, delay) : chartTransition('update', moving), strokeWidth: hover }} />
      {ends.map(({ id, cx, cy, at, leader }) => (
        <g key={id}>
          <motion.line initial={moving && { ...leader, opacity: 0 }} transition={fade(at)} className="stroke-(--chart-reference-line-strong)"
            animate={{ ...leader, opacity: Math.abs(leader.y1 - cy) > LEADER_MIN ? opacity : 0 }} />
          <motion.circle initial={moving && { cx, cy, r, scale: 0 }} animate={{ cx, cy, r, scale: opacity }}
            transition={{ default: move, scale: moving ? { ...POP, delay: at } : INSTANT, r: hover }}
            fill={point.color} strokeWidth={1.5} className="stroke-card" />
        </g>
      ))}
      {/* The name, cut to its column, right-aligned before the start value when the frame has room for one. */}
      <motion.g initial={moving && { ...left, opacity: 0 }} animate={{ ...left, opacity }} transition={fade(start)}>
        <text x={-layout.nameEnd} dy="0.35em" textAnchor="end" className="fill-foreground font-medium">{point.name}</text>
        {layout.startValues && <text dy="0.35em" textAnchor="end" className="fill-muted-foreground font-mono">{point.startText}</text>}
      </motion.g>
      {/* The end value, then its rank move: a glyph for the eye and "+2" or "-1" as the text. */}
      <motion.g initial={moving && { ...right, opacity: 0 }} animate={{ ...right, opacity }} transition={fade(arrive)}>
        <text dy="0.35em" className="fill-foreground font-mono">
          {point.endText}
          {point.rank.move !== 0 && (
            <tspan dx={RANK_GAP} className="fill-muted-foreground">
              <tspan aria-hidden="true" fontSize="0.75em">{point.rank.move > 0 ? '▲' : '▼'}</tspan>
              {moveText(point.rank.move)}
            </tspan>
          )}
        </text>
      </motion.g>
    </motion.g>
  )
}

/**
 * The active item's full name, both values, change and ranks, pinned to the frame edge farther from the item so the
 * line being read stays clear. It is aria-hidden: the live region beside the frame speaks for it.
 */
function SlopeReadout(shared: SharedProps) {
  const frame = useChartFrame()
  const point = useSlopeLayout(shared).points.find((candidate) => candidate.key === shared.activeKey)
  const edge = point && point.label0 + point.label1 < frame.height ? 'bottom-1' : 'top-1'
  return (
    <AnimatePresence>
      {point && (
        <motion.div key={edge} aria-hidden="true" className={`${LAYER} ${edge} ${BOX}`} initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
          transition={frame.animate ? { duration: CHART_MOTION.hover, ease: CHART_EASE } : INSTANT}>
          <p className="flex min-w-0 items-baseline gap-2 font-medium text-foreground">
            <span className="size-2 shrink-0 rounded-sm" style={{ backgroundColor: point.color }} />
            <span className="break-words">{point.label}</span>
          </p>
          <p className="mt-1.5 font-mono text-sm font-semibold text-foreground">{point.startText} → {point.endText}</p>
          <p className="mt-1 flex flex-wrap gap-x-3 text-muted-foreground">
            <span className="font-mono">{point.change}</span>
            <span>Rank {rankWords(point.rank)}</span>
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
