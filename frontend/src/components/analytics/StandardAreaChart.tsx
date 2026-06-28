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
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, Brush,
} from 'recharts'
import { formatCurrency } from '@/lib/formatters'
import { chartTooltipProps, ChartContainer } from '@/components/ui'
import {
  GRID_DEFAULTS, xAxisDefaults, yAxisDefaults,
  areaGradient, areaGradientUrl, LEGEND_DEFAULTS, shouldAnimate, ACTIVE_DOT,
  BRUSH_DEFAULTS,
} from '@/components/ui/chartDefaults'
import { CHART_TEXT, CHART_SURFACE } from '@/constants/chartColors'
import ChartEmptyState from '@/components/shared/ChartEmptyState'

interface AreaConfig {
  key: string
  color: string
  label?: string
  type?: 'monotone' | 'natural' | 'linear' | 'step'
  strokeWidth?: number
  strokeDasharray?: string
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
  readonly data: ReadonlyArray<object>
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
  /**
   * Show a Recharts ``<Brush>`` below the chart for drag-to-zoom on the
   * x-axis. Useful for long time-series (>~12 points) where the user wants
   * to inspect a sub-range without changing the global filter. Default off.
   */
  readonly showBrush?: boolean
  /** Accessible description of the chart, forwarded to ChartContainer (role=img). */
  readonly ariaLabel?: string
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
  showBrush = false,
  ariaLabel,
}: StandardAreaChartProps) {
  if (data.length === 0) {
    return <ChartEmptyState message={emptyMessage} height={height} />
  }

  const animate = shouldAnimate(data.length)
  const xDefaults = xAxisDefaults(data.length, xAngle === undefined ? undefined : { angle: xAngle })
  const yDefaults = yAxisDefaults()

  return (
    <ChartContainer height={height} ariaLabel={ariaLabel}>
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
          formatter={(value) => (tooltipFormatter ?? formatCurrency)(typeof value === 'number' ? value : 0)}
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
            stroke={ref.color ?? CHART_SURFACE.referenceLineStrong}
            strokeDasharray={ref.strokeDasharray ?? '6 4'}
            label={ref.label ? {
              value: ref.label,
              fill: CHART_TEXT.subtle,
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
            strokeDasharray={area.strokeDasharray}
            fill={(area.showFill ?? true) ? areaGradientUrl(area.key) : 'transparent'}
            fillOpacity={1}
            dot={false}
            activeDot={{ ...ACTIVE_DOT, fill: area.color }}
            connectNulls
            isAnimationActive={animate}
            animationDuration={600}
            animationEasing="ease-out"
            stackId={stacked ? 'stack' : area.stackId}
          />
        ))}
        {showBrush && data.length > 4 && (
          <Brush
            {...BRUSH_DEFAULTS}
            dataKey={dataKey}
            tickFormatter={xTickFormatter}
            // Default to showing the most recent ~quarter of the data so the
            // chart still reads at full fidelity on first paint.
            startIndex={Math.max(0, data.length - Math.ceil(data.length / 4))}
          />
        )}
      </AreaChart>
    </ChartContainer>
  )
}
