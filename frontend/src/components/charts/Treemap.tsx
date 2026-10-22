/**
 * Zoomable squarified treemap for the chart kit: one tile per category, sized by its value and tinted in
 * its colour. A click, a second tap or Enter on a category zooms into it in one motion, its subcategory
 * tiles opening inside as it grows to fill the plot; the breadcrumb above, Escape or Backspace zooms back
 * out. Arrow keys, Home and End walk the tiles of the current level, and a polite live region beside the
 * frame reads out the tile they land on.
 */

import { useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { formatCurrency } from '@/lib/formatters'

import ChartFrame from './ChartFrame'
import TreemapMarks from './TreemapMarks'
import { rankByValue, type TreemapNodeInput } from './treemapLayout'
import { canOpen, describeTile, plural, shareOf, type TreemapLevel, type TreemapNode } from './treemapModel'

export type { TreemapNode } from './treemapModel'

const STEP_KEYS: Partial<Record<string, number>> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }
const CONTROL = 'inline-flex min-h-11 shrink-0 items-center gap-1 rounded-md transition-colors hover:bg-[var(--overlay-2)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** Defaults: formatValue formatCurrency, rootLabel 'All', height 380 and mobileHeight 320. */
export interface TreemapProps {
  /** Categories with one level of children. Keep it memoized: a new array re-lays the tiles out. */
  readonly nodes: readonly TreemapNode[]
  readonly ariaLabel: string
  readonly formatValue?: (value: number) => string
  /** Names the top level in the breadcrumb, such as "All expenses". */
  readonly rootLabel?: string
  /** Opens this category on mount and whenever the prop changes, as a deep link does. */
  readonly zoomTo?: string | null
  readonly height?: number
  readonly mobileHeight?: number
}

/** A treemap in its own ChartFrame, with the breadcrumb and a readout of the active tile above the plot. */
export default function Treemap({
  nodes, ariaLabel, formatValue = formatCurrency, rootLabel = 'All', zoomTo = null, height = 380, mobileHeight = 320,
}: TreemapProps) {
  const [zoomId, setZoomId] = useState(zoomTo)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  // A new deep link opens its category, as a fresh visit would.
  const [linked, setLinked] = useState(zoomTo)
  if (linked !== zoomTo) {
    setLinked(zoomTo)
    setZoomId(zoomTo)
    setSelectedId(null)
    setHoveredId(null)
  }
  const wrapper = useRef<HTMLDivElement>(null)

  const categories = rankByValue(nodes)
  const total = categories.reduce((sum, node) => sum + node.value, 0)
  const top: TreemapLevel = { base: total, parent: null }
  // A category gone from new data, or with nothing inside, leaves the top level showing.
  const open = categories.find((node) => node.id === zoomId && canOpen(node)) ?? null
  const level: readonly TreemapNodeInput[] = open ? rankByValue(open.children ?? []) : categories
  const scope: TreemapLevel = open ? { base: open.value, parent: open.label } : top
  const inLevel = (id: string | null) => level.find((node) => node.id === id)
  const category = (id: string | undefined) => (open ? undefined : categories.find((node) => node.id === id))
  const shown = inLevel(hoveredId) ?? inLevel(selectedId)
  // The Open control acts on a tapped or arrowed-to category, while the readout shows that one.
  const pinned = shown !== undefined && shown.id === selectedId ? category(shown.id) : undefined
  const openTarget = pinned && canOpen(pinned) ? pinned : undefined

  const say = (node: TreemapNodeInput, where: TreemapLevel) => {
    const hint = where.parent === null && canOpen(node) ? '. Press Enter to open it' : ''
    return `${describeTile(node, where, formatValue)}${hint}`
  }
  const enter = (node: TreemapNode, fromKeys: boolean) => {
    const children = rankByValue(node.children ?? [])
    setZoomId(node.id)
    setHoveredId(null)
    setSelectedId(fromKeys ? children[0].id : null)
    const first = fromKeys ? ` ${say(children[0], { base: node.value, parent: node.label })}` : ''
    setAnnouncement(`${node.label}: ${plural(children.length, 'subcategory', 'subcategories')}, ${formatValue(node.value)}.${first}`)
  }
  const leave = (fromKeys: boolean) => {
    if (!open) return
    setZoomId(null)
    setHoveredId(null)
    setSelectedId(fromKeys ? open.id : null)
    const back = fromKeys ? ` ${say(open, top)}` : ''
    setAnnouncement(`${rootLabel}: ${plural(categories.length, 'category', 'categories')}, ${formatValue(total)}.${back}`)
  }
  // The latest input wins: an arrow key takes over from a mouse resting on another tile.
  const select = (node: TreemapNodeInput) => {
    setSelectedId(node.id)
    setHoveredId(null)
    setAnnouncement(say(node, scope))
  }

  // Escape and Backspace zoom out, and Escape otherwise clears the selection; unhandled keys bubble.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = level.findIndex((node) => node.id === selectedId)
    const current = index >= 0 ? level[index] : undefined
    const step = STEP_KEYS[event.key]
    if ((event.key === 'Escape' || event.key === 'Backspace') && open) {
      leave(true)
      event.stopPropagation()
    } else if (event.key === 'Escape' && current) {
      setSelectedId(null)
      setAnnouncement('')
      event.stopPropagation()
    } else if ((event.key === 'Enter' || event.key === ' ') && current) {
      const target = category(current.id)
      if (target && canOpen(target)) enter(target, true)
    } else if ((event.key === 'Home' || event.key === 'End') && level.length > 0) {
      select(level[event.key === 'Home' ? 0 : level.length - 1])
    } else if (step !== undefined && level.length > 0) {
      select(level[nextIndex(index, step, level.length)])
    } else return
    event.preventDefault()
  }

  // A click opens a category. A tap reads a tile; a second tap opens it, or clears it when nothing is inside.
  const press = (id: string, pointerType: string, button: number) => {
    const target = category(id)
    const openable = target !== undefined && canOpen(target)
    if (pointerType === 'mouse') {
      if (button !== 0) return
      if (openable) enter(target, false)
      else setSelectedId((current) => (current === id ? null : id))
      return
    }
    if (selectedId !== id) setSelectedId(id)
    else if (openable) enter(target, false)
    else setSelectedId(null)
  }

  // Both buttons unmount as the view changes, so focus moves to the frame to arrow on from there. Pressed
  // from the keyboard (click detail 0), they also carry the selection into the next level.
  const focusFrame = () => wrapper.current?.querySelector<HTMLElement>('.chart-frame')?.focus({ preventScroll: true })
  const onBack = (event: MouseEvent<HTMLButtonElement>) => {
    focusFrame()
    leave(event.detail === 0)
  }
  const onOpen = (event: MouseEvent<HTMLButtonElement>) => {
    if (!openTarget) return
    focusFrame()
    enter(openTarget, event.detail === 0)
  }

  const [one, many] = open ? ['subcategory', 'subcategories'] : ['category', 'categories']
  const dot = open?.color ?? category(shown?.id)?.color
  const dataLength = nodes.reduce((sum, node) => sum + 1 + (node.children?.length ?? 0), 0)
  return (
    <div ref={wrapper} className="min-w-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4">
        <nav aria-label="Treemap level" className="flex min-h-11 min-w-0 items-center gap-1 text-sm">
          {open ? (
            <>
              <button type="button" onClick={onBack} className={`${CONTROL} -ml-2 px-2 text-muted-foreground`}>
                <ChevronLeft className="size-4" aria-hidden="true" />
                {rootLabel}
              </button>
              <ChevronRight className="size-3.5 shrink-0 text-text-quaternary" aria-hidden="true" />
              <span aria-current="location" className="min-w-0 truncate font-semibold text-foreground">{open.label}</span>
            </>
          ) : (
            <span aria-current="location" className="font-semibold text-foreground">{rootLabel}</span>
          )}
        </nav>
        <div className="flex min-h-11 min-w-0 basis-full items-center gap-3 sm:basis-auto">
          {/* Sighted readout; the live region speaks for the keyboard. */}
          <p aria-hidden="true" className="flex min-w-0 flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            {shown ? (
              <>
                <span className="size-2 shrink-0 rounded-sm" style={{ backgroundColor: dot }} />
                <span className="font-medium text-foreground">{shown.label}</span>
                <span className="font-mono font-semibold tabular-nums text-foreground">{formatValue(shown.value)}</span>
                <span>{shareOf(shown.value, scope)}</span>
              </>
            ) : `${plural(level.length, one, many)} · ${formatValue(scope.base)}`}
          </p>
          {openTarget && (
            <button type="button" onClick={onOpen} aria-label={`Open ${openTarget.label}`}
              className={`${CONTROL} ml-auto border border-border px-3 text-xs font-medium text-foreground`}>
              Open
              <ChevronRight className="size-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      <ChartFrame height={height} mobileHeight={mobileHeight} ariaLabel={ariaLabel} dataLength={dataLength} onKeyDown={onKeyDown}>
        <TreemapMarks nodes={nodes} openId={open?.id ?? null} activeId={shown?.id ?? null} formatValue={formatValue}
          onHover={setHoveredId} onPress={press} />
      </ChartFrame>
      {/* Outside the frame: its role="img" would hide the region from assistive tech. */}
      <p className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</p>
    </div>
  )
}

/** The next tile for an arrow key: from no selection, the first or the last; otherwise one step, held at the ends. */
function nextIndex(index: number, step: number, count: number): number {
  if (index < 0) return step > 0 ? 0 : count - 1
  return Math.min(count - 1, Math.max(0, index + step))
}
