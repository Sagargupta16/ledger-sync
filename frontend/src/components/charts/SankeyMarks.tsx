/**
 * The marks SankeyDiagram draws: ribbons with their drifting beads, and node bars with their labels. The
 * diagram's phase picks the motion: the entrance, a glide and fade on data changes, or final positions.
 */

import type { SVGProps } from 'react'
import { motion, type MotionProps, type MotionValue } from 'motion/react'

import type { FrameState } from './chartContext'
import { CHART_EASE, CHART_MOTION, chartTransition } from './chartMotion'
import { linkPath, type SankeyLink, type SankeyNode } from './sankeyLayout'
import { BEAD_GAP, FALLBACK, textSize, type SankeyDiagramNode, type SankeyLabel } from './sankeyModel'

/** Final positions (motion off); the entrance; glide and fade on data changes. */
export type Phase = 'still' | 'intro' | 'live'
export type Emphasis = 'rest' | 'on' | 'off'
export type Handlers = Required<Pick<SVGProps<SVGElement>, 'onPointerEnter' | 'onPointerLeave' | 'onClick'>>

const COLUMN_STEP = 0.15 // entrance delay between neighbouring columns, before the ribbons sweep in
// After a data change new marks fade in once the glide is mostly done; leaving marks go at once.
const ENTER = { duration: 0.3, ease: CHART_EASE, delay: CHART_MOTION.update * 0.6 }
const LEAVE = { duration: 0.2, ease: CHART_EASE }
const RIBBON: Record<Emphasis, number> = { rest: 0.35, on: 0.6, off: 0.08 } // fill opacity at rest, on the path, off it
const BEAD: Record<Emphasis, number> = { rest: 0.5, on: 0.9, off: 0 }
const HALO = '[paint-order:stroke] stroke-card stroke-3 [stroke-linejoin:round]'

/** Fade-in for marks a data change adds and fade-out for the ones it removes; entrance marks skip both. */
const PRESENCE: Record<Phase, Pick<MotionProps, 'initial' | 'animate' | 'exit'>> = {
  still: { initial: false, animate: { opacity: 1 }, exit: { opacity: 0, transition: { duration: 0 } } },
  intro: { initial: false, animate: { opacity: 1 }, exit: { opacity: 0, transition: LEAVE } },
  live: { initial: { opacity: 0 }, animate: { opacity: 1, transition: ENTER }, exit: { opacity: 0, transition: LEAVE } },
}

type RibbonProps = Handlers & Readonly<{ link: SankeyLink; phase: Phase; color: string; level: Emphasis; offset: MotionValue<number> }>

/** A filled ribbon that morphs its `d` (a transparent stroke widens thin ones for the pointer), with beads. */
export function Ribbon({ link, phase, color, level, offset, ...handlers }: RibbonProps) {
  const morph = chartTransition('update', phase !== 'still')
  const fade = chartTransition('hover', phase !== 'still')
  return (
    <motion.g {...PRESENCE[phase]}>
      <motion.path {...handlers} className="cursor-pointer" style={{ fill: color }} stroke="transparent" strokeWidth={6}
        initial={false} animate={{ d: linkPath(link), fillOpacity: RIBBON[level] }} transition={{ d: morph, fillOpacity: fade }} />
      {phase !== 'still' && (
        // Every bead rides the diagram's one looping offset; a dash period of exactly BEAD_GAP keeps the loop seamless.
        <motion.path fill="none" pointerEvents="none" strokeLinecap="round" strokeDasharray={`0.1 ${BEAD_GAP - 0.1}`}
          strokeWidth={Math.min(3.5, Math.max(1.5, link.width * 0.2))} style={{ stroke: color, strokeDashoffset: offset }}
          initial={false} animate={{ d: linkPath(link, 'center'), opacity: BEAD[level] }} transition={{ d: morph, opacity: fade }} />
      )}
    </motion.g>
  )
}

type NodeMarkProps = Handlers & Readonly<{
  node: SankeyNode<SankeyDiagramNode>; label: SankeyLabel | undefined; phase: Phase; frame: FrameState; dim: boolean
}>

/** A node bar that grows from its centre on entrance and glides on data changes, with its label. */
export function NodeMark({ node, label, phase, frame, dim, ...handlers }: NodeMarkProps) {
  const intro = phase === 'intro'
  const waiting = intro && !frame.entered
  const delay = intro ? Math.min(node.column * COLUMN_STEP, CHART_MOTION.maxStagger) : 0
  const glide = intro ? { duration: 0.5, ease: CHART_EASE, delay } : chartTransition('update', phase === 'live')
  const [mid, tall] = [(node.y0 + node.y1) / 2, Math.max(1, node.y1 - node.y0)]
  const collapsed = { attrX: node.x0, attrY: mid, height: 0 }
  const { font, line } = textSize(frame.isMobile)
  const row = (index: number) => index * line + line / 2 + font * 0.35
  // No <title>: the frame's readout already shows the full name and value, and a native tooltip doubles it.
  return (
    <motion.g {...PRESENCE[phase]} {...handlers} className={node.selectable ? 'cursor-pointer' : undefined}>
      <motion.g initial={false} animate={{ opacity: dim ? 0.3 : 1 }} transition={chartTransition('hover', phase !== 'still')}>
        <motion.rect width={node.x1 - node.x0} rx={2} stroke="transparent" strokeWidth={8} style={{ fill: node.color ?? FALLBACK }}
          initial={intro ? collapsed : false} animate={waiting ? collapsed : { attrX: node.x0, attrY: mid - tall / 2, height: tall }} transition={glide} />
        {label && (
          <motion.g initial={intro ? { x: label.x, y: label.y, opacity: 0 } : false} animate={{ x: label.x, y: label.y, opacity: waiting ? 0 : 1 }}
            transition={intro ? { duration: 0.35, ease: CHART_EASE, delay: delay + 0.3 } : glide}>
            <text textAnchor={label.anchor} fontSize={font} className={`${HALO} fill-foreground`}>
              <tspan x={0} y={row(0)} className="font-medium">{label.name}</tspan>
              {label.value && (
                <tspan x={0} y={row(1)} className="font-mono font-semibold">
                  {label.value}
                  {label.detail && label.inline && <tspan dx={6} className="fill-muted-foreground font-normal">{label.detail}</tspan>}
                </tspan>
              )}
              {label.detail && !label.inline && <tspan x={0} y={row(2)} className="fill-muted-foreground font-mono">{label.detail}</tspan>}
            </text>
          </motion.g>
        )}
      </motion.g>
    </motion.g>
  )
}
