/**
 * Desktop butterfly for SpendingDistribution: one row per category, period A
 * growing left and period B growing right from one centre line, on a symmetric
 * scale with round ticks. Rows stagger in with both sides at full strength and
 * their amounts fade in at the outer ends; then the side that spent less in
 * each row fades back so the eye lands on the larger one.
 */

import { useEffect, useMemo, useState } from 'react'

import { CategoryAxis, ValueAxis } from '@/components/charts/Axis'
import Bars from '@/components/charts/Bars'
import CartesianChart, { type SeriesSpec } from '@/components/charts/CartesianChart'
import CartesianTooltip from '@/components/charts/CartesianTooltip'
import { useChartFrame, type ChartRow } from '@/components/charts/chartContext'
import { CHART_MOTION, staggerDelay } from '@/components/charts/chartMotion'
import Grid from '@/components/charts/Grid'
import { tickStep } from '@/components/charts/scales'
import { formatCurrency, formatCurrencyShort } from '@/lib/formatters'
import { colors } from '@/constants/colors'

/** One category row. Period A is stored negative so its bar extends left of zero. */
export interface ButterflyRow {
  name: string
  periodA: number
  periodB: number
  /** Period A spent at least as much as period B in this category. */
  aWins: boolean
}

interface SpendingButterflyChartProps {
  readonly rows: readonly ButterflyRow[]
  /** Largest amount on either side; the scale reaches 1.25x it so outer labels fit. */
  readonly maxValue: number
  readonly labelA: string
  readonly labelB: string
  /** Narrower category column, for tablet widths. */
  readonly compact: boolean
}

// One stack, so A (negative) and B (positive) both grow out of the centre line.
const SERIES: readonly SeriesSpec[] = [
  { key: 'periodA', stackId: 'split' },
  { key: 'periodB', stackId: 'split' },
]
const STACK = ['periodA', 'periodB']
const ROW_HEIGHT = 44
const MIN_HEIGHT = 360
const HEADROOM = 1.25
const FADED = 0.45
const BAR_SIZE = 16
const MARGIN = { compact: { left: 152 }, wide: { left: 188 } }
// The fade-back, and a row whose larger side flips on a period change, ease instead of jumping.
const FADE_EASE = '**:transition-[fill,fill-opacity] **:duration-400 **:ease-[cubic-bezier(0.22,1,0.36,1)]'

const asIs = (label: string) => label
const absCurrency = (value: number) => formatCurrency(Math.abs(value))
const absShort = (value: number) => formatCurrencyShort(Math.abs(value))
const amount = (value: unknown) => (typeof value === 'number' ? value : 0)

export function SpendingButterflyChart({ rows, maxValue, labelA, labelB, compact }: SpendingButterflyChartProps) {
  const scale = useMemo(() => {
    const limit = maxValue * HEADROOM
    return { domain: [-limit, limit] as const, ticks: mirroredTicks(limit) }
  }, [maxValue])
  const height = Math.max(MIN_HEIGHT, rows.length * ROW_HEIGHT)

  return (
    <CartesianChart
      data={rows}
      categoryKey="name"
      series={SERIES}
      categoryKind="band"
      layout="vertical"
      valueDomain={scale.domain}
      valueTicks={scale.ticks}
      margin={compact ? MARGIN.compact : MARGIN.wide}
      height={height}
      mobileHeight={height}
      ariaLabel={`Spending distribution butterfly chart -- ${labelA} bars extend left, ${labelB} bars extend right, one diverging row per category`}
      tooltip={
        <CartesianTooltip
          series={[
            { key: 'periodA', label: labelA, color: colors.app.blue, format: absCurrency },
            { key: 'periodB', label: labelB, color: colors.app.red, format: absCurrency },
          ]}
          formatLabel={asIs}
          footer={difference}
        />
      }
    >
      <Grid />
      <CategoryAxis tickFormatter={asIs} />
      <ButterflyBars count={rows.length} />
      {/* Absolute amounts either side. Drawn after the bars so its line at 0
        stays visible as the spine where each row's A and B meet. */}
      <ValueAxis tickFormatter={absShort} />
    </CartesianChart>
  )
}

/** Both sides grow at full strength, then the side that spent less in each row fades back. */
function ButterflyBars({ count }: Readonly<{ count: number }>) {
  const { animate, entered } = useChartFrame()
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    if (settled || !animate || !entered) return
    // The last row's bar and label are in by its stagger delay plus one bar grow.
    const wait = (staggerDelay(count - 1, count) + CHART_MOTION.bar) * 1000
    const timer = setTimeout(() => setSettled(true), wait)
    return () => clearTimeout(timer)
  }, [settled, animate, entered, count])
  const faded = settled || !animate
  const opacityFor = (isA: boolean) => (row: ChartRow) => (faded && (row.aWins === true) !== isA ? FADED : 1)

  return (
    <g className={animate ? FADE_EASE : undefined}>
      <Bars dataKey="periodA" color={colors.app.blue} stackKeys={STACK} radius={4} barSize={BAR_SIZE}
        fillOpacity={opacityFor(true)} label={absShort} />
      <Bars dataKey="periodB" color={colors.app.red} stackKeys={STACK} radius={4} barSize={BAR_SIZE}
        fillOpacity={opacityFor(false)} label={absShort} />
    </g>
  )
}

/** Tooltip footer: B minus A. A is stored negative, so the sum is the change. */
function Difference({ row }: Readonly<{ row: ChartRow }>) {
  const change = amount(row.periodB) + amount(row.periodA)
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-5">
      <span>Difference, B vs A</span>
      <span className="whitespace-nowrap text-right font-mono font-semibold tabular-nums text-foreground">
        {signedCurrency(change)}
      </span>
    </div>
  )
}

const difference = (row: ChartRow) => <Difference row={row} />

/** "+₹1,200.00" when B spent more, "-₹1,200.00" when it spent less, unsigned at zero. */
function signedCurrency(value: number): string {
  const text = formatCurrency(Math.abs(value))
  if (Math.abs(value) < 0.005) return text
  return `${value > 0 ? '+' : '-'}${text}`
}

/** Round 1/2/5 ticks mirrored about zero inside [-limit, limit], about three a side. */
function mirroredTicks(limit: number): number[] {
  const step = tickStep(0, limit, 3)
  const side = Math.floor(limit / step + 1e-9)
  return Array.from({ length: side * 2 + 1 }, (_, index) => (index - side) * step)
}
