import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { formatCurrency, formatCurrencyShort, formatDateTick } from '@/lib/formatters'
import { CHART_AXIS_COLOR, CHART_GRID_COLOR } from '@/constants/chartColors'
import { CHART_ANIMATION_THRESHOLD } from '@/constants'
import { chartTooltipProps } from '@/components/ui'

interface TimeSeriesLineChartProps {
  chartData: Array<Record<string, number | string>>
  seriesKeys: string[]
  colors: string[]
  legendFormatter?: (value: string) => string
  emptyMessage?: string
}

export default function TimeSeriesLineChart({
  chartData,
  seriesKeys,
  colors,
  legendFormatter,
  emptyMessage = 'No data available',
}: TimeSeriesLineChartProps) {
  if (chartData.length === 0 || seriesKeys.length === 0) {
    return (
      <div className="h-100 flex items-center justify-center text-muted-foreground">
        {emptyMessage}
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
        <XAxis
          dataKey="displayPeriod"
          stroke={CHART_AXIS_COLOR}
          tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }}
          tickFormatter={(v) => formatDateTick(v, chartData.length)}
          angle={-45}
          textAnchor="end"
          height={80}
          interval={Math.max(1, Math.floor(chartData.length / 20))}
        />
        <YAxis
          stroke={CHART_AXIS_COLOR}
          tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }}
          tickFormatter={(value) => formatCurrencyShort(value)}
        />
        <Tooltip
          {...chartTooltipProps}
          labelFormatter={(label) => new Date(label).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          formatter={(value: number | undefined) => formatCurrency(value ?? 0)}
        />
        <Legend
          wrapperStyle={{ paddingTop: '20px' }}
          formatter={legendFormatter}
        />
        {seriesKeys.map((key, index) => (
          <Line
            key={key}
            type="natural"
            dataKey={key}
            stroke={colors[index % colors.length]}
            strokeWidth={2}
            dot={false}
            connectNulls
            isAnimationActive={chartData.length < CHART_ANIMATION_THRESHOLD}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

export function exportChartAsCsv(
  filename: string,
  columns: string[],
  chartData: Array<Record<string, number | string>>,
) {
  const csvRows = ['Period,' + columns.join(',')]
  chartData.forEach((entry) => {
    const values = columns.map((c) => entry[c] ?? 0)
    csvRows.push(entry.displayPeriod + ',' + values.join(','))
  })
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
