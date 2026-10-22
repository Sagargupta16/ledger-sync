/**
 * HTML tooltip for CartesianChart's `tooltip` slot. It reads the active row from
 * context and keeps the ChartTooltipContent look: a heading, colour-keyed series
 * rows and right-aligned tabular values. The box rises in, glides between
 * categories on a short spring and fades out. On phones it pins to the top of the
 * frame so the finger never covers it. The box is aria-hidden; arrow-key
 * inspection is read out through a polite live region instead.
 */

import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useSpring } from 'motion/react'

import { formatChartDate } from '@/lib/chartDateLabels'
import { formatCurrency } from '@/lib/formatters'

import { useCartesian, useChartFrame, type CartesianState, type ChartRow, type FrameState } from './chartContext'
import { CHART_EASE, CHART_MOTION } from './chartMotion'

/** One tooltip row: a plotted series and how its value reads. */
export interface TooltipSeries {
  readonly key: string
  readonly label: string
  /** Swatch colour; pass the colour the series is drawn in. */
  readonly color: string
  /** Overrides `formatValue` for this series. */
  readonly format?: (value: number, row: ChartRow) => string
}

/** Pass as `<CartesianChart tooltip={<CartesianTooltip ... />}>`; context supplies the active row. */
export interface CartesianTooltipProps {
  /** Rows in display order; the live region reads these even when `render` draws the box. */
  readonly series: readonly TooltipSeries[]
  /** Heading from the raw category label (default formatChartDate). */
  readonly formatLabel?: (categoryLabel: string, row: ChartRow) => string
  /** Formatter for series without their own `format` (default formatCurrency). */
  readonly formatValue?: (value: number) => string
  /** Replaces the heading and rows; `index` is the row's position in the chart's full `data`. */
  readonly render?: (row: ChartRow, index: number) => ReactNode
  /** Extra block under the rows, such as a total; also shown with `render`. */
  readonly footer?: (row: ChartRow) => ReactNode
  /** Leave out series whose value is exactly 0. */
  readonly hideZero?: boolean
}

interface Entry {
  readonly key: string
  readonly label: string
  readonly color: string
  readonly text: string
}

/** Space between the active column and the box. */
const GAP = 12
/** Closest the box comes to a frame edge; LAYER's max-width leaves 2 x INSET free. */
const INSET = 4
/** Same spring as Crosshair, so the box and the cursor travel together. */
const GLIDE = { visualDuration: CHART_MOTION.hover, bounce: 0.15 }
// `chart-tooltip` is the print stylesheet's hook (overrides.css hides it on paper).
const LAYER = 'chart-tooltip pointer-events-none absolute left-0 top-0 z-20 w-max max-w-[min(320px,calc(100%_-_8px))]'
const BOX = 'rounded-[12px] border border-[var(--chart-tooltip-border)] bg-[var(--chart-tooltip-bg)] px-3.5 py-3 text-xs leading-normal tabular-nums text-[color:var(--chart-text-primary)] shadow-[0_4px_8px_-4px_rgba(0,0,0,0.4),0_16px_32px_-12px_rgba(0,0,0,0.4)]'
const DIVIDER = 'border-border/60 text-xs text-muted-foreground'

/** The active row's values: beside the active category on desktop, pinned above the plot on phones. */
export default function CartesianTooltip({
  series, formatLabel = formatChartDate, formatValue = formatCurrency, render, footer, hideZero = false,
}: CartesianTooltipProps) {
  const frame = useChartFrame()
  const chart = useCartesian()
  const layerRef = useRef<HTMLDivElement>(null)
  const liveRef = useRef<HTMLSpanElement>(null)
  const shown = useRef(false)
  const x = useSpring(0, GLIDE)
  const y = useSpring(0, GLIDE)

  const { activeIndex, numberAt } = chart
  const row = activeIndex === null ? undefined : chart.rows[activeIndex]
  const entries: Entry[] = row === undefined ? [] : series.flatMap((spec) => {
    const value = numberAt(row, spec.key)
    if (value === null || (hideZero && value === 0)) return []
    return [{ key: spec.key, label: spec.label, color: spec.color, text: spec.format?.(value, row) ?? formatValue(value) }]
  })
  let content: ReactNode = null
  let announcement = ''
  if (row !== undefined && activeIndex !== null && (render || entries.length > 0)) {
    const heading = formatLabel(chart.label(activeIndex), row)
    const values = entries.map((entry) => `${entry.label} ${entry.text}`).join(', ')
    announcement = [heading, values].filter(Boolean).join(': ')
    content = (
      <>
        {render ? render(row, chart.rowOffset + activeIndex) : <TooltipRows heading={heading} entries={entries} />}
        {footer && <div className={`mt-2.5 border-t pt-2 ${DIVIDER}`}>{footer(row)}</div>}
      </>
    )
  }
  const visible = content !== null

  // No dependency list: a new row, a wider box or a resized frame can each move it.
  // Measuring here, before paint, means the box never shows in the wrong place.
  useLayoutEffect(() => {
    const layer = layerRef.current
    if (!visible || activeIndex === null || !layer) {
      shown.current = false
      return
    }
    const next = placeTooltip(chart, frame, activeIndex, layer.offsetWidth, layer.offsetHeight)
    if (shown.current && frame.animate) {
      x.set(next.x)
      y.set(next.y)
    } else {
      x.jump(next.x)
      y.jump(next.y)
    }
    shown.current = true
  })

  // Speaks only while the frame itself has focus, which is arrow-key inspection.
  useEffect(() => {
    const live = liveRef.current
    const frameElement = layerRef.current?.closest('[tabindex]')
    if (live) live.textContent = frameElement && frameElement === document.activeElement ? announcement : ''
  }, [announcement])

  const fade = frame.animate ? { duration: CHART_MOTION.hover, ease: CHART_EASE } : { duration: 0 }
  return (
    <>
      <motion.div ref={layerRef} aria-hidden="true" className={LAYER} style={{ x, y }}>
        <AnimatePresence>
          {visible && (
            <motion.div
              key="tooltip"
              className={BOX}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={fade}
            >
              {content}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
      {/* Portalled out of the frame: its role="img" hides every descendant from assistive tech. */}
      {createPortal(<span ref={liveRef} aria-live="polite" aria-atomic="true" className="sr-only" />, document.body)}
    </>
  )
}

/** Heading and colour-keyed rows, laid out as ChartTooltipContent draws them. */
function TooltipRows({ heading, entries }: Readonly<{ heading: string; entries: readonly Entry[] }>) {
  return (
    <>
      {heading !== '' && <div className={`mb-2 border-b pb-2 font-medium ${DIVIDER}`}>{heading}</div>}
      <div className="space-y-2.5">
        {entries.map((entry) => (
          <div key={entry.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-5 gap-y-0.5">
            <span className="flex min-w-0 items-baseline gap-2 text-xs text-muted-foreground">
              <span className="size-2 shrink-0 rounded-sm" style={{ backgroundColor: entry.color }} />
              <span className="break-words">{entry.label}</span>
            </span>
            <span className="whitespace-nowrap text-right font-mono text-xs font-semibold tabular-nums text-foreground">
              {entry.text}
            </span>
          </div>
        ))}
      </div>
    </>
  )
}

/** Box origin inside the frame, kept INSET clear of every edge it can be. */
function placeTooltip(chart: CartesianState, frame: FrameState, index: number, width: number, height: number) {
  const { category, plot, layout } = chart
  const center = category.center(index)
  // Bars clear their whole slot; a point scale's column is the hairline itself.
  const reach = GAP + (category.bandwidth > 0 ? category.step / 2 : 0)
  const maxX = frame.width - width - INSET
  const maxY = frame.height - height - INSET
  if (layout === 'vertical') {
    // Rows run down the frame: below the row, or above it on phones where the hand sits below.
    return { x: clamp(plot.x + plot.width - width, maxX), y: beside(center, reach, height, maxY, !frame.isMobile) }
  }
  if (frame.isMobile) return { x: clamp(center - width / 2, maxX), y: INSET }
  return { x: beside(center, reach, width, maxX, true), y: clamp(plot.y, maxY) }
}

/** Start of a box `reach` past `anchor`, or before it when the preferred side would cross an edge. */
function beside(anchor: number, reach: number, size: number, max: number, preferAfter: boolean): number {
  const after = anchor + reach
  const before = anchor - reach - size
  const fitsAfter = after <= max
  const fitsBefore = before >= INSET
  const useAfter = preferAfter ? fitsAfter || !fitsBefore : fitsAfter && !fitsBefore
  return clamp(useAfter ? after : before, max)
}

/** Keeps a box start between INSET and `max`; INSET wins when the box is wider than the room. */
function clamp(value: number, max: number): number {
  return Math.max(INSET, Math.min(value, max))
}
