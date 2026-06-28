import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { formatCurrency } from '@/lib/formatters'
import { chartTooltipProps, ChartContainer } from '@/components/ui'
import {
  GRID_DEFAULTS, xAxisDefaults, yAxisDefaults, LEGEND_DEFAULTS, shouldAnimate, ACTIVE_DOT,
} from '@/components/ui/chartDefaults'
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
  if (chartData.length === 0 || seriesKeys.length === 0) {
    return <ChartEmptyState message={emptyMessage} height={height} />
  }

  const animate = shouldAnimate(chartData.length)

  return (
    <ChartContainer height={height} ariaLabel={ariaLabel}>
      <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 8, left: 4 }}>
        <CartesianGrid {...GRID_DEFAULTS} />
        <XAxis
          dataKey="displayPeriod"
          {...xAxisDefaults(chartData.length, { angle: -45, dateFormatter: true })}
          height={80}
        />
        <YAxis {...yAxisDefaults()} />
        <Tooltip
          {...chartTooltipProps}
          // `displayPeriod` is already a formatted bucket label ("Wk 12 '24",
          // "Jan 24"), not a parseable date — re-wrapping it in new Date()
          // rendered a literal "Invalid Date" on week/month-bucketed views.
          formatter={(value) => formatCurrency(typeof value === 'number' ? value : 0)}
          itemSorter={(item) => -(item.value as number)}
        />
        <Legend {...LEGEND_DEFAULTS} formatter={legendFormatter} />
        {seriesKeys.map((key, index) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            stroke={colors[index % colors.length]}
            strokeWidth={2}
            dot={false}
            activeDot={{ ...ACTIVE_DOT, fill: colors[index % colors.length] }}
            connectNulls
            isAnimationActive={animate}
            animationDuration={600}
            animationEasing="ease-out"
          />
        ))}
      </LineChart>
    </ChartContainer>
  )
}
