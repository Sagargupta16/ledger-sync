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

import { useId } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Brush } from 'recharts'
import { formatCurrency } from '@/lib/formatters'
import { chartTooltipProps, ChartContainer } from '@/components/ui'
import { CHART_LINE_CURSOR_STYLE } from '@/components/ui/ChartTooltip'
import ChartTooltipContent from '@/components/ui/ChartTooltipContent'
import ChartSeriesLegend from '@/components/ui/ChartSeriesLegend'
import { useChartPresentation } from '@/components/ui/useChartPresentation'
import {
  GRID_DEFAULTS, xAxisDefaults, yAxisDefaults,
  areaGradient, areaGradientUrl, ACTIVE_DOT, BRUSH_DEFAULTS, referenceLine,
} from '@/components/ui/chartDefaults'
import { CHART_TEXT, CHART_SURFACE } from '@/constants/chartColors'
import ChartEmptyState from '@/components/shared/ChartEmptyState'
import { chartCellText, chartDataTable } from '@/components/ui/chartDataTable'

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
  const chartId = useId().replaceAll(':', '')
  const { animate, isMobile } = useChartPresentation(data.length)

  if (data.length === 0) {
    return <ChartEmptyState message={emptyMessage} height={height} />
  }

  const xDefaults = xAxisDefaults(data.length, xAngle === undefined ? undefined : { angle: xAngle })
  const yDefaults = yAxisDefaults({ width: isMobile ? 48 : 56 })
  const rows = data as readonly Record<string, unknown>[]
  const formatValue = tooltipFormatter ?? formatCurrency
  const latest = rows.at(-1)
  const latestLabel = chartCellText(latest?.[dataKey])
  const hasNegative = rows.some((row) => areas.some((area) => Number(row[area.key]) < 0))

  return (
    <>
      {showLegend && (
        <ChartSeriesLegend
          items={areas.map((area) => {
            const value = latest?.[area.key]
            return {
              key: area.key,
              label: area.label ?? area.key,
              color: area.color,
              value: typeof value === 'number' ? formatValue(value) : undefined,
            }
          })}
          caption={latestLabel ? `Latest: ${tooltipLabelFormatter?.(latestLabel) ?? latestLabel}` : undefined}
        />
      )}
      <ChartContainer height={height} ariaLabel={ariaLabel}>
        <AreaChart
          data={data}
          margin={{ top: 16, right: isMobile ? 8 : 16, bottom: xAngle ? 20 : 8, left: 0 }}
        >
          <defs>
            {areas.map((area, index) =>
              (area.showFill ?? true) && areaGradient(`${chartId}-${index}`, area.color, area.fillOpacity ?? 0.22),
            )}
          </defs>
          <CartesianGrid {...GRID_DEFAULTS} />
          <XAxis
            dataKey={dataKey}
            {...xDefaults}
            interval={isMobile ? 'preserveStartEnd' : xDefaults.interval}
            {...(xTickFormatter && { tickFormatter: xTickFormatter })}
          />
          <YAxis {...yDefaults} />
          <Tooltip
            {...chartTooltipProps}
            cursor={CHART_LINE_CURSOR_STYLE}
            content={<ChartTooltipContent />}
            formatter={(value) => formatValue(typeof value === 'number' ? value : 0)}
            {...(tooltipLabelFormatter && { labelFormatter: tooltipLabelFormatter as never })}
          />
          {hasNegative && !referenceLines?.some((ref) => ref.y === 0) && referenceLine({ y: 0, variant: 'zero' })}
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
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                offset: 8,
                position: 'insideTopRight',
              } : undefined}
            />
          ))}
          {areas.map((area, index) => (
            <Area
              key={area.key}
              type={area.type ?? 'monotone'}
              dataKey={area.key}
              name={area.label ?? area.key}
              stroke={area.color}
              strokeWidth={area.strokeWidth ?? 2.25}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={area.strokeDasharray}
              fill={(area.showFill ?? true) ? areaGradientUrl(`${chartId}-${index}`) : 'transparent'}
              fillOpacity={1}
              dot={rows.filter((row) => typeof row[area.key] === 'number').length === 1
                ? { r: 3, fill: area.color, strokeWidth: 0 }
                : false}
              activeDot={{ ...ACTIVE_DOT, fill: area.color }}
              connectNulls
              isAnimationActive={animate}
              animationDuration={520}
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
      {showBrush && data.length > 4 && (
        <p className="mt-2 text-right text-[11px] text-muted-foreground">
          Drag the handles to inspect a period.
        </p>
      )}
      {chartDataTable(
        rows,
        [
          {
            header: 'Period',
            rowHeader: true,
            value: (row) => {
              const label = chartCellText(row[dataKey])
              return xTickFormatter ? xTickFormatter(label) : label
            },
          },
          ...areas.map((area) => ({
            header: area.label ?? area.key,
            value: (row: Record<string, unknown>) => {
              const value = row[area.key]
              return typeof value === 'number' ? formatValue(value) : chartCellText(value)
            },
          })),
        ],
        ariaLabel ?? 'Area chart data',
        (row, index) => `${chartCellText(row[dataKey]) || 'row'}-${index}`,
      )}
    </>
  )
}
