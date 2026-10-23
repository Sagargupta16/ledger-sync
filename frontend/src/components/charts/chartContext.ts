import { createContext, useContext } from 'react'

import type { CategoryScale, LinearScale } from './scales'

export type ChartRow = Record<string, unknown>

/** What every mark needs from the frame: its size and whether to animate. */
export interface FrameState {
  width: number
  height: number
  /** Motion is on and the series is small enough to animate. */
  animate: boolean
  /** The chart has scrolled into view (or never waits: motion off, print, tests). */
  entered: boolean
  isMobile: boolean
  theme: 'dark' | 'light'
  /** DOM-safe unique id for gradient, clip and mask ids. */
  chartId: string
}

export const FrameContext = createContext<FrameState | null>(null)

export function useChartFrame(): FrameState {
  const frame = useContext(FrameContext)
  if (!frame) throw new Error('Chart marks must render inside a ChartFrame')
  return frame
}

export interface Margin {
  top: number
  right: number
  bottom: number
  left: number
}

export interface PlotBox {
  x: number
  y: number
  width: number
  height: number
}

export interface StackedValue {
  /** Value at the bottom of this series' segment. */
  y0: number
  /** Value at the top of this series' segment. */
  y1: number
}

/**
 * Scales and data for marks on x/y axes. `horizontal` puts categories along
 * x (time series, column bars); `vertical` puts them down y (ranking bars).
 */
export interface CartesianState {
  /** Visible rows after the plot-only range zoom. */
  rows: readonly ChartRow[]
  /** Index of `rows[0]` in the full data, for range-aware callers. */
  rowOffset: number
  margin: Margin
  plot: PlotBox
  layout: 'horizontal' | 'vertical'
  /** Spans the plot width (horizontal) or height (vertical), in absolute px. */
  category: CategoryScale
  /** Spans the plot height bottom-up (horizontal) or width left-right (vertical). */
  value: LinearScale
  /** Second value axis for series declared `axis: 'right'`. */
  value2?: LinearScale
  categoryKey: string
  /** Category label of visible row `index`. */
  label: (index: number) => string
  /** A finite number at `row[key]`, or null for gaps. */
  numberAt: (row: ChartRow, key: string) => number | null
  /** Per-row segment of a stacked series, or undefined when it is not stacked. */
  stacked: (seriesKey: string) => readonly StackedValue[] | undefined
  /** The value scale a series is drawn on. */
  scaleFor: (seriesKey: string) => LinearScale
  /** Hovered or keyboard-focused visible row. */
  activeIndex: number | null
  setActiveIndex: (index: number | null) => void
}

export const CartesianContext = createContext<CartesianState | null>(null)

export function useCartesian(): CartesianState {
  const state = useContext(CartesianContext)
  if (!state) throw new Error('Cartesian marks must render inside a CartesianChart')
  return state
}
