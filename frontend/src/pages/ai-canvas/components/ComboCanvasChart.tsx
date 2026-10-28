import { CategoryAxis, ValueAxis } from '@/components/charts/Axis'
import Bars from '@/components/charts/Bars'
import CartesianChart from '@/components/charts/CartesianChart'
import CartesianTooltip from '@/components/charts/CartesianTooltip'
import Crosshair from '@/components/charts/Crosshair'
import Grid from '@/components/charts/Grid'
import LineSeries from '@/components/charts/LineSeries'
import ChartSeriesLegend from '@/components/ui/ChartSeriesLegend'
import { chartDataTable } from '@/components/ui/chartDataTable'
import { formatChartDate } from '@/lib/chartDateLabels'

import { tickFormatter, valueFormatter } from '../chartFormat'
import type { ChartRow, ChartSeries, ChartSpec, ValueFormat } from '../chartSpec'
import { CANVAS_CHART_HEIGHT, type CanvasChartProps } from './canvasColors'

const RATE_LABEL = /rate|%|percent|share|ratio|yield/i

/**
 * The right axis carries a different measure from the left (a savings rate over
 * rupee bars), so it is formatted on its own: percent when the series reads
 * like a rate, else a plain number. A percent chart keeps percent on both.
 */
function rightFormat(spec: ChartSpec, right: readonly ChartSeries[]): ValueFormat {
  if (spec.valueFormat !== 'currency') return spec.valueFormat
  return right.some((entry) => RATE_LABEL.test(entry.label)) ? 'percent' : 'number'
}

/** Bars and lines on one category axis, with an optional right axis for a second measure. */
export default function ComboCanvasChart({ spec, colors, format, ticks, ariaLabel }: CanvasChartProps & { readonly spec: ChartSpec }) {
  const bars = spec.series.filter((entry) => entry.kind === 'bar')
  const right = spec.series.filter((entry) => entry.axis === 'right')
  const rightValueFormat = rightFormat(spec, right)
  const formatRight = valueFormatter(rightValueFormat)
  const colorOf = (key: string) => colors[spec.series.findIndex((entry) => entry.key === key)]
  const formatOf = (entry: ChartSeries) => (entry.axis === 'right' ? formatRight : format)
  const legend = spec.series.map((entry) => ({ key: entry.key, label: entry.label, color: colorOf(entry.key) }))

  return (
    <>
      <ChartSeriesLegend items={legend} />
      <CartesianChart
        data={spec.data}
        categoryKey={spec.xKey}
        series={spec.series.map((entry) => ({ key: entry.key, axis: entry.axis ?? 'left' }))}
        categoryKind="band"
        height={CANVAS_CHART_HEIGHT}
        ariaLabel={ariaLabel}
        tooltip={
          <CartesianTooltip
            series={spec.series.map((entry) => ({
              key: entry.key,
              label: entry.label,
              color: colorOf(entry.key),
              format: formatOf(entry),
            }))}
            formatLabel={formatChartDate}
          />
        }
      >
        <Grid />
        <Crosshair />
        <ValueAxis tickFormatter={ticks} />
        {right.length > 0 && <ValueAxis axis="right" tickFormatter={tickFormatter(rightValueFormat)} />}
        <CategoryAxis interval="preserveStartEnd" />
        {bars.map((entry, index) => (
          <Bars
            key={entry.key}
            dataKey={entry.key}
            color={colorOf(entry.key)}
            groupIndex={index}
            groupCount={bars.length}
            highlightBand={false}
          />
        ))}
        {spec.series
          .filter((entry) => entry.kind === 'line')
          .map((entry, index) => (
            <LineSeries key={entry.key} dataKey={entry.key} color={colorOf(entry.key)} showDots seriesIndex={index} />
          ))}
      </CartesianChart>
      {chartDataTable<ChartRow>(
        spec.data,
        [
          { header: spec.xLabel, rowHeader: true, value: (row) => String(row[spec.xKey]) },
          ...spec.series.map((entry) => ({
            header: entry.label,
            value: (row: ChartRow) => formatOf(entry)(Number(row[entry.key])),
          })),
        ],
        ariaLabel,
        (row) => String(row[spec.xKey]),
      )}
    </>
  )
}
