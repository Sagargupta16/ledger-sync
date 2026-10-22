/**
 * Multi-series line chart over time on the in-house chart kit: each series
 * draws in left to right after the one before, morphs when the data changes,
 * and long series get range presets above and a drag brush below.
 */

import { CategoryAxis, ValueAxis } from '@/components/charts/Axis'
import CartesianChart from '@/components/charts/CartesianChart'
import CartesianTooltip, { type TooltipSeries } from '@/components/charts/CartesianTooltip'
import ChartBrush from '@/components/charts/ChartBrush'
import Crosshair from '@/components/charts/Crosshair'
import Grid from '@/components/charts/Grid'
import LineSeries from '@/components/charts/LineSeries'
import { useCartesian } from '@/components/charts/chartContext'
import ChartEmptyState from '@/components/shared/ChartEmptyState'
import ChartRangeControls from '@/components/ui/ChartRangeControls'
import ChartSeriesLegend from '@/components/ui/ChartSeriesLegend'
import { chartDataTable } from '@/components/ui/chartDataTable'
import { useChartRange } from '@/components/ui/useChartRange'
import { chartDateKey, formatChartDate, formatChartPeriod } from '@/lib/chartDateLabels'
import { formatCurrency } from '@/lib/formatters'
import { SEMANTIC_COLORS } from '@/constants/chartColors'

interface TimeSeriesLineChartProps {
  readonly chartData: Array<Record<string, number | string>>
  readonly seriesKeys: string[]
  readonly colors: string[]
  readonly legendFormatter?: (value: string) => string
  readonly emptyMessage?: string
  readonly height?: number
  /** Accessible description of the chart (role=img); also captions the data table. */
  readonly ariaLabel?: string
}

/** Range presets and the brush appear past this many points. */
const ZOOM_AFTER = 6

export default function TimeSeriesLineChart({
  chartData,
  seriesKeys,
  colors,
  legendFormatter,
  emptyMessage = 'No data available',
  height = 400,
  ariaLabel,
}: TimeSeriesLineChartProps) {
  const dateKey = chartData.length > 0 && chartDateKey(String(chartData[0].period ?? ''))
    ? 'period'
    : 'displayPeriod'
  const range = useChartRange(chartData.map((row) => String(row[dateKey] ?? '')))

  if (chartData.length === 0 || seriesKeys.length === 0) {
    return <ChartEmptyState message={emptyMessage} height={height} />
  }

  const colorFor = (index: number) => colors[index % colors.length] ?? SEMANTIC_COLORS.investment
  const latest = chartData.at(-1)
  const zoomable = chartData.length > ZOOM_AFTER

  return (
    <>
      <ChartSeriesLegend
        items={seriesKeys.map((key, index) => ({
          key,
          label: legendFormatter?.(key) ?? key,
          color: colorFor(index),
          value: typeof latest?.[key] === 'number' ? formatCurrency(latest[key]) : undefined,
        }))}
        caption={latest?.[dateKey] ? `Latest: ${formatChartDate(String(latest[dateKey]))}` : undefined}
      />
      {zoomable && <ChartRangeControls range={range} />}
      <CartesianChart
        data={chartData}
        categoryKey={dateKey}
        series={seriesKeys.map((key) => ({ key }))}
        visibleRange={zoomable ? range : undefined}
        height={height}
        ariaLabel={ariaLabel}
        tooltip={<LargestFirstTooltip series={seriesKeys.map((key, index) => ({ key, label: key, color: colorFor(index) }))} />}
      >
        <Grid />
        <Crosshair />
        {/* Draws the zero line itself once a negative value pulls the axis below 0. */}
        <ValueAxis />
        <CategoryAxis tickFormatter={(key) => formatChartPeriod(key)} interval="preserveStartEnd" />
        {seriesKeys.map((key, index) => (
          <LineSeries key={key} dataKey={key} color={colorFor(index)} seriesIndex={index} />
        ))}
      </CartesianChart>
      {zoomable && (
        <ChartBrush
          range={range}
          // The overview traces the total of every series, the shape of the whole chart.
          values={chartData.map((row) => seriesKeys.reduce((sum, key) => {
            const value = row[key]
            return typeof value === 'number' ? sum + value : sum
          }, 0))}
          ariaLabel="Chart zoom"
        />
      )}
      {chartDataTable(
        chartData,
        [
          {
            header: 'Period',
            rowHeader: true,
            value: (row) => formatChartDate(String(row[dateKey] ?? '')),
          },
          ...seriesKeys.map((key) => ({
            header: legendFormatter?.(key) ?? key,
            value: (row: Record<string, number | string>) => {
              const value = row[key]
              return typeof value === 'number' ? formatCurrency(value) : String(value ?? '')
            },
          })),
        ],
        ariaLabel ?? 'Line chart data',
        (row, index) => `${String(row.displayPeriod ?? 'row')}-${index}`,
      )}
    </>
  )
}

/**
 * The kit tooltip with the inspected row's series ordered largest value first,
 * as Recharts' itemSorter had it. Reordering `series` (not drawing the rows by
 * hand) keeps the kit's look, and the spoken reading follows the same order.
 */
function LargestFirstTooltip({ series }: Readonly<{ series: readonly TooltipSeries[] }>) {
  const { activeIndex, rows, numberAt } = useCartesian()
  const row = activeIndex === null ? undefined : rows[activeIndex]
  const ordered = row === undefined
    ? series
    : [...series].sort((a, b) => (numberAt(row, b.key) ?? 0) - (numberAt(row, a.key) ?? 0))
  return <CartesianTooltip series={ordered} />
}
