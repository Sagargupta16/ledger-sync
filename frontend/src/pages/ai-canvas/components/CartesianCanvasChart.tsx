import StandardAreaChart from '@/components/analytics/StandardAreaChart'
import StandardBarChart from '@/components/analytics/StandardBarChart'

import type { ChartSpec } from '../chartSpec'
import { CANVAS_CHART_HEIGHT, type CanvasChartProps } from './canvasColors'

/** Bars (grouped, stacked or a ranking), lines and areas (plain or stacked), on the kit's standard wrappers. */
export default function CartesianCanvasChart({ spec, colors, format, ticks, ariaLabel }: CanvasChartProps & { readonly spec: ChartSpec }) {
  const { chartType } = spec
  const showLegend = spec.series.length > 1

  if (chartType === 'line' || chartType === 'area' || chartType === 'stacked_area') {
    const showFill = chartType !== 'line'
    return (
      <StandardAreaChart
        data={spec.data}
        dataKey={spec.xKey}
        areas={spec.series.map((entry, index) => ({
          key: entry.key,
          label: entry.label,
          color: colors[index],
          showFill,
        }))}
        stacked={chartType === 'stacked_area'}
        height={CANVAS_CHART_HEIGHT}
        showLegend={showLegend}
        tooltipFormatter={format}
        ariaLabel={ariaLabel}
      />
    )
  }

  const isRanking = chartType === 'horizontal_bar'
  return (
    <StandardBarChart
      data={spec.data}
      dataKey={spec.xKey}
      layout={isRanking ? 'vertical' : 'horizontal'}
      yCategoryKey={isRanking ? spec.xKey : undefined}
      bars={spec.series.map((entry, index) => ({ key: entry.key, label: entry.label, color: colors[index] }))}
      stacked={chartType === 'stacked_bar'}
      height={isRanking ? Math.max(CANVAS_CHART_HEIGHT, spec.data.length * 32) : CANVAS_CHART_HEIGHT}
      showLegend={showLegend}
      tooltipFormatter={format}
      xTickFormatter={isRanking ? ticks : undefined}
      yTickFormatter={isRanking ? undefined : ticks}
      ariaLabel={ariaLabel}
      rowHeaderLabel={spec.xLabel}
    />
  )
}
