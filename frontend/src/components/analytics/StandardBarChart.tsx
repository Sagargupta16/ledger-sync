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
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList, Cell, ReferenceLine,
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
  /** Per-row color function (alternative to cellColors). Receives the row and index, returns hex. */
  getCellColor?: (row: Record<string, unknown>, index: number) => string
  stackId?: string
  fillOpacity?: number
  radius?: [number, number, number, number]
  barSize?: number
}

interface ReferenceLineConfig {
  x?: number | string
  y?: number | string
  label?: string
  color?: string
  strokeDasharray?: string
}

type TooltipPayloadEntry = {
  payload?: Record<string, unknown>
}

interface StandardBarChartProps {
  readonly data: ReadonlyArray<object>
  readonly dataKey?: string
  readonly bars: BarConfig[]
  readonly height?: number
  readonly layout?: 'horizontal' | 'vertical'
  readonly showLabels?: boolean
  readonly showLegend?: boolean
  readonly emptyMessage?: string
  /** Simple single-value formatter. */
  readonly tooltipFormatter?: (value: number) => string
  /**
   * Advanced formatter that also receives the hovered row payload.
   * Use when the tooltip needs fields beyond the bar value (e.g. "score: N — avg: ₹X/mo").
   * Takes precedence over `tooltipFormatter` when both are provided.
   */
  readonly tooltipValueWithPayload?: (
    value: number,
    payload: Record<string, unknown>,
  ) => [string, string] | string
  readonly xTickFormatter?: (value: string | number) => string
  readonly yTickFormatter?: (value: string | number) => string
  readonly xAngle?: number
  readonly xHeight?: number
  readonly yWidth?: number
  readonly yCategoryKey?: string
  readonly xDomain?: [number | 'auto', number | 'auto']
  readonly xType?: 'number' | 'category'
  readonly yType?: 'number' | 'category'
  readonly barSize?: number
  readonly barGap?: number
  readonly stacked?: boolean
  readonly referenceLines?: ReferenceLineConfig[]
  readonly margin?: { top?: number; right?: number; bottom?: number; left?: number }
  /** Disable vertical grid line (useful for horizontal-layout bar charts). Default: inherit from GRID_DEFAULTS. */
  readonly hideVerticalGrid?: boolean
  readonly hideHorizontalGrid?: boolean
}

function resolveCellColor(
  bar: BarConfig,
  row: Record<string, unknown>,
  index: number,
): string | undefined {
  if (bar.getCellColor) return bar.getCellColor(row, index)
  if (bar.cellColors && bar.cellColors[index] !== undefined) return bar.cellColors[index]
  return undefined
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
  tooltipValueWithPayload,
  xTickFormatter,
  yTickFormatter,
  xAngle,
  xHeight,
  yWidth,
  yCategoryKey,
  xDomain,
  xType,
  yType,
  barSize,
  barGap,
  stacked = false,
  referenceLines,
  margin,
  hideVerticalGrid,
  hideHorizontalGrid,
}: StandardBarChartProps) {
  if (data.length === 0) {
    return <ChartEmptyState message={emptyMessage} height={height} />
  }

  const animate = shouldAnimate(data.length)
  const xOpts = xAngle === undefined ? undefined : { angle: xAngle, height: xHeight }
  const xDefaults = xAxisDefaults(data.length, xOpts)
  const yDefaults = yAxisDefaults({
    ...(yWidth !== undefined && { width: yWidth }),
    ...(layout === 'vertical' && yCategoryKey !== undefined && { currency: false }),
  })

  const chartMargin = {
    top: margin?.top ?? 8,
    right: margin?.right ?? 12,
    bottom: margin?.bottom ?? (xAngle ? 20 : 8),
    left: margin?.left ?? 4,
  }

  const gridProps = {
    ...GRID_DEFAULTS,
    ...(hideVerticalGrid !== undefined && { vertical: !hideVerticalGrid }),
    ...(hideHorizontalGrid !== undefined && { horizontal: !hideHorizontalGrid }),
  }

  const tooltipFormatterProp = tooltipValueWithPayload
    ? (
        value: number | undefined,
        _name: string | undefined,
        entry: TooltipPayloadEntry,
      ): [string, string] | string =>
        tooltipValueWithPayload(value ?? 0, entry.payload ?? {})
    : (value: number | undefined): string => (tooltipFormatter ?? formatCurrency)(value ?? 0)

  const referenceLineLabel = (label: string) => ({
    value: label,
    fill: 'rgba(255,255,255,0.45)',
    fontSize: 10,
  })

  return (
    <ChartContainer height={height}>
      <BarChart
        data={data}
        layout={layout}
        margin={chartMargin}
        barGap={barGap}
      >
        <CartesianGrid {...gridProps} />
        <XAxis
          dataKey={layout === 'vertical' ? undefined : dataKey}
          type={xType ?? (layout === 'vertical' ? 'number' : 'category')}
          domain={xDomain}
          {...xDefaults}
          {...(xTickFormatter && { tickFormatter: xTickFormatter })}
        />
        <YAxis
          dataKey={layout === 'vertical' ? yCategoryKey : undefined}
          type={yType ?? (layout === 'vertical' ? 'category' : 'number')}
          {...yDefaults}
          {...(yTickFormatter && { tickFormatter: yTickFormatter })}
        />
        <Tooltip
          {...chartTooltipProps}
          formatter={tooltipFormatterProp as never}
        />
        {referenceLines?.map((ref) => (
          <ReferenceLine
            key={`${ref.x ?? ''}${ref.y ?? ''}${ref.label ?? ''}`}
            x={ref.x}
            y={ref.y}
            stroke={ref.color ?? 'rgba(255,255,255,0.25)'}
            strokeDasharray={ref.strokeDasharray ?? '3 3'}
            label={ref.label ? referenceLineLabel(ref.label) : undefined}
          />
        ))}
        {showLegend && bars.length > 1 && (
          <Legend {...LEGEND_DEFAULTS} />
        )}
        {bars.map((bar) => (
          <Bar
            key={bar.key}
            dataKey={bar.key}
            name={bar.label ?? bar.key}
            fill={bar.color}
            fillOpacity={bar.fillOpacity}
            radius={bar.radius ?? BAR_RADIUS}
            isAnimationActive={animate}
            animationDuration={600}
            animationEasing="ease-out"
            maxBarSize={bar.barSize ?? barSize ?? 48}
            barSize={bar.barSize}
            stackId={stacked ? 'stack' : bar.stackId}
          >
            {(bar.cellColors || bar.getCellColor) && data.map((row, i) => {
              const color = resolveCellColor(bar, row as Record<string, unknown>, i)
              return color ? <Cell key={`${bar.key}-${i}`} fill={color} /> : null
            })}
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
