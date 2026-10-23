/**
 * Animated Sankey for the chart kit, replacing Recharts' <Sankey>. Nodes grow from their centres column
 * by column, ribbons sweep in left to right, labels fade in, and beads drift along every ribbon while the
 * chart is on screen and motion is on. New data (a drill-down) glides the nodes and ribbons that keep
 * their id and fades the rest in or out. Hover, a tap or the arrow keys highlight a path and show its
 * value in a readout.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type Dispatch, type KeyboardEvent, type SetStateAction } from 'react'
import { AnimatePresence, animate, motion, useMotionValue } from 'motion/react'

import { formatCurrency } from '@/lib/formatters'

import ChartFrame from './ChartFrame'
import { useChartFrame } from './chartContext'
import { CHART_MOTION } from './chartMotion'
import SankeyReadout from './SankeyReadout'
import { NodeMark, Ribbon, type Emphasis, type Handlers, type Phase } from './SankeyMarks'
import { sankeyPath, type SankeyLinkInput } from './sankeyLayout'
import {
  BEAD_GAP, BEAD_SECONDS, FALLBACK, PAD, nodeCenter, useSankeyModel, useSvgOnScreen,
  type SankeyDiagramNode, type SankeyFocus, type SankeyModelOptions, type SankeyPoint,
} from './sankeyModel'

export type { SankeyDiagramNode } from './sankeyModel'

const SWEEP = { duration: CHART_MOTION.draw, ease: [0.65, 0, 0.35, 1] as const, delay: 0.2 } // the ribbons' left-to-right wipe
const STEP_KEYS: Partial<Record<string, number>> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }

/** Defaults: height 360, formatValue formatCurrency, align 'justify', nodeWidth 12 and nodePadding 14 (10 and 8 on phones). */
export interface SankeyDiagramProps {
  /** Keep it referentially stable (memoize it): a new array is a new data set, which clears the highlight. */
  readonly nodes: readonly SankeyDiagramNode[]
  /** Zero-value links are skipped. Nodes and links whose ids survive a data change morph. */
  readonly links: readonly SankeyLinkInput[]
  readonly ariaLabel: string
  readonly height?: number
  readonly mobileHeight?: number
  readonly formatValue?: (value: number) => string
  /** Drill-down. Also passes the node's centre in frame px, as a zoom origin, for pointer and keyboard alike. */
  readonly onNodeSelect?: (nodeId: string, center?: SankeyPoint) => void
  /** Highlights this node's path while nothing is hovered, tapped or arrowed to. */
  readonly activeNodeId?: string | null
  readonly align?: 'justify' | 'left'
  /** A label keeps only the rows that fit beside its node, so more padding shows more of each label. */
  readonly nodePadding?: number
  readonly nodeWidth?: number
  /** Base of the readout's shares, such as gross income; defaults to the largest node. */
  readonly total?: number
  /** Names `total` in the readout ("12.5% of gross income"); default "total". */
  readonly totalLabel?: string
}

/** A Sankey in its own ChartFrame: drill-down on nodes, path highlight and readout on hover, tap or arrow keys. */
export default function SankeyDiagram(props: SankeyDiagramProps) {
  const { nodes, links, onNodeSelect } = props
  const [hovered, setHovered] = useState<SankeyFocus | null>(null)
  const [pinned, setPinned] = useState<SankeyFocus | null>(null)
  // A new data set drops the focus, which may name a mark the new view lacks.
  const [shownNodes, setShownNodes] = useState(nodes)
  if (shownNodes !== nodes) {
    setShownNodes(nodes)
    setHovered(null)
    setPinned(null)
  }
  const centers = useRef<ReadonlyMap<string, SankeyPoint>>(new Map())
  const onLayout = useCallback((next: ReadonlyMap<string, SankeyPoint>) => { centers.current = next }, [])
  const model: SankeyModelOptions = {
    nodes, links, formatValue: props.formatValue ?? formatCurrency, align: props.align, nodePadding: props.nodePadding, nodeWidth: props.nodeWidth,
  }
  // Arrow keys walk the drawn nodes (those with a flow) in data order; Enter or Space drills in. Escape
  // clears the highlight first and otherwise bubbles, so a drill-down page can take it as Back.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const linked = new Set(links.flatMap((link) => (link.value > 0 ? [link.source, link.target] : [])))
    const order = nodes.filter((node) => linked.has(node.id))
    const index = order.findIndex((node) => pinned?.kind === 'node' && node.id === pinned.id)
    const step = STEP_KEYS[event.key]
    if (event.key === 'Escape') {
      if (!pinned) return
      setPinned(null)
      event.stopPropagation()
    } else if ((event.key === 'Enter' || event.key === ' ') && index >= 0 && order[index].selectable) {
      onNodeSelect?.(order[index].id, centers.current.get(order[index].id))
    } else if (step !== undefined && order.length > 0) {
      setPinned({ kind: 'node', id: order[Math.min(order.length - 1, Math.max(0, index + step))].id })
    } else return
    event.preventDefault()
  }
  const focus = hovered ?? pinned
  return (
    <ChartFrame height={props.height ?? 360} mobileHeight={props.mobileHeight} ariaLabel={props.ariaLabel}
      dataLength={links.length} onKeyDown={onKeyDown} onBlur={() => setPinned(null)}
      overlay={<SankeyReadout {...model} focus={focus} total={props.total} totalLabel={props.totalLabel} />}>
      <SankeyPlot {...model} focus={focus} activeNodeId={props.activeNodeId} onNodeSelect={onNodeSelect}
        setHovered={setHovered} setPinned={setPinned} onLayout={onLayout} />
    </ChartFrame>
  )
}

interface PlotProps extends SankeyModelOptions {
  readonly focus: SankeyFocus | null
  readonly activeNodeId?: string | null
  readonly onNodeSelect?: (nodeId: string, center?: SankeyPoint) => void
  readonly setHovered: (focus: SankeyFocus | null) => void
  readonly setPinned: Dispatch<SetStateAction<SankeyFocus | null>>
  readonly onLayout: (centers: ReadonlyMap<string, SankeyPoint>) => void
}

/** Lays the graph out at the frame's size and draws ribbons, then nodes with their labels. */
function SankeyPlot({ focus: pointer, activeNodeId, onNodeSelect, setHovered, setPinned, onLayout, ...options }: PlotProps) {
  const frame = useChartFrame()
  const { width, height } = frame
  const { layout, labels } = useSankeyModel(options)
  const [introDone, setIntroDone] = useState(!frame.animate) // mounted without motion: no entrance to play later
  let phase: Phase = 'still'
  if (frame.animate) phase = introDone ? 'live' : 'intro'
  // One offset loops for every bead, and only while the chart is on screen: off screen, or with motion
  // off (Reduced mode, print), nothing ticks. Motion drives it, so the Reduced switch reaches it too.
  const [plotRef, onScreen] = useSvgOnScreen()
  const offset = useMotionValue(BEAD_GAP)
  const flowing = phase !== 'still' && onScreen
  useEffect(() => {
    if (!flowing) return
    const loop = animate(offset, [BEAD_GAP, 0], { duration: BEAD_SECONDS, ease: 'linear', repeat: Infinity })
    return () => loop.stop()
  }, [flowing, offset])
  useLayoutEffect(() => {
    onLayout(new Map(layout.nodes.map((node) => [node.id, nodeCenter(node)])))
  }, [layout, onLayout])
  const focus = pointer ?? (activeNodeId ? { kind: 'node' as const, id: activeNodeId } : null)
  const path = focus ? sankeyPath(layout.links, focus) : null
  const colors = new Map(layout.nodes.map((node) => [node.id, node.color ?? FALLBACK]))
  // A click or tap drills into a selectable node and toggles the highlight on anything else.
  const bind = (target: SankeyFocus, select?: () => void): Handlers => ({
    onPointerEnter: (event) => { if (event.pointerType === 'mouse') setHovered(target) },
    onPointerLeave: (event) => { if (event.pointerType === 'mouse') setHovered(null) },
    onClick: select ?? (() => setPinned((current) => (current?.kind === target.kind && current.id === target.id ? null : target))),
  })
  if (layout.nodes.length === 0) return null
  return (
    <g ref={plotRef} transform={`translate(${PAD},${PAD})`}>
      <rect x={-PAD} y={-PAD} width={width} height={height} fill="transparent" onClick={() => setPinned(null)} />
      {phase === 'intro' && (
        <clipPath id={`${frame.chartId}-sweep`}>
          {/* A unit rect scaled to the frame, so a resize mid-sweep rescales the clip instead of restarting it. */}
          <motion.rect x={0} y={0} height={1} transform={`translate(${-PAD} ${-PAD}) scale(${width} ${height})`}
            initial={{ width: 0 }} animate={{ width: frame.entered ? 1 : 0 }} transition={SWEEP}
            onAnimationComplete={() => { if (frame.entered) setIntroDone(true) }} />
        </clipPath>
      )}
      <g clipPath={phase === 'intro' ? `url(#${frame.chartId}-sweep)` : undefined}>
        <AnimatePresence>
          {layout.links.map((link) => (
            <Ribbon key={link.id} link={link} phase={phase} level={emphasis(path, link.id)} offset={offset}
              color={link.color ?? colors.get(link.source) ?? FALLBACK} {...bind({ kind: 'link', id: link.id })} />
          ))}
        </AnimatePresence>
      </g>
      <AnimatePresence>
        {layout.nodes.map((node) => (
          <NodeMark key={node.id} node={node} label={labels.get(node.id)} phase={phase} frame={frame}
            dim={path !== null && !path.nodes.has(node.id)} {...bind({ kind: 'node', id: node.id }, node.selectable && onNodeSelect
              ? () => onNodeSelect(node.id, nodeCenter(node))
              : undefined)} />
        ))}
      </AnimatePresence>
    </g>
  )
}

function emphasis(path: ReturnType<typeof sankeyPath>, linkId: string): Emphasis {
  if (!path) return 'rest'
  return path.links.has(linkId) ? 'on' : 'off'
}
