/**
 * Category and value axes for x/y charts. Labels keep the Recharts look the app
 * had (AXIS_TICK: mono, subtle ink, compact currency; 10px on phones) and move
 * through TickLayer: they fade and slide 4px in when the chart enters, glide to
 * their new place when a filter or range moves the scale, and jump on resize.
 */

import { motion } from 'motion/react'

import { formatChartPeriod } from '@/lib/chartDateLabels'
import { formatCurrencyShort } from '@/lib/formatters'

import { useCartesian, useChartFrame } from './chartContext'
import { CHART_EASE } from './chartMotion'
import { ENTER_FADE, TickLayer, type TickInterval, type TickSource } from './Grid'

export type { TickInterval } from './Grid'

type Side = 'bottom' | 'top' | 'left' | 'right'

/** Average glyph advance as a share of the font size: about 6.2px at 11px. */
const CHAR_EM = 6.2 / 11
const LINE_EM = 1.2
/** Clear space between labels along a horizontal axis (Recharts' minTickGap). */
const LABEL_GAP = 24
/** Px labels slide in toward the plot on entrance. */
const SLIDE = 4
/** Recharts kept its 6px tick length in the label offset with tick lines off; so do we. */
const TICK_SIZE = 6
const VALUE_SIDE = { horizontal: { left: 'left', right: 'right' }, vertical: { left: 'bottom', right: 'top' } } as const
const fontSize = (isMobile: boolean) => (isMobile ? 10 : 11)

/** Defaults: axisLine on for a bottom axis only; tickMargin 10 below the plot, 8 beside it. */
interface AxisProps {
  /** Draw nothing; the chart margin keeps its room. */
  readonly hide?: boolean
  readonly axisLine?: boolean
  /** Px between the labels and the plot edge, past a 6px tick length, as in Recharts. */
  readonly tickMargin?: number
}

export interface CategoryAxisProps extends AxisProps {
  /** Label of a category key; by default dates read like Jan ’26 and other keys pass through. */
  readonly tickFormatter?: (key: string, index: number) => string
  /** Degrees to rotate bottom labels, such as -45; they then hang from their end. */
  readonly angle?: number
  /** Default 'preserveStartEnd' on phones, 'auto' elsewhere. */
  readonly interval?: TickInterval
  /**
   * Px for the right-aligned labels left of the plot (vertical layout), default the
   * left margin less the label offset. A longer label wraps to two lines, then truncates.
   */
  readonly labelWidth?: number
}

export interface ValueAxisProps extends AxisProps {
  /** 'left' reads `value`; 'right' reads `value2` (drawn along the top in vertical layout). */
  readonly axis?: 'left' | 'right'
  /** Default compact currency, the formatter yAxisDefaults used. */
  readonly tickFormatter?: (value: number) => string
  /** Default 5, 4 on phones; give Grid the same count. */
  readonly tickCount?: number
  /** Solid line at 0 when the domain spans both signs; default on for the left axis. */
  readonly zeroLine?: boolean
}

/** Periods under the plot (horizontal layout, mono) or names down its left side (vertical, sans). */
export function CategoryAxis({
  hide = false, axisLine, tickMargin, tickFormatter, angle = 0, interval, labelWidth,
}: CategoryAxisProps) {
  const { category, layout, margin } = useCartesian()
  const { isMobile } = useChartFrame()
  if (hide) return null
  const bottom = layout === 'horizontal'
  const gap = TICK_SIZE + (tickMargin ?? (bottom ? 10 : 8))
  const [charPx, lineHeight] = [fontSize(isMobile) * CHAR_EM, fontSize(isMobile) * LINE_EM]
  const count = category.keys.length
  const label = (index: number) => {
    const key = category.keys[index] ?? ''
    return tickFormatter ? tickFormatter(key, index) : formatChartPeriod(key, count > 365)
  }
  // The longest label sets the stride; long series are sampled to keep hover re-renders cheap.
  let longest = count > 0 ? label(count - 1).length : 0
  for (let index = 0; index < count; index += Math.ceil(count / 60)) longest = Math.max(longest, label(index).length)
  const chars = Math.max(1, Math.floor((labelWidth ?? margin.left - gap) / charPx))
  const lines = category.step >= lineHeight * 2 + 2 ? 2 : 1
  const sideLines = longest > chars ? lines : 1
  // Rotated labels need room for their slanted footprint, as Recharts measured it.
  const radians = (angle * Math.PI) / 180
  const footprint = Math.min(lineHeight / Math.abs(Math.sin(radians)), (longest * charPx) / Math.abs(Math.cos(radians)))
  return (
    <AxisFrame side={bottom ? 'bottom' : 'left'} source={{ kind: 'category', scale: category }} label={label}
      need={bottom ? footprint + LABEL_GAP : sideLines * lineHeight + 2} gap={gap} angle={bottom ? angle : 0}
      interval={interval ?? (isMobile ? 'preserveStartEnd' : 'auto')} axisLine={axisLine ?? bottom}
      fit={bottom ? undefined : { chars, lines }} />
  )
}

/** Value ticks beside the plot (horizontal layout) or under it (vertical layout). */
export function ValueAxis({
  hide = false, axisLine, tickMargin, axis = 'left', tickFormatter = formatCurrencyShort, tickCount, zeroLine = axis === 'left',
}: ValueAxisProps) {
  const { value, value2, layout, plot } = useCartesian()
  const { isMobile } = useChartFrame()
  const scale = axis === 'right' ? value2 : value
  if (hide || !scale) return null
  const side = VALUE_SIDE[layout][axis]
  const across = side === 'bottom' || side === 'top'
  const values = scale.ticks(tickCount ?? (isMobile ? 4 : 5))
  const longest = Math.max(0, ...values.map((tick) => tickFormatter(tick).length))
  const crosses = zeroLine && scale.domain[0] < 0 && scale.domain[1] > 0
  const gap = TICK_SIZE + (tickMargin ?? (across ? 10 : 8))
  return (
    <>
      <g aria-hidden="true" className="stroke-(--chart-reference-line-strong)">
        <TickLayer source={{ kind: 'value', scale, values: crosses ? [0] : [] }} along={across ? 'x' : 'y'}>
          {() => (across ? <line y1={plot.y} y2={plot.y + plot.height} /> : <line x1={plot.x} x2={plot.x + plot.width} />)}
        </TickLayer>
      </g>
      <AxisFrame side={side} source={{ kind: 'value', scale, values }} label={tickFormatter} gap={gap}
        need={across ? longest * fontSize(isMobile) * CHAR_EM + LABEL_GAP : fontSize(isMobile) * LINE_EM + 2}
        axisLine={axisLine ?? side === 'bottom'} />
    </>
  )
}

interface AxisFrameProps {
  readonly side: Side
  readonly source: TickSource
  /** Text for a tick's datum: a category index or a value. */
  readonly label: (datum: number) => string
  readonly need: number
  readonly interval?: TickInterval
  readonly gap: number
  readonly angle?: number
  readonly axisLine: boolean
  /** Characters and lines a side label may take before it wraps, then truncates. */
  readonly fit?: { readonly chars: number; readonly lines: number }
}

/** The axis line and animated labels on one side; names beside the plot set in sans, the rest mono. */
function AxisFrame({ side, source, label, need, interval = 'auto', gap, angle = 0, axisLine, fit }: AxisFrameProps) {
  const { plot } = useCartesian()
  const { isMobile, width, animate, entered } = useChartFrame()
  const along = side === 'bottom' || side === 'top' ? 'x' : 'y'
  const outward = side === 'bottom' || side === 'right' ? 1 : -1
  const edge = { bottom: plot.y + plot.height, top: plot.y, left: plot.x, right: plot.x + plot.width }[side]
  const at = edge + outward * gap
  // Side labels anchor toward the plot; bottom labels centre, or hang from their end when rotated.
  const anchor = (['end', 'middle', 'start'] as const)[Math.sign(along === 'y' ? outward : angle) + 1]
  const font = source.kind === 'category' && along === 'y' ? 'font-sans' : 'font-mono'
  const line = along === 'x'
    ? { x1: plot.x, x2: plot.x + plot.width, y1: edge, y2: edge }
    : { x1: edge, x2: edge, y1: plot.y, y2: plot.y + plot.height }
  return (
    <g aria-hidden="true" fontSize={fontSize(isMobile)} className={`fill-(--chart-text-subtle) ${font}`}>
      {axisLine && (
        <motion.line {...line} className="stroke-(--chart-axis-line)" initial={animate && { opacity: 0 }}
          animate={{ opacity: entered ? 1 : 0 }} transition={animate ? { duration: ENTER_FADE, ease: CHART_EASE } : { duration: 0 }} />
      )}
      <TickLayer source={source} along={along} need={need} interval={interval} slide={outward * SLIDE} stagger>
        {(tick) => {
          const text = label(tick.datum)
          if (along === 'x') {
            // A centred label at either end of the axis is nudged to stay inside the SVG.
            const half = angle ? 0 : (text.length * fontSize(isMobile) * CHAR_EM) / 2
            const nudge = Math.max(0, half - tick.at) - Math.max(0, tick.at + half - width)
            return (
              <text x={nudge} y={at} dy={side === 'bottom' ? '0.71em' : undefined} textAnchor={anchor}
                transform={angle ? `rotate(${angle} 0 ${at})` : undefined}>{text}</text>
            )
          }
          const [first, second] = fit ? fitLines(text, fit.chars, fit.lines) : [text]
          // 0.355em centres one line on the tick; -0.245em centres two 1.2em lines.
          return (
            <text x={at} dy={second === undefined ? '0.355em' : '-0.245em'} textAnchor={anchor}>
              {first}
              {second !== undefined && <tspan x={at} dy={`${LINE_EM}em`}>{second}</tspan>}
            </text>
          )
        }}
      </TickLayer>
    </g>
  )
}

/** Breaks a label at spaces into at most `lines` lines of `chars`; what is left over ends in an ellipsis. */
function fitLines(label: string, chars: number, lines: number): string[] {
  const out: string[] = []
  let rest = label.trim()
  while (rest.length > chars && out.length < lines - 1) {
    const cut = rest.lastIndexOf(' ', chars)
    if (cut <= 0) break
    out.push(rest.slice(0, cut))
    rest = rest.slice(cut + 1)
  }
  return [...out, rest.length > chars ? `${rest.slice(0, Math.max(1, chars - 1)).trimEnd()}…` : rest]
}
