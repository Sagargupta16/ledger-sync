import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { formatCurrency } from '@/lib/formatters'
import { chartTooltipProps, ChartContainer } from '@/components/ui'
import { CHART_LINE_CURSOR_STYLE } from '@/components/ui/ChartTooltip'
import ChartTooltipContent from '@/components/ui/ChartTooltipContent'
import ChartSeriesLegend from '@/components/ui/ChartSeriesLegend'
import { useChartPresentation } from '@/components/ui/useChartPresentation'
import {
  GRID_DEFAULTS, xAxisDefaults, yAxisDefaults, ACTIVE_DOT, referenceLine,
} from '@/components/ui/chartDefaults'
import { SEMANTIC_COLORS } from '@/constants/chartColors'
import { chartDataTable } from '@/components/ui/chartDataTable'
import ChartEmptyState from '@/components/shared/ChartEmptyState'

interface TimeSeriesLineChartProps {
  readonly chartData: Array<Record<string, number | string>>
  readonly seriesKeys: string[]
  readonly colors: string[]
  readonly legendFormatter?: (value: string) => string
  readonly emptyMessage?: string
  readonly height?: number
  /** Accessible description of the chart, forwarded to ChartContainer (role=img). */
  readonly ariaLabel?: string
}

export default function TimeSeriesLineChart({
  chartData,
  seriesKeys,
  colors,
  legendFormatter,
  emptyMessage = 'No data available',
  height = 400,
  ariaLabel,
}: TimeSeriesLineChartProps) {
  const { animate, isMobile } = useChartPresentation(chartData.length)

  if (chartData.length === 0 || seriesKeys.length === 0) {
    return <ChartEmptyState message={emptyMessage} height={height} />
  }

  const colorFor = (index: number) => colors[index % colors.length] ?? SEMANTIC_COLORS.investment
  const latest = chartData.at(-1)
  const hasNegative = chartData.some((row) => seriesKeys.some((key) => Number(row[key]) < 0))

  return (
    <>
      <ChartSeriesLegend
        items={seriesKeys.map((key, index) => ({
          key,
          label: legendFormatter?.(key) ?? key,
          color: colorFor(index),
          value: typeof latest?.[key] === 'number' ? formatCurrency(latest[key]) : undefined,
        }))}
        caption={latest?.displayPeriod ? `Latest: ${latest.displayPeriod}` : undefined}
      />
      <ChartContainer height={height} ariaLabel={ariaLabel}>
        <LineChart data={chartData} margin={{ top: 16, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid {...GRID_DEFAULTS} />
          <XAxis
            dataKey="displayPeriod"
            {...xAxisDefaults(chartData.length, { dateFormatter: true })}
            interval="preserveStartEnd"
            height={36}
          />
          <YAxis {...yAxisDefaults({ width: isMobile ? 48 : 56 })} />
          <Tooltip
            {...chartTooltipProps}
            cursor={CHART_LINE_CURSOR_STYLE}
            content={<ChartTooltipContent />}
            // `displayPeriod` is already a formatted bucket label ("Wk 12 '24",
            // "Jan 24"), not a parseable date, so reformatting it would show
            // "Invalid Date" on week and month buckets.
            formatter={(value) => formatCurrency(typeof value === 'number' ? value : 0)}
            itemSorter={(item) => -(item.value as number)}
          />
          {hasNegative && referenceLine({ y: 0, variant: 'zero' })}
          {seriesKeys.map((key, index) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              name={key}
              stroke={colorFor(index)}
              strokeWidth={2.25}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={chartData.filter((row) => typeof row[key] === 'number').length === 1
                ? { r: 3, fill: colorFor(index), strokeWidth: 0 }
                : false}
              activeDot={{ ...ACTIVE_DOT, fill: colorFor(index) }}
              connectNulls
              isAnimationActive={animate}
              animationDuration={520}
              animationEasing="ease-out"
            />
          ))}
        </LineChart>
      </ChartContainer>
      {chartDataTable(
        chartData,
        [
          {
            header: 'Period',
            rowHeader: true,
            value: (row) => String(row.displayPeriod ?? ''),
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
