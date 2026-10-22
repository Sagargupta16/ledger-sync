/**
 * Reusable bar chart on the in-house chart kit: columns over time, or a ranking
 * (`layout="vertical"`), with one or more series side by side or stacked. Once
 * the chart scrolls into view the bars grow out of the zero line in a stagger,
 * each later side-by-side series a beat behind the first; a data or zoom change
 * then morphs them, and negative values grow downward.
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

import { useLayoutEffect, useMemo, useState, type ReactNode } from 'react'

import { CategoryAxis, ValueAxis } from '@/components/charts/Axis'
import Bars from '@/components/charts/Bars'
import CartesianChart from '@/components/charts/CartesianChart'
import CartesianTooltip from '@/components/charts/CartesianTooltip'
import ChartBrush from '@/components/charts/ChartBrush'
import { FrameContext, useChartFrame } from '@/components/charts/chartContext'
import Crosshair from '@/components/charts/Crosshair'
import Grid from '@/components/charts/Grid'
import { ReferenceLine } from '@/components/charts/References'
import ChartEmptyState from '@/components/shared/ChartEmptyState'
import { BAR_RADIUS } from '@/components/ui/chartDefaults'
import ChartSeriesLegend from '@/components/ui/ChartSeriesLegend'
import type { ChartRangeControl } from '@/components/ui/useChartRange'
import { useIsMobile } from '@/hooks/useIsMobile'
import { formatChartDate } from '@/lib/chartDateLabels'
import { formatCurrency } from '@/lib/formatters'

import {
  barFill, barSlots, baselineValue, leadSeries, referenceLineProps, renderBarDataTable,
  type BarConfig, type BaselineProp, type ReferenceLineConfig,
} from './standardBarChartParts'

/** Px reserved left of the plot for its labels: values in columns, names in a ranking (desktop, phone). */
const AXIS_WIDTH = { horizontal: [56, 48], vertical: [112, 84] } as const
/** Seconds each later side-by-side series waits before its bars start to grow. */
const GROUP_OFFSET = 0.08

interface StandardBarChartProps {
  readonly data: ReadonlyArray<object>
  /** Row field holding the category; `onBarClick` receives its value. */
  readonly dataKey?: string
  readonly bars: BarConfig[]
  readonly height?: number
  /** `vertical` is a ranking: categories down the left (`yCategoryKey`), values along the bottom. */
  readonly layout?: 'horizontal' | 'vertical'
  readonly showLegend?: boolean
  readonly emptyMessage?: string
  /** Value format in the tooltip and the screen-reader table (default formatCurrency). */
  readonly tooltipFormatter?: (value: number) => string
  /** Tooltip heading from the raw category (default formatChartDate). */
  readonly tooltipLabelFormatter?: (label: string) => string
  /** Bottom-axis labels: categories in columns, values in a ranking. */
  readonly xTickFormatter?: (value: string | number) => string
  /** Left-axis labels: values in columns, categories in a ranking. */
  readonly yTickFormatter?: (value: string | number) => string
  /** Px for the left-axis labels (default 56, 48 on phones; rankings 112, 84 on phones). */
  readonly yWidth?: number
  /** Ranking only: the row field naming each category (default `dataKey`). */
  readonly yCategoryKey?: string
  readonly stacked?: boolean
  /**
   * Plot-only zoom from useChartRange: the plot shows the selected window and a
   * brush under it drags or steps the window. The accessible table keeps every
   * row. Columns only; pair it with ChartRangeControls above the chart.
   */
  readonly range?: ChartRangeControl
  readonly referenceLines?: ReferenceLineConfig[]
  /**
   * Opt-in median line across the first series, so a reader can tell which bars
   * are unusual, not just how tall each one is. Columns only (a value line across
   * a ranking means nothing). `true` summarizes every point; options scope it to
   * a trailing window (chronological series only) or switch the statistic.
   */
  readonly baseline?: BaselineProp
  /** Space around the plot, axis labels included; `left` defaults to the axis width (`yWidth`). */
  readonly margin?: { top?: number; right?: number; bottom?: number; left?: number }
  /** Hide the vertical or horizontal grid lines; by default only the value-tick lines show. */
  readonly hideVerticalGrid?: boolean
  readonly hideHorizontalGrid?: boolean
  /**
   * Per-bar click handler; receives the row's `dataKey` value so callers can
   * deep-link. Bars then take a pointer cursor and Enter or Space selects one.
   */
  readonly onBarClick?: (label: string) => void
  /**
   * Accessible description of the chart, announced as one image. Pass this
   * rather than wrapping the chart in your own `role="img"` div -- such a
   * wrapper also encloses the sr-only data table below, and ARIA presentational
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

export default function StandardBarChart({
  data,
  dataKey = 'displayPeriod',
  bars,
  height = 400,
  layout = 'horizontal',
  showLegend = true,
  emptyMessage,
  tooltipFormatter,
  tooltipLabelFormatter,
  xTickFormatter,
  yTickFormatter,
  yWidth,
  yCategoryKey,
  stacked = false,
  range,
  referenceLines,
  baseline,
  margin,
  hideVerticalGrid,
  hideHorizontalGrid,
  onBarClick,
  ariaLabel,
  rowHeaderLabel,
}: StandardBarChartProps) {
  const isMobile = useIsMobile()

  if (data.length === 0) {
    return <ChartEmptyState message={emptyMessage} height={height} />
  }

  const isRanking = layout === 'vertical'
  // Row label comes from the category axis, which swaps sides with the layout.
  const labelKey = isRanking ? (yCategoryKey ?? dataKey) : dataKey
  const [categoryFormat, valueFormat] = isRanking ? [yTickFormatter, xTickFormatter] : [xTickFormatter, yTickFormatter]
  const slots = barSlots(bars, stacked)
  const typical = baselineValue(baseline, data, bars, layout)
  const lines = (referenceLines ?? []).map((ref) => referenceLineProps(ref, layout))
  // A reference outside the data's span would otherwise fall off the value axis.
  const extraValues = [...lines, ...(typical ? [typical] : [])].flatMap((line) => line.value ?? [])
  const zoom = isRanking ? undefined : range
  const formatValue = tooltipFormatter ?? formatCurrency
  const series = bars.map((bar) => ({ key: bar.key, label: bar.label ?? bar.key, color: bar.color }))
  const select = onBarClick && ((row: Record<string, unknown>) => {
    const label = row[dataKey]
    if (typeof label === 'string') onBarClick(label)
  })

  return (
    <>
      {showLegend && bars.length > 1 && <ChartSeriesLegend items={series} />}
      <CartesianChart
        data={data}
        categoryKey={labelKey}
        series={bars.map((bar, index) => ({ key: bar.key, stackId: slots[index].stackId }))}
        layout={layout}
        categoryKind="band"
        extraValues={extraValues}
        visibleRange={zoom}
        margin={{ left: yWidth ?? AXIS_WIDTH[layout][isMobile ? 1 : 0], ...margin }}
        height={height}
        ariaLabel={ariaLabel}
        tooltip={
          <CartesianTooltip
            series={series}
            formatLabel={tooltipLabelFormatter ?? formatChartDate}
            formatValue={formatValue}
          />
        }
      >
        <Grid hideHorizontal={hideHorizontalGrid} hideVertical={hideVerticalGrid} />
        <Crosshair />
        {/* The axis draws the zero line itself unless a configured line already sits at 0. */}
        <ValueAxis tickFormatter={valueFormat} zeroLine={!lines.some((line) => line.value === 0)} />
        <CategoryAxis tickFormatter={categoryFormat} interval={isRanking ? 0 : 'preserveStartEnd'} />
        {bars.map((bar, index) => (
          <SeriesEntrance key={bar.key} delay={slots[index].groupIndex * GROUP_OFFSET}>
            <Bars
              dataKey={bar.key}
              color={bar.color}
              colorFor={(row, rowIndex) => barFill(bar, row, rowIndex)}
              fillOpacity={bar.fillOpacity}
              radius={Math.max(...(bar.radius ?? BAR_RADIUS))}
              stackKeys={slots[index].stackKeys}
              groupIndex={slots[index].groupIndex}
              groupCount={slots[index].groupCount}
              barSize={bar.barSize}
              // Crosshair already bands the active slot; a second band would double its tint.
              highlightBand={false}
              onSelect={select}
            />
          </SeriesEntrance>
        ))}
        {lines.map((line) => (
          <ReferenceLine key={`${line.value ?? ''}|${line.category ?? ''}|${line.label ?? ''}`} {...line} />
        ))}
        {typical && <ReferenceLine value={typical.value} variant="avg" label={typical.label} />}
      </CartesianChart>
      {zoom && <ChartBrush range={zoom} values={leadSeries(data, bars)} />}
      {/* Screen-reader fallback, rendered as a SIBLING of the chart -- inside its
          role="img" frame it would be presentational. Call sites must pass
          `ariaLabel` rather than wrapping this component in their own
          role="img" div, which would swallow the table too. */}
      {renderBarDataTable(
        data,
        bars,
        labelKey,
        rowHeaderLabel ?? (isRanking ? 'Category' : 'Period'),
        ariaLabel ?? 'Chart data',
        formatValue,
      )}
    </>
  )
}

/**
 * Holds a later series' entrance back by `delay` seconds after the chart
 * enters, so grouped bars rise a beat apart. Bars read `entered` from the
 * frame. A chart that has already entered (new data, a remount) or does not
 * animate shows the series at once.
 */
function SeriesEntrance({ delay, children }: { readonly delay: number; readonly children: ReactNode }) {
  const frame = useChartFrame()
  const [held, setHeld] = useState(() => delay > 0 && frame.animate && !frame.entered)
  // A layout effect starts the wait at the commit that enters the chart, not after
  // the first series has set up its bars, so the gap stays near `delay`.
  useLayoutEffect(() => {
    if (!held || !frame.entered) return
    const timer = setTimeout(() => setHeld(false), delay * 1000)
    return () => clearTimeout(timer)
  }, [held, frame.entered, delay])
  const value = useMemo(
    () => ({ ...frame, entered: frame.entered && (!held || !frame.animate) }),
    [frame, held],
  )
  return <FrameContext.Provider value={value}>{children}</FrameContext.Provider>
}
