import { useMemo } from 'react'

import StandardPieChart from '@/components/analytics/StandardPieChart'
import StandardRadarChart from '@/components/analytics/StandardRadarChart'
import Treemap from '@/components/charts/Treemap'
import { chartDataTable } from '@/components/ui/chartDataTable'

import type { ChartRow, ChartSpec } from '../chartSpec'
import { CANVAS_CHART_HEIGHT, type CanvasChartProps } from './canvasColors'

type Props = CanvasChartProps & { readonly spec: ChartSpec }

function TreemapPart({ spec, palette, format, ariaLabel }: Props) {
  const key = spec.series[0].key
  const nodes = useMemo(
    () =>
      spec.data.map((row, index) => ({
        id: String(row[spec.xKey]),
        label: String(row[spec.xKey]),
        value: Number(row[key]),
        color: palette[index % palette.length],
      })),
    [spec.data, spec.xKey, key, palette],
  )
  return (
    <>
      <Treemap nodes={nodes} formatValue={format} rootLabel={spec.series[0].label} ariaLabel={ariaLabel} height={CANVAS_CHART_HEIGHT} />
      {chartDataTable<ChartRow>(
        spec.data,
        [
          { header: spec.xLabel, rowHeader: true, value: (row) => String(row[spec.xKey]) },
          { header: spec.series[0].label, value: (row) => format(Number(row[key])) },
        ],
        ariaLabel,
        (row) => String(row[spec.xKey]),
      )}
    </>
  )
}

/** Parts of a whole (pie, donut, treemap) and a 0-100 profile (radar). */
export default function PartsCanvasChart(props: Props) {
  const { spec, palette, colors, format, ariaLabel } = props
  const key = spec.series[0].key

  if (spec.chartType === 'treemap') return <TreemapPart {...props} />

  if (spec.chartType === 'radar') {
    return (
      <StandardRadarChart
        data={spec.data}
        dataKey={key}
        categoryKey={spec.xKey}
        color={colors[0]}
        name={spec.series[0].label}
        height={CANVAS_CHART_HEIGHT}
        showRadiusTicks
        ariaLabel={ariaLabel}
      />
    )
  }

  const slices = spec.data.map((row, index) => ({
    name: String(row[spec.xKey]),
    value: Number(row[key]),
    color: palette[index % palette.length],
  }))
  const donut = spec.chartType === 'donut'
  return (
    <StandardPieChart
      data={slices}
      height={CANVAS_CHART_HEIGHT}
      innerRadius={donut ? '60%' : '0%'}
      tooltipFormatter={format}
      centerLabel={donut ? spec.series[0].label : undefined}
      centerValue={donut ? format(slices.reduce((sum, slice) => sum + slice.value, 0)) : undefined}
      ariaLabel={ariaLabel}
    />
  )
}
