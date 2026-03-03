/**
 * Reusable area chart wrapper with premium gradient fills.
 *
 * Usage:
 *   <StandardAreaChart
 *     data={chartData}
 *     areas={[
 *       { key: 'income', color: SEMANTIC_COLORS.income, label: 'Income' },
 *       { key: 'expense', color: SEMANTIC_COLORS.expense, label: 'Expense' },
 *     ]}
 *   />
 */

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts'
import { formatCurrency } from '@/lib/formatters'
import { chartTooltipProps, ChartContainer } from '@/components/ui'
import {
  GRID_DEFAULTS, xAxisDefaults, yAxisDefaults,
  areaGradient, areaGradientUrl, LEGEND_DEFAULTS, shouldAnimate, ACTIVE_DOT,
} from '@/components/ui/chartDefaults'
import ChartEmptyState from '@/components/shared/ChartEmptyState'

interface AreaConfig {
  key: string
  color: string
  label?: string
  type?: 'monotone' | 'natural' | 'linear' | 'step'
  strokeWidth?: number
  fillOpacity?: number
  /** Set false to show just a line with no area fill */
  showFill?: boolean
  stackId?: string
}

interface ReferenceLineConfig {
  y?: number
  x?: string
  label?: string
  color?: string
  strokeDasharray?: string
}

interface StandardAreaChartProps {
  readonly data: Array<Record<string, unknown>>
  readonly dataKey?: string
  readonly areas: AreaConfig[]
  readonly height?: number
  readonly showLegend?: boolean
  readonly emptyMessage?: string
  readonly tooltipFormatter?: (value: number) => string
  readonly tooltipLabelFormatter?: (label: string) => string
  readonly xTickFormatter?: (value: string) => string
  readonly xAngle?: number
  readonly referenceLines?: ReferenceLineConfig[]
  readonly stacked?: boolean
}

export default function StandardAreaChart({
  data,
  dataKey = 'displayPeriod',
  areas,
  height = 400,
  showLegend = true,
  emptyMessage,
  tooltipFormatter,
  tooltipLabelFormatter,
  xTickFormatter,
  xAngle,
  referenceLines,
  stacked = false,
}: StandardAreaChartProps) {
  if (data.length === 0) {
    return <ChartEmptyState message={emptyMessage} height={height} />
  }

  const animate = shouldAnimate(data.length)
  const xDefaults = xAxisDefaults(data.length, xAngle === undefined ? undefined : { angle: xAngle })
  const yDefaults = yAxisDefaults()

  return (
    <ChartContainer height={height}>
      <AreaChart
        data={data}
        margin={{ top: 8, right: 12, bottom: xAngle ? 20 : 8, left: 4 }}
      >
        <defs>
          {areas.map((area) =>
            (area.showFill ?? true) && areaGradient(area.key, area.color, area.fillOpacity ?? 0.3),
          )}
        </defs>
        <CartesianGrid {...GRID_DEFAULTS} />
        <XAxis
          dataKey={dataKey}
          {...xDefaults}
          {...(xTickFormatter && { tickFormatter: xTickFormatter })}
        />
        <YAxis {...yDefaults} />
        <Tooltip
          {...chartTooltipProps}
          formatter={(value: number | undefined) => (tooltipFormatter ?? formatCurrency)(value ?? 0)}
          {...(tooltipLabelFormatter && { labelFormatter: tooltipLabelFormatter as never })}
        />
        {showLegend && areas.length > 1 && (
          <Legend {...LEGEND_DEFAULTS} />
        )}
        {referenceLines?.map((ref) => (
          <ReferenceLine
            key={`${ref.y ?? ''}${ref.x ?? ''}${ref.label ?? ''}`}
            y={ref.y}
            x={ref.x}
            stroke={ref.color ?? 'rgba(255,255,255,0.2)'}
            strokeDasharray={ref.strokeDasharray ?? '6 4'}
            label={ref.label ? {
              value: ref.label,
              fill: '#71717a',
              fontSize: 11,
              position: 'insideTopRight',
            } : undefined}
          />
        ))}
        {areas.map((area) => (
          <Area
            key={area.key}
            type={area.type ?? 'monotone'}
            dataKey={area.key}
            name={area.label ?? area.key}
            stroke={area.color}
            strokeWidth={area.strokeWidth ?? 2}
            fill={(area.showFill ?? true) ? areaGradientUrl(area.key) : 'transparent'}
            fillOpacity={1}
            dot={false}
            activeDot={{ ...ACTIVE_DOT, fill: area.color }}
            connectNulls
            isAnimationActive={animate}
            animationDuration={800}
            animationEasing="ease-out"
            stackId={stacked ? 'stack' : area.stackId}
          />
        ))}
      </AreaChart>
    </ChartContainer>
  )
}
