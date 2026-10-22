/**
 * Grid lines for x/y charts, and TickLayer, the keyed tick list the grid and
 * both axes animate through. A data change glides each tick to its new place;
 * ticks the new scale adds start where the old scale had them and ticks it
 * drops leave toward where the new one puts them, so the axis morphs with the
 * marks. A resize jumps, as the marks do, so nothing trails the plot.
 */

import { useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'

import { useCartesian, useChartFrame } from './chartContext'
import { CHART_EASE, chartTransition, staggerDelay } from './chartMotion'
import type { CategoryScale, LinearScale } from './scales'

/** Entrance fade of grid lines, axis lines and tick labels, in seconds. */
export const ENTER_FADE = 0.4
/** Category lines closer together than this thin out to every Nth. */
const MIN_LINE_GAP = 24

/**
 * Lines at the value ticks show and lines at the category centres do not, in
 * either layout, as GRID_DEFAULTS had it; the flags override by direction.
 */
export interface GridProps {
  readonly hideHorizontal?: boolean
  readonly hideVertical?: boolean
  /** Value ticks to draw at; keep it equal to the ValueAxis tickCount (5, 4 on phones). */
  readonly tickCount?: number
}

/** Dashed guides (GRID_DEFAULTS' '2 5') that fade in with the chart and glide with its scale. */
export default function Grid({ hideHorizontal, hideVertical, tickCount }: GridProps) {
  const { plot, layout, value, category } = useCartesian()
  const { isMobile } = useChartFrame()
  const horizontal = layout === 'horizontal'
  const hideValues = (horizontal ? hideHorizontal : hideVertical) ?? false
  const hideCategories = (horizontal ? hideVertical : hideHorizontal) ?? true
  const across = <line x1={plot.x} x2={plot.x + plot.width} />
  const down = <line y1={plot.y} y2={plot.y + plot.height} />
  const values = value.ticks(tickCount ?? (isMobile ? 4 : 5))
  return (
    <g aria-hidden="true" strokeDasharray="2 5" className="stroke-(--chart-grid)">
      {!hideValues && (
        <TickLayer source={{ kind: 'value', scale: value, values }} along={horizontal ? 'y' : 'x'}>
          {() => (horizontal ? across : down)}
        </TickLayer>
      )}
      {!hideCategories && (
        <TickLayer source={{ kind: 'category', scale: category }} along={horizontal ? 'x' : 'y'} need={MIN_LINE_GAP}>
          {() => (horizontal ? down : across)}
        </TickLayer>
      )}
    </g>
  )
}

/** What a TickLayer draws: given values of a linear scale, or every category. */
export type TickSource =
  | { readonly kind: 'value'; readonly scale: LinearScale; readonly values: readonly number[] }
  | { readonly kind: 'category'; readonly scale: CategoryScale }

/**
 * 'auto' draws every Nth tick so each gets its room; 'preserveStartEnd' also keeps the
 * last; a number skips that many ticks between drawn ones (0 draws all), as Recharts did.
 */
export type TickInterval = 'auto' | 'preserveStartEnd' | number

export interface PlacedTick {
  /** Stable identity: the value, or the category key (suffixed when it repeats). */
  readonly id: string
  /** Pixel position along the axis. */
  readonly at: number
  /** The tick value, or the category's visible row index. */
  readonly datum: number
}

export interface TickLayerProps {
  readonly source: TickSource
  /** 'x' when the ticks run along a horizontal axis, 'y' along a vertical one. */
  readonly along: 'x' | 'y'
  /** Px a drawn tick needs along the axis; closer ticks thin out, value ticks keeping 0. */
  readonly need?: number
  /** Default 'auto'. */
  readonly interval?: TickInterval
  /** Px across the axis a tick slides in from on entrance; 0 for lines. */
  readonly slide?: number
  /** Stagger the fade-ins (labels) rather than fade every tick at once (lines). */
  readonly stagger?: boolean
  /** One tick's content, drawn at 0 on the `along` axis. */
  readonly children: (tick: PlacedTick) => ReactNode
}

/** Pixel position of a tick id on a scale; undefined when the scale has no such category. */
type Locate = (id: string) => number | undefined
/** One value's Motion transition; chartTransition() results fit. */
type Timing = { readonly duration: number; readonly ease?: typeof CHART_EASE; readonly delay?: number }

/** Keyed ticks that enter with the chart and follow its scale as one. */
export function TickLayer({ source, along, need = 0, interval = 'auto', slide = 0, stagger = false, children }: TickLayerProps) {
  const { animate, entered } = useChartFrame()
  const { domain, range, locate, ticks, spacing, phase } = placement(source)
  // The last scale, kept in state and updated during render (React's pattern for
  // previous values), so a tick a data change adds starts where it had that tick.
  // A change of range alone is a resize, which snaps instead of gliding.
  const [last, setLast] = useState({ domain, range, previous: locate, current: locate, snap: true })
  if (last.domain !== domain || last.range !== range) {
    setLast({ domain, range, previous: last.current, current: locate, snap: last.domain === domain })
  }
  const glide: Timing = chartTransition('update', animate)
  const move: Timing = last.snap ? { duration: 0 } : glide
  const fade = (delay: number): Timing => (animate ? { duration: ENTER_FADE, ease: CHART_EASE, delay } : { duration: 0 })
  const shown = thin(ticks.length, spacing, need, interval, phase).map((index) => ticks[index])
  return (
    // A leaving tick reads the new scale from `custom` (its own props are stale) and heads there.
    <AnimatePresence custom={locate}>
      {shown.map((tick, order) => {
        const enter = fade(stagger ? staggerDelay(order, shown.length) : 0)
        // `initial` is read once, at mount: before the chart enters a tick waits off to
        // the side; after, a tick a data change adds starts on the old scale.
        const from = last.snap ? tick.at : (last.previous(tick.id) ?? tick.at)
        const start = entered ? axes(along, from, 0) : axes(along, tick.at, slide)
        return (
          <motion.g
            key={tick.id}
            initial={animate && { ...start, opacity: 0 }}
            animate={{ ...axes(along, tick.at, entered ? 0 : slide), opacity: entered ? 1 : 0 }}
            transition={{ ...axes(along, move, enter), opacity: enter }}
            exit="exit"
            variants={{
              exit: (next: Locate) => ({
                ...axes(along, next(tick.id) ?? tick.at, 0),
                opacity: 0,
                transition: { ...axes(along, glide, fade(0)), opacity: fade(0) },
              }),
            }}
          >
            {children(tick)}
          </motion.g>
        )
      })}
    </AnimatePresence>
  )
}

/** Motion's x/y with `a` on the axis the ticks run along and `b` across it. */
function axes<T>(along: 'x' | 'y', a: T, b: T): { x: T; y: T } {
  return along === 'x' ? { x: a, y: b } : { x: b, y: a }
}

/** Every tick of a source with ids and pixels, the gap between neighbours, and an id lookup. */
function placement(source: TickSource) {
  if (source.kind === 'value') {
    const { scale, values } = source
    const [low, high] = [Math.min(...scale.range), Math.max(...scale.range)]
    // Clamped, so a tick entering from far off the old scale starts at the plot edge.
    const locate: Locate = (id) => Math.min(high, Math.max(low, scale(Number(id))))
    const ticks = values.map((tick) => ({ id: String(tick), at: scale(tick), datum: tick }))
    const spacing = ticks.length > 1 ? Math.abs(ticks[1].at - ticks[0].at) : 0
    const phase = Math.max(0, values.indexOf(0))
    return { domain: scale.domain.join(), range: scale.range.join(), locate, ticks, spacing, phase }
  }
  const { scale } = source
  // A repeated key gets an occurrence suffix, so every id is a unique React key.
  const seen = new Map<string, number>()
  const ids = scale.keys.map((key) => {
    const count = seen.get(key) ?? 0
    seen.set(key, count + 1)
    return count === 0 ? key : `${key}\u0001${count}`
  })
  const slots = new Map(ids.map((id, index) => [id, index] as const))
  const locate: Locate = (id) => {
    const index = slots.get(id)
    return index === undefined ? undefined : scale.center(index)
  }
  const ticks = ids.map((id, index) => ({ id, at: scale.center(index), datum: index }))
  return { domain: ids.join('\u0001'), range: `${scale.step},${scale.center(0)}`, locate, ticks, spacing: scale.step, phase: 0 }
}

/**
 * Indexes to draw: every Nth from `phase`, N giving each tick `need` px.
 * 'preserveStartEnd' swaps the last pick for the final tick when the two would
 * collide, so both ends keep a label.
 */
function thin(count: number, spacing: number, need: number, interval: TickInterval, phase: number): number[] {
  const fit = spacing > 0 ? Math.ceil(need / spacing - 1e-6) : 1
  const stride = Math.max(1, typeof interval === 'number' ? Math.floor(interval) + 1 : fit)
  const picked: number[] = []
  for (let index = phase % stride; index < count; index += stride) picked.push(index)
  const last = count - 1
  const clear = () => (last - (picked.at(-1) ?? 0)) * spacing >= need
  if (interval === 'preserveStartEnd' && last > 0 && picked.at(-1) !== last) {
    if (picked.length > 1 && !clear()) picked.pop()
    if (clear()) picked.push(last)
  }
  return picked
}
