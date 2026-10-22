/**
 * SankeyDiagram's value readout, drawn in the frame overlay: the hovered, tapped or arrowed-to node or
 * ribbon with its amount and share of the diagram's total, so a touch screen gets values for ribbons and
 * unlabelled nodes too. It sits above the mark (below it near the top edge), glides between marks and
 * fades out. The box is aria-hidden; arrow-key inspection is read out through a polite live region
 * portalled out of the frame, whose role="img" hides every descendant from assistive tech.
 */

import { useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useSpring } from 'motion/react'
import { ArrowRight } from 'lucide-react'

import { formatPercent } from '@/lib/formatters'

import { useChartFrame } from './chartContext'
import { CHART_EASE, CHART_MOTION } from './chartMotion'
import { FALLBACK, PAD, textSize, useSankeyModel, type SankeyFocus, type SankeyModel, type SankeyModelOptions } from './sankeyModel'

/** Space between the mark and the box, and the closest the box comes to a frame edge. */
const GAP = 10
const INSET = 4
const GLIDE = { visualDuration: CHART_MOTION.hover, bounce: 0.15 }
const LAYER = 'pointer-events-none absolute left-0 top-0 z-20 w-max max-w-[min(280px,calc(100%_-_8px))]'
const BOX = 'rounded-[12px] border border-[var(--chart-tooltip-border)] bg-[var(--chart-tooltip-bg)] px-3.5 py-3 text-xs leading-normal tabular-nums text-[color:var(--chart-text-primary)] shadow-[0_4px_8px_-4px_rgba(0,0,0,0.4),0_16px_32px_-12px_rgba(0,0,0,0.4)]'

export interface SankeyReadoutProps extends SankeyModelOptions {
  readonly focus: SankeyFocus | null
  /** Base of every share; defaults to the largest node. */
  readonly total?: number
  /** Names `total` after a share ("12.5% of gross income"); default "total". */
  readonly totalLabel?: string
}

interface Readout {
  readonly color: string
  readonly from: string
  readonly to?: string
  readonly value: string
  readonly share?: string
  readonly opens: boolean
  /** Frame px: the mark's centre, the top and bottom the box keeps clear of, and half its width. */
  readonly x: number
  readonly top: number
  readonly bottom: number
  readonly half: number
}

export default function SankeyReadout({ focus, total, totalLabel = 'total', ...options }: SankeyReadoutProps) {
  const frame = useChartFrame()
  const model = useSankeyModel(options)
  const layerRef = useRef<HTMLDivElement>(null)
  const liveRef = useRef<HTMLSpanElement>(null)
  const shown = useRef(false)
  const x = useSpring(0, GLIDE)
  const y = useSpring(0, GLIDE)
  const { formatValue } = options
  const readout = focus ? describe(model, focus, { formatValue, total, totalLabel, line: textSize(frame.isMobile).line }) : null

  // No dependency list: a new mark, a wider box or a resized frame can each move it; measured before paint.
  useLayoutEffect(() => {
    const layer = layerRef.current
    if (!readout || !layer) {
      shown.current = false
      return
    }
    const next = place(readout, layer.offsetWidth, layer.offsetHeight, frame.width, frame.height)
    if (shown.current && frame.animate) {
      x.set(next.x)
      y.set(next.y)
    } else {
      x.jump(next.x)
      y.jump(next.y)
    }
    shown.current = true
  })

  const announcement = readout ? speak(readout) : ''
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
          {readout && (
            <motion.div key="readout" className={BOX} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }} transition={fade}>
              <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 font-medium text-foreground">
                <span className="size-2 shrink-0 rounded-sm" style={{ backgroundColor: readout.color }} />
                <span className="break-words">{readout.from}</span>
                {readout.to !== undefined && (
                  <>
                    <ArrowRight className="size-3 shrink-0 text-muted-foreground" />
                    <span className="break-words">{readout.to}</span>
                  </>
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3">
                <span className="font-mono text-sm font-semibold text-foreground">{readout.value}</span>
                {readout.share && <span className="text-muted-foreground">{readout.share}</span>}
              </div>
              {readout.opens && <p className="mt-1.5 text-muted-foreground">Click or press Enter for the breakdown</p>}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
      {createPortal(<span ref={liveRef} aria-live="polite" aria-atomic="true" className="sr-only" />, document.body)}
    </>
  )
}

type Describe = Pick<SankeyReadoutProps, 'formatValue' | 'total'> & { readonly totalLabel: string; readonly line: number }

/** The focused mark's text and where it sits, or null when the current data has no such mark. */
function describe({ layout, labels }: SankeyModel, focus: SankeyFocus, { formatValue, total, totalLabel, line }: Describe): Readout | null {
  const nodes = new Map(layout.nodes.map((node) => [node.id, node]))
  const base = total ?? Math.max(0, ...layout.nodes.map((node) => node.value))
  const share = (value: number) => (base > 0 ? `${formatPercent((value / base) * 100)} of ${totalLabel}` : undefined)
  if (focus.kind === 'link') {
    const link = layout.links.find((candidate) => candidate.id === focus.id)
    const source = link && nodes.get(link.source)
    const target = link && nodes.get(link.target)
    if (!link || !source || !target) return null
    // The ribbon's centre line crosses its midpoint here; the box sits just above that.
    const mid = PAD + (link.y0 + link.y1) / 2
    return {
      color: link.color ?? source.color ?? FALLBACK, from: source.label, to: target.label, value: formatValue(link.value),
      share: share(link.value), opens: false, x: PAD + (link.x0 + link.x1) / 2, top: mid, bottom: mid, half: 0,
    }
  }
  const node = nodes.get(focus.id)
  if (!node) return null
  const label = labels.get(node.id)
  const amount = node.displayValue ?? node.value
  return {
    color: node.color ?? FALLBACK, from: node.label, value: formatValue(amount),
    share: node.detail ? `${node.detail} of ${totalLabel}` : share(amount), opens: node.selectable === true,
    // Clear of the label too, so the readout never covers the text it expands on.
    x: PAD + (node.x0 + node.x1) / 2, half: (node.x1 - node.x0) / 2,
    top: PAD + Math.min(node.y0, label?.y ?? node.y0), bottom: PAD + Math.max(node.y1, label ? label.y + label.rows * line : node.y1),
  }
}

/** Box origin above the mark, else below it, else (a mark taller than the frame allows) beside it at the top. */
function place(readout: Readout, width: number, height: number, frameWidth: number, frameHeight: number) {
  const maxX = frameWidth - width - INSET
  const maxY = frameHeight - height - INSET
  const centred = clamp(readout.x - width / 2, maxX)
  const above = readout.top - GAP - height
  if (above >= INSET) return { x: centred, y: above }
  const below = readout.bottom + GAP
  if (below <= maxY) return { x: centred, y: below }
  const right = readout.x + readout.half + GAP
  return { x: clamp(right <= maxX ? right : readout.x - readout.half - GAP - width, maxX), y: INSET }
}

function speak({ from, to, value, share, opens }: Readout): string {
  const name = to === undefined ? from : `${from} to ${to}`
  return `${name}: ${value}${share ? `, ${share}` : ''}${opens ? '. Press Enter for the breakdown' : ''}`
}

/** Keeps a box start between INSET and `max`; INSET wins when the box is wider than the room. */
function clamp(value: number, max: number): number {
  return Math.max(INSET, Math.min(value, max))
}
