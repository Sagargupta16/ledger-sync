import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { formatCurrency } from '@/lib/formatters'
import { chartTooltipProps, ChartContainer } from '@/components/ui'
import {
  GRID_DEFAULTS, xAxisDefaults, yAxisDefaults, LEGEND_DEFAULTS, shouldAnimate,
} from '@/components/ui/chartDefaults'
import ChartEmptyState from '@/components/shared/ChartEmptyState'

interface TimeSeriesLineChartProps {
  readonly chartData: Array<Record<string, number | string>>
  readonly seriesKeys: string[]
  readonly colors: string[]
  readonly legendFormatter?: (value: string) => string
  readonly emptyMessage?: string
  readonly height?: number
}

export default function TimeSeriesLineChart({
  chartData,
  seriesKeys,
  colors,
  legendFormatter,
  emptyMessage = 'No data available',
  height = 400,
}: TimeSeriesLineChartProps) {
  if (chartData.length === 0 || seriesKeys.length === 0) {
    return <ChartEmptyState message={emptyMessage} height={height} />
  }

  const animate = shouldAnimate(chartData.length)

  return (
    <ChartContainer height={height}>
      <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 20, left: 4 }}>
        <CartesianGrid {...GRID_DEFAULTS} />
        <XAxis
          dataKey="displayPeriod"
          {...xAxisDefaults(chartData.length, { angle: -45, dateFormatter: true })}
          height={80}
        />
        <YAxis {...yAxisDefaults()} />
        <Tooltip
          {...chartTooltipProps}
          labelFormatter={(label) => new Date(label).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          formatter={(value: number | undefined) => formatCurrency(value ?? 0)}
          itemSorter={(item) => -(item.value as number)}
        />
        <Legend {...LEGEND_DEFAULTS} formatter={legendFormatter} />
        {seriesKeys.map((key, index) => (
          <Line
            key={key}
            type="natural"
            dataKey={key}
            stroke={colors[index % colors.length]}
            strokeWidth={2}
            dot={false}
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
