/**
 * What SankeyDiagram draws from: the pure layout at the frame's size and where each label fits. The SVG
 * marks and the HTML readout both read it, so the two always agree. Label text is measured by character
 * count, since SVG text has no layout pass to ask.
 */

import { useCallback, useMemo, useState } from 'react'
import { useInView } from 'motion/react'

import { useChartFrame } from './chartContext'
import { computeSankeyLayout, type SankeyLayout, type SankeyLinkInput, type SankeyNode, type SankeyNodeInput } from './sankeyLayout'

/** Layout inset in px, so strokes on the outermost marks are not shaved. */
export const PAD = 4
export const FALLBACK = 'var(--color-app-purple)'
/** Bead spacing in px; sankeyBeads.css loops the beads' dash offset through one spacing every BEAD_SECONDS (~29 px/s). */
export const BEAD_GAP = 20
export const BEAD_SECONDS = 0.7

export interface SankeyDiagramNode extends SankeyNodeInput {
  /** Printed under the label; defaults to the node's flow, the larger of in and out. */
  readonly displayValue?: number
  /** Muted share after the value, such as "12.5%"; it moves to a row of its own when the value line is full. */
  readonly detail?: string
  /** Click, tap and Enter call `onNodeSelect` and the label gets a chevron; other nodes only highlight. */
  readonly selectable?: boolean
}

/** What a hover, tap or arrow key points at. */
export interface SankeyFocus { readonly kind: 'node' | 'link'; readonly id: string }
export interface SankeyPoint { readonly x: number; readonly y: number }

/** A node's label, rows top-down from `y`: the name, the value, and the share beside the value (`inline`) or under it. */
export interface SankeyLabel {
  readonly x: number
  readonly y: number
  readonly anchor: 'start' | 'end'
  readonly name: string
  readonly value?: string
  readonly detail?: string
  readonly inline: boolean
  readonly rows: number
}

export interface SankeyModelOptions {
  readonly nodes: readonly SankeyDiagramNode[]
  readonly links: readonly SankeyLinkInput[]
  readonly formatValue: (value: number) => string
  readonly align?: 'justify' | 'left'
  readonly nodePadding?: number
  readonly nodeWidth?: number
}

export interface SankeyModel {
  readonly layout: SankeyLayout<SankeyDiagramNode>
  readonly labels: ReadonlyMap<string, SankeyLabel>
}

type Fitted = Omit<SankeyLabel, 'x' | 'y' | 'anchor'>

export const textSize = (mobile: boolean) => (mobile ? { font: 10, line: 13 } : { font: 12, line: 15 })
const truncate = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`)

/** Centre of a node in frame px, the zoom origin a drill-down hands its caller. */
export const nodeCenter = (node: SankeyNode): SankeyPoint => ({ x: PAD + (node.x0 + node.x1) / 2, y: PAD + (node.y0 + node.y1) / 2 })

/** Lays the graph out inside the frame, PAD in from every edge, and places the labels. */
export function useSankeyModel({ nodes, links, formatValue, align, nodePadding, nodeWidth }: SankeyModelOptions): SankeyModel {
  const { width, height, isMobile } = useChartFrame()
  return useMemo(() => {
    const box = { width: width - PAD * 2, height: height - PAD * 2 }
    const padding = nodePadding ?? (isMobile ? 8 : 14)
    // Half a gap above the top nodes and below the bottom ones, so a column's end nodes get the label
    // room its inner nodes have instead of sitting flush with the frame.
    const edge = Math.min(padding / 2, box.height / 10)
    const laid = computeSankeyLayout({ nodes, links }, {
      width: box.width, height: box.height - edge * 2, align, nodeWidth: nodeWidth ?? (isMobile ? 10 : 12), nodePadding: padding,
    })
    const layout = shiftDown(laid, edge)
    return { layout, labels: placeLabels(layout, box, isMobile, formatValue) }
  }, [nodes, links, formatValue, align, nodePadding, nodeWidth, width, height, isMobile])
}

function shiftDown<N extends SankeyNodeInput>(layout: SankeyLayout<N>, dy: number): SankeyLayout<N> {
  return {
    columns: layout.columns,
    nodes: layout.nodes.map((node) => ({ ...node, y0: node.y0 + dy, y1: node.y1 + dy })),
    links: layout.links.map((link) => ({ ...link, y0: link.y0 + dy, y1: link.y1 + dy })),
  }
}

const HAS_OBSERVER = typeof IntersectionObserver !== 'undefined'

/**
 * A callback ref for any mark, and whether that mark's <svg> is on screen right now (not once). Watching
 * the svg keeps it to one observer per chart; with no IntersectionObserver (jsdom) it stays false, since
 * Motion's inView would construct one unguarded.
 */
export function useSvgOnScreen(): readonly [(node: SVGElement | null) => void, boolean] {
  const [svg, setSvg] = useState<SVGSVGElement | null>(null)
  const target = useMemo(() => ({ current: HAS_OBSERVER ? svg : null }), [svg])
  const onScreen = useInView(target)
  const ref = useCallback((node: SVGElement | null) => setSvg(node?.ownerSVGElement ?? null), [])
  return [ref, onScreen]
}

/**
 * Labels sit right of their node, or left in the last column, cut to the room before the next column's
 * labels. Each node owns the band halfway to its neighbours and its label keeps only the rows that fit it
 * (phones also skip tiny nodes), so labels never overlap; the readout has the full text.
 */
function placeLabels(layout: SankeyLayout<SankeyDiagramNode>, box: { width: number; height: number }, mobile: boolean,
  format: (value: number) => string) {
  const labels = new Map<string, SankeyLabel>()
  const { line } = textSize(mobile)
  const nodeWidth = layout.nodes.length > 0 ? layout.nodes[0].x1 - layout.nodes[0].x0 : 0
  const gap = (box.width - nodeWidth) / Math.max(1, layout.columns - 1) - nodeWidth
  for (let column = 0; column < layout.columns; column++) {
    const left = column > 0 && column === layout.columns - 1
    const room = (column >= layout.columns - 2 ? gap / 2 : gap) - 10 // the last gap holds labels from both sides
    const stack = layout.nodes.filter((node) => node.column === column).sort((a, b) => a.y0 - b.y0)
    stack.forEach((node, index) => {
      if (mobile && node.y1 - node.y0 < 6) return
      const top = index > 0 ? (stack[index - 1].y1 + node.y0) / 2 : 0
      const bottom = index < stack.length - 1 ? (node.y1 + stack[index + 1].y0) / 2 : box.height
      const fitted = fitLabel(node, room, bottom - top, mobile, format)
      if (!fitted) return
      const tall = fitted.rows * line
      const y = Math.min(Math.max((node.y0 + node.y1 - tall) / 2, top), bottom - tall)
      labels.set(node.id, { ...fitted, x: left ? node.x0 - 6 : node.x1 + 6, y, anchor: left ? 'end' : 'start' })
    })
  }
  return labels
}

/** The rows that fit `room` across and `band` down: a name, then the value, then the share beside or under it. */
function fitLabel(node: SankeyNode<SankeyDiagramNode>, room: number, band: number, mobile: boolean,
  format: (value: number) => string): Fitted | null {
  const { font, line } = textSize(mobile)
  const chars = Math.floor(room / (font * 0.56))
  const space = Math.floor(band / line)
  if (chars < 4 || space < 1) return null
  const fits = (text: string) => text.length * font * 0.6 <= room
  const name = node.selectable ? `${truncate(node.label, chars - 2)} ›` : truncate(node.label, chars)
  const text = format(node.displayValue ?? node.value)
  const value = space >= 2 && fits(text) ? text : undefined
  const detail = value && node.detail && fits(node.detail) ? node.detail : undefined
  const inline = detail !== undefined && fits(`${text}  ${detail}`)
  const below = detail !== undefined && !inline && space >= 3
  return { name, value, detail: inline || below ? detail : undefined, inline, rows: 1 + (value ? 1 : 0) + (below ? 1 : 0) }
}
