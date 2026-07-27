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

import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList,
} from 'recharts'

import { formatCurrency } from '@/lib/formatters'
import { chartTooltipProps, ChartContainer } from '@/components/ui'
import {
  GRID_DEFAULTS, xAxisDefaults, yAxisDefaults,
  BAR_RADIUS, LEGEND_DEFAULTS, shouldAnimate,
} from '@/components/ui/chartDefaults'
import { barLabelFormatter, barLabelStyle } from '@/lib/chartUtils'
import ChartEmptyState from '@/components/shared/ChartEmptyState'

import {
  buildChartMargin, buildGridProps, renderBarShape, renderBarDataTable,
  renderReferenceLine, renderBaseline,
  type BarConfig, type BaselineProp, type ReferenceLineConfig,
} from './standardBarChartParts'

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
   * Use when the tooltip needs fields beyond the bar value (e.g. "score: N -- avg: ₹X/mo").
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
  /**
   * Draw a median baseline across the first bar series so a reader can tell
   * which bars are unusual, not just how tall each one is. Opt-in -- off by
   * default so existing charts are unaffected. Only valid for the default
   * horizontal layout (a y-axis line means nothing on a ranking chart).
   *
   * Pass `true` to summarize every point, or an options object to scope it to a
   * trailing window (chronological series only) or switch the statistic.
   */
  readonly baseline?: BaselineProp
  readonly margin?: { top?: number; right?: number; bottom?: number; left?: number }
  /** Disable vertical grid line (useful for horizontal-layout bar charts). Default: inherit from GRID_DEFAULTS. */
  readonly hideVerticalGrid?: boolean
  readonly hideHorizontalGrid?: boolean
  /**
   * Per-bar click handler. Receives the clicked row's `dataKey` value (the
   * category/label) so callers can deep-link (e.g. to a filtered list). When
   * set, bars render with a pointer cursor.
   */
  readonly onBarClick?: (label: string) => void
  /**
   * Accessible description of the chart, forwarded to ChartContainer (role=img).
   * Pass this rather than wrapping the chart in your own `role="img"` div -- such
   * a wrapper also encloses the sr-only data table below, and ARIA presentational
   * children would hide it from screen readers again.
   */
  readonly ariaLabel?: string
  /**
   * Header for the sr-only table's row-label column. Defaults to `Period` for
   * the time-series (horizontal) layout and `Category` for the vertical ranking
   * layout, where rows are categories rather than time buckets.
   */
  readonly rowHeaderLabel?: string
}

function buildTooltipFormatter(
  tooltipValueWithPayload: StandardBarChartProps['tooltipValueWithPayload'],
  tooltipFormatter: StandardBarChartProps['tooltipFormatter'],
) {
  if (tooltipValueWithPayload) {
    return (
      value: number | undefined,
      _name: string | undefined,
      entry: TooltipPayloadEntry,
    ): [string, string] | string =>
      tooltipValueWithPayload(value ?? 0, entry.payload ?? {})
  }
  return (value: number | undefined): string => (tooltipFormatter ?? formatCurrency)(value ?? 0)
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
  baseline,
  margin,
  hideVerticalGrid,
  hideHorizontalGrid,
  onBarClick,
  ariaLabel,
  rowHeaderLabel,
}: StandardBarChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  if (data.length === 0) {
    return <ChartEmptyState message={emptyMessage} height={height} />
  }

  // Hover-isolate only makes sense for a single-series ranking chart. With
  // grouped/stacked bars, dimming by row index would fade unrelated series.
  const isolateOnHover = bars.length === 1 && !stacked
  const animate = shouldAnimate(data.length)
  const xOpts = xAngle === undefined ? undefined : { angle: xAngle, height: xHeight }
  const xDefaults = xAxisDefaults(data.length, xOpts)
  const yDefaults = yAxisDefaults({
    ...(yWidth !== undefined && { width: yWidth }),
    ...(layout === 'vertical' && yCategoryKey !== undefined && { currency: false }),
  })

  const chartMargin = buildChartMargin(margin, xAngle)
  const gridProps = buildGridProps(GRID_DEFAULTS, hideVerticalGrid, hideHorizontalGrid)
  const tooltipFormatterProp = buildTooltipFormatter(tooltipValueWithPayload, tooltipFormatter)
  // Row label comes from the category axis, which swaps sides with the layout.
  const isRanking = layout === 'vertical'
  const labelKey = isRanking ? (yCategoryKey ?? dataKey) : dataKey
  const rowHeaderName = rowHeaderLabel ?? (isRanking ? 'Category' : 'Period')

  return (
    <>
      <ChartContainer height={height} ariaLabel={ariaLabel}>
        <BarChart
          data={data}
          layout={layout}
          margin={chartMargin}
          barGap={barGap}
        >
          <CartesianGrid {...gridProps} />
          <XAxis
            dataKey={isRanking ? undefined : dataKey}
            type={xType ?? (isRanking ? 'number' : 'category')}
            domain={xDomain}
            {...xDefaults}
            {...(xTickFormatter && { tickFormatter: xTickFormatter })}
          />
          <YAxis
            dataKey={isRanking ? yCategoryKey : undefined}
            type={yType ?? (isRanking ? 'category' : 'number')}
            {...yDefaults}
            {...(yTickFormatter && { tickFormatter: yTickFormatter })}
          />
          <Tooltip
            {...chartTooltipProps}
            formatter={tooltipFormatterProp as never}
          />
          {referenceLines?.map(renderReferenceLine)}
          {renderBaseline(baseline, data, bars, layout)}
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
              shape={renderBarShape(bar, activeIndex, isolateOnHover)}
              isAnimationActive={animate}
              animationDuration={600}
              animationEasing="ease-out"
              maxBarSize={bar.barSize ?? barSize ?? 48}
              barSize={bar.barSize}
              stackId={stacked ? 'stack' : bar.stackId}
              cursor={onBarClick ? 'pointer' : undefined}
              onMouseEnter={
                isolateOnHover
                  ? (_entry: unknown, index: number) => setActiveIndex(index)
                  : undefined
              }
              onMouseLeave={isolateOnHover ? () => setActiveIndex(null) : undefined}
              onClick={
                onBarClick
                  ? (entry: unknown) => {
                      const row = (entry as { payload?: Record<string, unknown> })?.payload
                      const label = row?.[dataKey]
                      if (typeof label === 'string') onBarClick(label)
                    }
                  : undefined
              }
            >
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
      {/* Screen-reader fallback, rendered as a SIBLING of ChartContainer --
          inside it, the role="img" wrapper would make it presentational.
          Call sites must pass `ariaLabel` rather than wrapping this component in
          their own role="img" div, which would swallow the table too. */}
      {renderBarDataTable(
        data,
        bars,
        labelKey,
        rowHeaderName,
        ariaLabel ?? 'Chart data',
        tooltipFormatter ?? formatCurrency,
      )}
    </>
  )
}
