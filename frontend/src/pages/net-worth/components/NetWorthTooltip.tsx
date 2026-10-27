import type { ReactNode } from 'react'

import CartesianTooltip, { type TooltipSeries } from '@/components/charts/CartesianTooltip'
import type { ChartRow } from '@/components/charts/chartContext'
import { formatChartDate } from '@/lib/chartDateLabels'
import { formatCurrency } from '@/lib/formatters'

interface NetWorthTooltipProps {
  /** Stacked category layers, bottom to top; empty in the total view. */
  readonly layers: readonly TooltipSeries[]
  /** Colour of the trend and its projection. */
  readonly color: string
  /** Read the projected median and band on rows past the anchor. */
  readonly projection: boolean
  /** Colour of the previous straight-line projection when it is drawn; null hides its reading. */
  readonly linear: string | null
}

interface Reading {
  readonly key: string
  readonly label: string
  readonly color: string
  readonly value: ReactNode
}

const amount = (row: ChartRow, key: string) => {
  const value = row[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** A projected row: past the anchor, so it has no recorded trend value. */
const isForecast = (row: ChartRow) => amount(row, 'netWorth') === null && amount(row, 'projected') !== null

const bandText = (high: number, row: ChartRow) => `${formatCurrency(amount(row, 'projectionLow') ?? high)} to ${formatCurrency(high)}`

/**
 * The trend chart's readout. The stacked view lists its layers top to bottom
 * with their total; the total view reads the recorded trend, or on a projected
 * row an Estimate tag with the compound median, the low to high band and, when
 * it is drawn, the previous straight line.
 */
export function NetWorthTooltip({ layers, color, projection, linear }: Readonly<NetWorthTooltipProps>) {
  if (layers.length > 0) {
    return (
      <CartesianTooltip
        series={[...layers].reverse()}
        footer={stackTotal(layers)}
      />
    )
  }
  const trend: TooltipSeries = { key: 'netWorth', label: 'Net worth trend (cash flow)', color }
  const forecast: readonly TooltipSeries[] = projection
    ? [
        { key: 'projectionHigh', label: 'Projected range (±1σ)', color, format: bandText },
        { key: 'projected', label: 'Compound projection (median)', color },
        ...(linear === null ? [] : [{ key: 'linear', label: 'Straight line (previous model)', color: linear }]),
      ]
    : []
  return (
    <CartesianTooltip
      series={[trend, ...forecast]}
      formatLabel={(label, row) => (isForecast(row) ? `${formatChartDate(label)}, estimate` : formatChartDate(label))}
      render={(row) => <Readout row={row} series={isForecast(row) ? forecast : [trend]} />}
    />
  )
}

function Readout({ row, series }: Readonly<{ row: ChartRow; series: readonly TooltipSeries[] }>) {
  const readings = series.flatMap((spec): Reading[] => {
    const value = amount(row, spec.key)
    if (value === null) return []
    const low = spec.key === 'projectionHigh' ? amount(row, 'projectionLow') : null
    const text = low === null
      ? formatCurrency(value)
      : <><span>{formatCurrency(low)}</span><span>to</span><span>{formatCurrency(value)}</span></>
    return [{ key: spec.key, label: spec.label, color: spec.color, value: text }]
  })
  return (
    <>
      <div className="mb-3 flex items-baseline justify-between gap-x-4 border-b border-border/60 pb-2">
        <span className="text-xs font-medium text-foreground">{formatChartDate(String(row.date))}</span>
        {isForecast(row) && (
          <span className="rounded-full border border-app-blue/40 px-1.5 font-mono text-[10px] uppercase tracking-wider text-app-blue">
            Estimate
          </span>
        )}
      </div>
      <dl className="space-y-2.5">
        {readings.map((reading) => (
          <div key={reading.key} className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1">
            <dt className="flex items-baseline gap-2 text-xs text-muted-foreground">
              <span className="size-2 shrink-0 rounded-sm" style={{ backgroundColor: reading.color }} aria-hidden="true" />
              {reading.label}
            </dt>
            <dd className="flex flex-wrap gap-x-1 font-mono text-xs font-semibold tabular-nums text-foreground">
              {reading.value}
            </dd>
          </div>
        ))}
      </dl>
    </>
  )
}

function Total({ value }: Readonly<{ value: number }>) {
  return (
    <div className="flex items-baseline justify-between gap-x-5">
      <span>Total</span>
      <span className="font-mono font-semibold tabular-nums text-foreground">{formatCurrency(value)}</span>
    </div>
  )
}

/** The stacked view's footer: every layer's value on the row, summed. */
const stackTotal = (layers: readonly TooltipSeries[]) => (row: ChartRow) => (
  <Total value={layers.reduce((sum, layer) => sum + (amount(row, layer.key) ?? 0), 0)} />
)
