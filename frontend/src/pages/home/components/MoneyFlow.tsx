import { useId, useRef } from 'react'
import { motion, useInView, type Variants } from 'motion/react'

import { EASING } from '@/constants/animations'
import { colors } from '@/constants/colors'
import { useMotionStore } from '@/store/motionStore'

import {
  SAMPLE_FLOW,
  SAMPLE_INCOME,
  SAMPLE_MONTH_LABEL,
  SAMPLE_SAVINGS_RATE,
  formatInr,
  formatPercent,
} from '../sampleData'
import { CountUp } from './CountUp'
import { NODE_WIDTH, layoutFlow } from './flowLayout'
import { SampleBadge } from './SampleBadge'
import { useElementWidth } from './useElementWidth'

const COMPACT_BELOW = 420
const DRAW_START = 0.2
/** Beads travel at one speed on every ribbon; the cycle is a whole number of dash periods. */
const BEAD_PERIOD = 16
const BEAD_CYCLE = BEAD_PERIOD * 4
const BEAD_SECONDS = BEAD_CYCLE / 36

const sourceNode: Variants = {
  hidden: { scaleY: 0, opacity: 0 },
  shown: { scaleY: 1, opacity: 1, transition: { duration: 0.45, ease: EASING.cinematic } },
}

const ribbon: Variants = {
  hidden: { pathLength: 0, opacity: 0 },
  shown: (i: number) => ({
    pathLength: 1,
    opacity: 1,
    transition: { delay: DRAW_START + i * 0.1, duration: 0.9, ease: EASING.cinematic },
  }),
}

const targetNode: Variants = {
  hidden: { scaleX: 0, opacity: 0 },
  shown: (i: number) => ({
    scaleX: 1,
    opacity: 1,
    transition: { delay: DRAW_START + 0.65 + i * 0.1, duration: 0.3, ease: EASING.cinematic },
  }),
}

const nodeLabel: Variants = {
  hidden: { opacity: 0, x: -6 },
  shown: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: DRAW_START + 0.75 + i * 0.1, duration: 0.35, ease: EASING.cinematic },
  }),
}

const SUMMARY = `Sample month: ${formatInr(SAMPLE_INCOME)} of income split into ${SAMPLE_FLOW.map(
  (branch) => `${branch.label.toLowerCase()} ${formatInr(branch.value)}`,
).join(', ')}.`

/** Animated sample Sankey: one month of income fanning out to where it went. */
export function MoneyFlow() {
  const reduce = useMotionStore((state) => state.mode === 'reduced')
  const [frameRef, measured] = useElementWidth<HTMLDivElement>(480)
  const svgRef = useRef<SVGSVGElement>(null)
  const entered = useInView(svgRef, { once: true, amount: 0.35 })
  const onScreen = useInView(svgRef)
  const id = useId().replaceAll(/[^\w-]/g, '')

  const width = Math.max(measured, 260)
  const compact = width < COMPACT_BELOW
  const layout = layoutFlow(SAMPLE_FLOW, {
    width,
    height: compact ? 248 : 292,
    labelWidth: compact ? 112 : 140,
  })
  const show = reduce || entered
  const state = show ? 'shown' : 'hidden'
  const initial = reduce ? false : 'hidden'
  // Beads only loop while the figure is on screen; Reduced mode renders none.
  const flowing = entered && onScreen && !reduce

  return (
    <figure className="ledger-panel overflow-hidden">
      <figcaption className="flex items-start justify-between gap-4 border-b border-border px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <p className="ledger-meta text-muted-foreground">Sample month, {SAMPLE_MONTH_LABEL}</p>
          <p className="ledger-figure mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            <span className="sr-only">Income {formatInr(SAMPLE_INCOME)}</span>
            <span aria-hidden="true" data-countup="">
              <CountUp value={show ? SAMPLE_INCOME : 0} format={formatInr} />
            </span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">Income, and where every rupee went</p>
        </div>
        <SampleBadge />
      </figcaption>

      <div ref={frameRef} className="px-3 py-4 sm:px-5 sm:py-5">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          className="block h-auto w-full"
          role="img"
          aria-labelledby={`${id}-title`}
        >
          <title id={`${id}-title`}>{SUMMARY}</title>
          <defs>
            {layout.links.map((link) => (
              <linearGradient
                key={link.key}
                id={`${id}-${link.key}`}
                gradientUnits="userSpaceOnUse"
                x1={NODE_WIDTH}
                y1={0}
                x2={layout.targetX}
                y2={0}
              >
                <stop offset="0" stopColor={colors.financial.income} stopOpacity={0.3} />
                <stop offset="1" stopColor={link.color} stopOpacity={0.48} />
              </linearGradient>
            ))}
          </defs>

          <motion.rect
            x={0}
            y={layout.source.y}
            width={NODE_WIDTH}
            height={layout.source.height}
            rx={2}
            fill={colors.financial.income}
            variants={sourceNode}
            initial={initial}
            animate={state}
          />

          {layout.links.map((link, i) => (
            <g key={link.key}>
              <motion.path
                d={link.path}
                fill="none"
                stroke={`url(#${id}-${link.key})`}
                strokeWidth={link.thickness}
                custom={i}
                variants={ribbon}
                initial={initial}
                animate={state}
              />
              {!reduce && (
                <motion.path
                  data-flow-bead=""
                  d={link.path}
                  fill="none"
                  stroke={link.color}
                  strokeWidth={Math.min(5, Math.max(2, link.thickness * 0.1))}
                  strokeLinecap="round"
                  strokeDasharray={`0.1 ${BEAD_PERIOD - 0.1}`}
                  initial={{ opacity: 0, strokeDashoffset: 0 }}
                  animate={{
                    opacity: entered ? 0.9 : 0,
                    strokeDashoffset: flowing ? -BEAD_CYCLE : 0,
                  }}
                  transition={{
                    opacity: { delay: DRAW_START + 1, duration: 0.4 },
                    strokeDashoffset: flowing
                      ? { duration: BEAD_SECONDS, ease: 'linear', repeat: Infinity }
                      : { duration: 0 },
                  }}
                />
              )}
              <motion.rect
                x={layout.targetX}
                y={link.nodeY}
                width={NODE_WIDTH}
                height={link.thickness}
                rx={2}
                fill={link.color}
                custom={i}
                variants={targetNode}
                initial={initial}
                animate={state}
                style={{ originX: 0 }}
              />
              <motion.g custom={i} variants={nodeLabel} initial={initial} animate={state}>
                <text x={layout.labelX} y={link.centerY - 4} className="ledger-meta fill-muted-foreground">
                  {link.label}
                </text>
                <text
                  x={layout.labelX}
                  y={link.centerY + (compact ? 13 : 15)}
                  className={`fill-foreground font-semibold tabular-nums ${compact ? 'text-sm' : 'text-base'}`}
                >
                  <CountUp value={show ? link.value : 0} format={formatInr} />
                  <tspan dx={6} className="fill-muted-foreground text-xs font-medium">
                    {Math.round(link.share * 100)}%
                  </tspan>
                </text>
              </motion.g>
            </g>
          ))}
        </svg>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border px-4 py-3 text-xs text-muted-foreground sm:px-5">
        <span>
          <span className="font-semibold tabular-nums text-foreground">
            {formatPercent(SAMPLE_SAVINGS_RATE)}
          </span>{' '}
          kept as investments and savings
        </span>
        <span>Illustrative figures, not a real account</span>
      </div>
    </figure>
  )
}
