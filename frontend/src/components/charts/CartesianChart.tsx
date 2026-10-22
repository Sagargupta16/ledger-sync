/**
 * Builds the category and value scales for x/y charts and hands them to the
 * marks (bars, lines, areas, axes, references) through CartesianContext.
 * Pointer and arrow-key inspection set one active row that the tooltip,
 * crosshair and mark emphasis all read.
 */

import { useCallback, useMemo, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'

import ChartFrame from './ChartFrame'
import {
  CartesianContext, useCartesian, useChartFrame,
  type CartesianState, type ChartRow, type Margin, type StackedValue,
} from './chartContext'
import { categoryScale, linearScale } from './scales'

export interface SeriesSpec {
  readonly key: string
  /** Series sharing a stackId sit on top of each other; signs stack separately. */
  readonly stackId?: string
  readonly axis?: 'left' | 'right'
}

type DomainBound = number | 'auto'

export interface CartesianChartProps {
  readonly data: ReadonlyArray<object>
  /** Row field holding the category (period, label). */
  readonly categoryKey: string
  /** Every plotted value series, so the value domain covers them all. */
  readonly series: readonly SeriesSpec[]
  readonly layout?: 'horizontal' | 'vertical'
  /** `band` for bars, `point` for lines and areas that reach the edges. */
  readonly categoryKind?: 'band' | 'point'
  readonly valueDomain?: readonly [DomainBound, DomainBound]
  readonly value2Domain?: readonly [DomainBound, DomainBound]
  /** Fixed value-axis ticks, replacing the generated 1/2/5 steps. */
  readonly valueTicks?: readonly number[]
  readonly value2Ticks?: readonly number[]
  /** Keep 0 inside the value domain (default true). */
  readonly includeZero?: boolean
  /** Values that must stay visible, such as reference lines. */
  readonly extraValues?: readonly number[]
  /** Plot-only zoom from useChartRange; tables and totals keep the full data. */
  readonly visibleRange?: { readonly startIndex: number; readonly endIndex: number }
  readonly margin?: Partial<Margin>
  readonly bandPadding?: number
  readonly height?: number | 'fill'
  readonly mobileHeight?: number
  readonly ariaLabel?: string
  /** HTML tooltip layer; reads the active row from context. */
  readonly tooltip?: ReactNode
  /**
   * Controlled active row (visible index), for charts that inspect together,
   * such as stacked panels sharing one period. Omit for internal state.
   */
  readonly activeIndex?: number | null
  readonly onActiveIndexChange?: (index: number | null) => void
  readonly children: ReactNode
}

export default function CartesianChart(props: CartesianChartProps) {
  const { data, height, mobileHeight, ariaLabel, onActiveIndexChange } = props
  const [ownIndex, setOwnIndex] = useState<number | null>(null)
  const controlled = props.activeIndex !== undefined
  const activeIndex = controlled ? (props.activeIndex ?? null) : ownIndex
  const setActiveIndex = useCallback((next: number | null | ((index: number | null) => number | null)) => {
    const value = typeof next === 'function' ? next(activeIndex) : next
    if (!controlled) setOwnIndex(value)
    onActiveIndexChange?.(value)
  }, [activeIndex, controlled, onActiveIndexChange])
  const count = visibleCount(data.length, props.visibleRange)
  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]
    if (event.key === 'Escape') setActiveIndex(null)
    if (step === undefined || count === 0) return
    event.preventDefault()
    setActiveIndex((index) => Math.max(0, Math.min(count - 1, index === null ? 0 : index + step)))
  }, [count, setActiveIndex])

  return (
    <ChartFrame
      height={height}
      mobileHeight={mobileHeight}
      ariaLabel={ariaLabel}
      dataLength={count}
      onKeyDown={onKeyDown}
      onBlur={() => setActiveIndex(null)}
      overlay={<CartesianScope {...props} activeIndex={activeIndex} setActiveIndex={setActiveIndex} content={props.tooltip} />}
    >
      <CartesianScope {...props} activeIndex={activeIndex} setActiveIndex={setActiveIndex} content={props.children} pointerLayer />
    </ChartFrame>
  )
}

function visibleCount(length: number, range?: CartesianChartProps['visibleRange']): number {
  if (!range) return length
  return Math.max(0, Math.min(length - 1, range.endIndex) - Math.max(0, range.startIndex) + 1)
}

interface ScopeProps extends CartesianChartProps {
  activeIndex: number | null
  setActiveIndex: (index: number | null) => void
  /** What this scope renders: the SVG marks, or the HTML tooltip layer. */
  content: ReactNode
  pointerLayer?: boolean
}

/** Provides the scales; rendered once inside the SVG (marks) and once in the overlay (tooltip). */
function CartesianScope({ pointerLayer = false, content, ...props }: ScopeProps) {
  const state = useCartesianState(props)
  return (
    <CartesianContext.Provider value={state}>
      {pointerLayer ? <PointerSurface>{content}</PointerSurface> : content}
    </CartesianContext.Provider>
  )
}

/**
 * Maps the pointer to the nearest row. Listeners sit on a group around the
 * marks, with a transparent plot rect behind them, so a bar under the finger
 * still receives its own click while every move inspects the row.
 */
function PointerSurface({ children }: { readonly children: ReactNode }) {
  const { plot, category, layout, setActiveIndex, rows } = useCartesian()
  const onPointer = (event: PointerEvent<SVGGElement>) => {
    if (rows.length === 0) return
    const box = event.currentTarget.ownerSVGElement?.getBoundingClientRect()
    if (!box) return
    const offset = layout === 'horizontal' ? event.clientX - box.left : event.clientY - box.top
    setActiveIndex(category.indexAt(offset))
  }
  return (
    <g
      onPointerMove={onPointer}
      onPointerDown={onPointer}
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse') setActiveIndex(null)
      }}
      // The browser took the gesture over for scrolling; a pinned readout would go stale.
      onPointerCancel={() => setActiveIndex(null)}
    >
      <rect x={plot.x} y={plot.y} width={Math.max(0, plot.width)} height={Math.max(0, plot.height)} fill="transparent" />
      {children}
    </g>
  )
}

const NO_VALUES: readonly number[] = []

/** A row's category as text; numbers (projection years) count, anything else is blank. */
function categoryText(value: unknown): string {
  if (typeof value === 'string') return value
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : ''
}

function useCartesianState({
  data, categoryKey, series, layout = 'horizontal', categoryKind = 'point',
  valueDomain, value2Domain, valueTicks, value2Ticks, includeZero = true, extraValues = NO_VALUES,
  visibleRange, margin: marginOverride, bandPadding, activeIndex, setActiveIndex,
}: Omit<ScopeProps, 'content'>): CartesianState {
  const frame = useChartFrame()
  // Scales rebuild only when data or size change; hovering a row reuses them.
  const base = useMemo(() => {
    const all = data as readonly ChartRow[]
    const start = visibleRange ? Math.max(0, visibleRange.startIndex) : 0
    const end = visibleRange ? Math.min(all.length - 1, visibleRange.endIndex) : all.length - 1
    const rows = all.slice(start, end + 1)
    const hasRight = series.some((spec) => spec.axis === 'right')
    const margin: Margin = {
      top: 16,
      right: hasRight ? (frame.isMobile ? 40 : 48) : frame.isMobile ? 8 : 16,
      bottom: 28,
      left: frame.isMobile ? 48 : 56,
      ...marginOverride,
    }
    const plot = {
      x: margin.left,
      y: margin.top,
      width: Math.max(0, frame.width - margin.left - margin.right),
      height: Math.max(0, frame.height - margin.top - margin.bottom),
    }
    const numberAt = (row: ChartRow, key: string) => {
      const value = row[key]
      return typeof value === 'number' && Number.isFinite(value) ? value : null
    }
    const stacks = stackSeries(rows, series, numberAt)
    const extent = (axis: 'left' | 'right') => {
      const values: number[] = axis === 'left' ? [...extraValues] : []
      for (const spec of series) {
        if ((spec.axis ?? 'left') !== axis) continue
        const stack = stacks.get(spec.key)
        if (stack) for (const segment of stack) values.push(segment.y0, segment.y1)
        else for (const row of rows) {
          const value = numberAt(row, spec.key)
          if (value !== null) values.push(value)
        }
      }
      if (includeZero) values.push(0)
      return values.length ? [Math.min(...values), Math.max(...values)] as const : [0, 1] as const
    }
    const valueRange = layout === 'horizontal'
      ? [plot.y + plot.height, plot.y] as const
      : [plot.x, plot.x + plot.width] as const
    const buildScale = (
      axis: 'left' | 'right',
      domain?: readonly [DomainBound, DomainBound],
      ticks?: readonly number[],
    ) => {
      const [autoMin, autoMax] = extent(axis)
      const min = domain?.[0] === undefined || domain[0] === 'auto' ? autoMin : domain[0]
      const max = domain?.[1] === undefined || domain[1] === 'auto' ? autoMax : domain[1]
      const fixed = typeof domain?.[0] === 'number' && typeof domain?.[1] === 'number'
      const scale = linearScale([min, max], valueRange, { nice: !fixed, tickCount: frame.isMobile ? 4 : 5 })
      // Explicit ticks (Pareto's 0/25/50/75/100) replace the generated ones.
      return ticks ? Object.assign(scale, { ticks: () => [...ticks] }) : scale
    }
    const value = buildScale('left', valueDomain, valueTicks)
    const value2 = hasRight ? buildScale('right', value2Domain, value2Ticks) : undefined
    const keys = rows.map((row) => categoryText(row[categoryKey]))
    const categoryRange = layout === 'horizontal'
      ? [plot.x, plot.x + plot.width] as const
      : [plot.y, plot.y + plot.height] as const
    const category = categoryScale(keys, categoryRange, {
      kind: categoryKind,
      ...(bandPadding === undefined ? {} : { paddingInner: bandPadding }),
    })
    const rightKeys = new Set(series.filter((spec) => spec.axis === 'right').map((spec) => spec.key))
    return {
      rows, rowOffset: start, margin, plot, layout, category, value, value2, categoryKey,
      label: (index: number) => keys[index] ?? '',
      numberAt,
      stacked: (key: string) => stacks.get(key),
      scaleFor: (key: string) => (rightKeys.has(key) && value2 ? value2 : value),
    }
  }, [data, categoryKey, series, layout, categoryKind, valueDomain, value2Domain, valueTicks,
    value2Ticks, includeZero, extraValues, visibleRange, marginOverride, bandPadding,
    frame.width, frame.height, frame.isMobile])
  return useMemo(() => ({
    ...base,
    activeIndex: activeIndex !== null && activeIndex < base.rows.length ? activeIndex : null,
    setActiveIndex,
  }), [base, activeIndex, setActiveIndex])
}

/** Diverging stack: positives build up from 0, negatives build down. */
function stackSeries(
  rows: readonly ChartRow[],
  series: readonly SeriesSpec[],
  numberAt: (row: ChartRow, key: string) => number | null,
): Map<string, StackedValue[]> {
  const stacks = new Map<string, StackedValue[]>()
  const groups = new Map<string, SeriesSpec[]>()
  for (const spec of series) {
    if (!spec.stackId) continue
    groups.set(spec.stackId, [...(groups.get(spec.stackId) ?? []), spec])
  }
  for (const group of groups.values()) {
    const up = rows.map(() => 0)
    const down = rows.map(() => 0)
    for (const spec of group) {
      stacks.set(spec.key, rows.map((row, index) => {
        const value = numberAt(row, spec.key) ?? 0
        const base = value >= 0 ? up[index] : down[index]
        if (value >= 0) up[index] = base + value
        else down[index] = base + value
        return { y0: base, y1: base + value }
      }))
    }
  }
  return stacks
}
