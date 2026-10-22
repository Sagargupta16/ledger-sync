/**
 * Reusable area chart: gradient-filled series that draw in left to right and
 * morph with the data, on the in-house chart kit. Optional stacking, reference
 * lines and plot-only range zoom (presets above, a drag brush below).
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

import AreaSeries from '@/components/charts/AreaSeries'
import { CategoryAxis, ValueAxis } from '@/components/charts/Axis'
import CartesianChart from '@/components/charts/CartesianChart'
import CartesianTooltip from '@/components/charts/CartesianTooltip'
import ChartBrush from '@/components/charts/ChartBrush'
import Crosshair from '@/components/charts/Crosshair'
import Grid from '@/components/charts/Grid'
import type { Curve } from '@/components/charts/paths'
import { ReferenceLine } from '@/components/charts/References'
import ChartEmptyState from '@/components/shared/ChartEmptyState'
import ChartRangeControls from '@/components/ui/ChartRangeControls'
import ChartSeriesLegend from '@/components/ui/ChartSeriesLegend'
import { chartCellText, chartDataTable } from '@/components/ui/chartDataTable'
import { useChartRange } from '@/components/ui/useChartRange'
import { formatChartDate, formatChartPeriod } from '@/lib/chartDateLabels'
import { formatCurrency } from '@/lib/formatters'

interface AreaConfig {
  key: string
  color: string
  label?: string
  /** Default 'monotone'. */
  type?: Curve
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
   * Range presets above the chart and a drag-to-zoom brush below it, for long
   * series (5+ points). The zoom is plot-only: the legend and the data table
   * keep every row. Default off.
   */
  readonly showBrush?: boolean
  /** Accessible description of the chart (role=img); also captions the data table. */
  readonly ariaLabel?: string
}

/** Room under the plot for rotated period labels. */
const ANGLED_MARGIN = { bottom: 70 }

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
  const rows = data as readonly Record<string, unknown>[]
  const range = useChartRange(rows.map((row) => chartCellText(row[dataKey])))
  const formatLabel = tooltipLabelFormatter ?? formatChartDate
  const formatTick = xTickFormatter ?? ((value: string) => formatChartPeriod(value))

  if (data.length === 0) {
    return <ChartEmptyState message={emptyMessage} height={height} />
  }

  const formatValue = tooltipFormatter ?? formatCurrency
  const latest = rows.at(-1)
  const latestLabel = chartCellText(latest?.[dataKey])
  const zoomable = showBrush && data.length > 4
  const labelOf = (area: AreaConfig) => area.label ?? area.key

  return (
    <>
      {showLegend && (
        <ChartSeriesLegend
          items={areas.map((area) => {
            const value = latest?.[area.key]
            return {
              key: area.key,
              label: labelOf(area),
              color: area.color,
              value: typeof value === 'number' ? formatValue(value) : undefined,
            }
          })}
          caption={latestLabel ? `Latest: ${formatLabel(latestLabel)}` : undefined}
        />
      )}
      {zoomable && <ChartRangeControls range={range} />}
      <CartesianChart
        data={data}
        categoryKey={dataKey}
        series={areas.map((area) => ({ key: area.key, stackId: stacked ? 'stack' : area.stackId }))}
        // Reference values widen the axis so their lines stay on the plot.
        extraValues={referenceLines?.flatMap((ref) => (ref.y === undefined ? [] : [ref.y]))}
        visibleRange={zoomable ? range : undefined}
        margin={xAngle ? ANGLED_MARGIN : undefined}
        height={height}
        ariaLabel={ariaLabel}
        tooltip={(
          <CartesianTooltip
            series={areas.map((area) => ({ key: area.key, label: labelOf(area), color: area.color }))}
            formatLabel={formatLabel}
            formatValue={formatValue}
          />
        )}
      >
        <Grid />
        <Crosshair />
        {/* A caller's own y=0 line replaces the axis' automatic zero line. */}
        <ValueAxis zeroLine={!referenceLines?.some((ref) => ref.y === 0)} />
        <CategoryAxis tickFormatter={formatTick} angle={xAngle} interval="preserveStartEnd" />
        {areas.map((area, index) => (
          <AreaSeries
            key={area.key}
            dataKey={area.key}
            color={area.color}
            curve={area.type}
            strokeWidth={area.strokeWidth}
            dash={area.strokeDasharray}
            fillOpacity={area.fillOpacity}
            showFill={area.showFill}
            seriesIndex={index}
          />
        ))}
        {referenceLines?.map((ref) => (
          <ReferenceLine
            key={`${ref.y ?? ''}${ref.x ?? ''}${ref.label ?? ''}`}
            value={ref.y}
            category={ref.x}
            color={ref.color ?? 'var(--chart-reference-line-strong)'}
            dash={ref.strokeDasharray ?? '6 4'}
            label={ref.label}
          />
        ))}
      </CartesianChart>
      {zoomable && (
        <ChartBrush
          range={range}
          values={overviewValues(rows, stacked ? areas : areas.slice(0, 1))}
          color={areas[0]?.color}
          formatLabel={tooltipLabelFormatter ?? xTickFormatter}
          ariaLabel="Chart zoom"
        />
      )}
      {chartDataTable(
        rows,
        [
          {
            header: 'Period',
            rowHeader: true,
            value: (row) => formatLabel(chartCellText(row[dataKey])),
          },
          ...areas.map((area) => ({
            header: labelOf(area),
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

/** Brush overview per row: the total of `areas` (the stack, or the lead series); NaN where none has a number. */
function overviewValues(rows: readonly Record<string, unknown>[], areas: readonly AreaConfig[]): number[] {
  return rows.map((row) => {
    const values = areas.map((area) => row[area.key]).filter((value): value is number => typeof value === 'number')
    return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) : Number.NaN
  })
}
