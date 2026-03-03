/**
 * Reusable bar chart wrapper with standardized premium styling.
 *
 * Usage:
 *   <StandardBarChart
 *     data={chartData}
 *     dataKey="period"
 *     bars={[
 *       { key: 'income', color: SEMANTIC_COLORS.income, label: 'Income' },
 *       { key: 'expense', color: SEMANTIC_COLORS.expense, label: 'Expense' },
 *     ]}
 *   />
 */

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList, Cell,
} from 'recharts'
import { formatCurrency } from '@/lib/formatters'
import { chartTooltipProps, ChartContainer } from '@/components/ui'
import {
  GRID_DEFAULTS, xAxisDefaults, yAxisDefaults,
  BAR_RADIUS, LEGEND_DEFAULTS, shouldAnimate,
} from '@/components/ui/chartDefaults'
import { barLabelFormatter, barLabelStyle } from '@/lib/chartUtils'
import ChartEmptyState from '@/components/shared/ChartEmptyState'

interface BarConfig {
  key: string
  color: string
  label?: string
  /** Per-item colors: provide an array matching data length */
  cellColors?: string[]
  stackId?: string
}

interface StandardBarChartProps {
  readonly data: Array<Record<string, unknown>>
  readonly dataKey?: string
  readonly bars: BarConfig[]
  readonly height?: number
  readonly layout?: 'horizontal' | 'vertical'
  readonly showLabels?: boolean
  readonly showLegend?: boolean
  readonly emptyMessage?: string
  readonly tooltipFormatter?: (value: number) => string
  readonly xTickFormatter?: (value: string) => string
  readonly yTickFormatter?: (value: number) => string
  readonly xAngle?: number
  readonly barSize?: number
  readonly stacked?: boolean
}

export default function StandardBarChart({
  data,
  dataKey = 'displayPeriod',
  bars,
  height = 400,
  layout = 'horizontal',
  showLabels = false,
  showLegend = true,
  emptyMessage,
  tooltipFormatter,
  xTickFormatter,
  yTickFormatter,
  xAngle,
  barSize,
  stacked = false,
}: StandardBarChartProps) {
  if (data.length === 0) {
    return <ChartEmptyState message={emptyMessage} height={height} />
  }

  const animate = shouldAnimate(data.length)
  const xDefaults = xAxisDefaults(data.length, xAngle !== undefined ? { angle: xAngle } : undefined)
  const yDefaults = yAxisDefaults()

  return (
    <ChartContainer height={height}>
      <BarChart
        data={data}
        layout={layout}
        margin={{ top: 8, right: 12, bottom: xAngle ? 20 : 8, left: 4 }}
      >
        <CartesianGrid {...GRID_DEFAULTS} />
        <XAxis
          dataKey={dataKey}
          {...xDefaults}
          {...(xTickFormatter && { tickFormatter: xTickFormatter })}
        />
        <YAxis
          {...yDefaults}
          {...(yTickFormatter && { tickFormatter: yTickFormatter })}
        />
        <Tooltip
          {...chartTooltipProps}
          formatter={(value: number | undefined) => (tooltipFormatter ?? formatCurrency)(value ?? 0)}
        />
        {showLegend && bars.length > 1 && (
          <Legend {...LEGEND_DEFAULTS} />
        )}
        {bars.map((bar) => (
          <Bar
            key={bar.key}
            dataKey={bar.key}
            name={bar.label ?? bar.key}
            fill={bar.color}
            radius={BAR_RADIUS}
            isAnimationActive={animate}
            animationDuration={600}
            animationEasing="ease-out"
            maxBarSize={barSize ?? 48}
            stackId={stacked ? 'stack' : bar.stackId}
          >
            {bar.cellColors && bar.cellColors.map((c, i) => (
              <Cell key={i} fill={c} />
            ))}
            {showLabels && (
              <LabelList
                dataKey={bar.key}
                position="top"
                formatter={barLabelFormatter as never}
                style={barLabelStyle}
              />
            )}
          </Bar>
        ))}
      </BarChart>
    </ChartContainer>
  )
}
