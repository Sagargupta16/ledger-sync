import AreaSeries from '@/components/charts/AreaSeries'
import { CategoryAxis, ValueAxis } from '@/components/charts/Axis'
import CartesianChart, { type SeriesSpec } from '@/components/charts/CartesianChart'
import CartesianTooltip, { type TooltipSeries } from '@/components/charts/CartesianTooltip'
import type { ChartRow } from '@/components/charts/chartContext'
import Crosshair from '@/components/charts/Crosshair'
import Grid from '@/components/charts/Grid'
import LineSeries from '@/components/charts/LineSeries'
import { ReferenceArea, ReferenceLine } from '@/components/charts/References'
import ChartSeriesLegend from '@/components/ui/ChartSeriesLegend'
import TooltipValueList from '@/components/ui/TooltipValueList'
import { formatChartDate } from '@/lib/chartDateLabels'
import { colors, cssVar } from '@/constants/colors'

import type { ChartDataPoint } from '../types'
import ProjectionReveal from './ProjectionReveal'

const INVESTED_COLOR = cssVar('--chart-neutral')
const VALUE_COLOR = colors.app.blue
const EXPECTED_COLOR = colors.app.orange
const EXPECTED_LABEL = 'Expected (at assumed return)'
const PLOT_SERIES: readonly SeriesSpec[] = [{ key: 'invested' }, { key: 'historicalValue' }, { key: 'projectedValue' }]
const PLOT_SERIES_EXPECTED: readonly SeriesSpec[] = [...PLOT_SERIES, { key: 'expectedValue' }]
/** Read out on arrow-key inspection; GrowthTooltipContent draws the visible box. */
const TIP_SERIES: readonly TooltipSeries[] = [
  { key: 'invested', label: 'Invested Amount', color: INVESTED_COLOR },
  { key: 'value', label: 'Portfolio Value', color: VALUE_COLOR },
]
const TIP_SERIES_EXPECTED: readonly TooltipSeries[] = [...TIP_SERIES, { key: 'expectedValue', label: EXPECTED_LABEL, color: EXPECTED_COLOR }]
/** Headroom above the plot for the boundary label. */
const PLOT_MARGIN = { top: 28 } as const

const tooltipHeading = (month: string, row: ChartRow) =>
  `${formatChartDate(month)}, ${row.isHistorical === true ? 'contribution history' : 'projection estimate'}`

function GrowthTooltipContent({ point }: Readonly<{ point: ChartDataPoint }>) {
  const rows = [
    { label: 'Invested Amount', value: point.invested, color: INVESTED_COLOR },
    { label: point.isHistorical ? 'Portfolio Value (allocated)' : 'Projected Portfolio Value', value: point.value, color: VALUE_COLOR },
    ...(point.expectedValue === undefined ? [] : [
      { label: EXPECTED_LABEL, value: point.expectedValue, color: EXPECTED_COLOR },
    ]),
  ]

  return (
    <>
      <p className="mb-2 border-b border-border/60 pb-2 text-xs font-medium text-foreground">{formatChartDate(point.month)}</p>
      <p className="mb-3 text-[10px] text-muted-foreground">
        {point.isHistorical ? 'Contribution history · allocated value' : 'Projection · scenario estimate'}
      </p>
      <TooltipValueList rows={rows} />
    </>
  )
}

interface GrowthPlotProps {
  readonly chartData: readonly ChartDataPoint[]
  readonly hasExpected: boolean
}

/**
 * Legend and plot of the growth path. On entry the history draws up to the
 * boundary, the projection tint fades up, then the dashed forecast continues
 * from the boundary to the horizon.
 */
export default function GrowthPlot({ chartData, hasExpected }: GrowthPlotProps) {
  // The last contribution month anchors the forecast; it need not be today.
  const lastHistorical = [...chartData].reverse().find((d) => d.isHistorical)
  const lastPoint = chartData.at(-1)
  const firstProjection = chartData.find((point) => !point.isHistorical)
  const projectionStartsLate = firstProjection !== undefined && chartData.indexOf(firstProjection) > chartData.length / 2
  // Category where the history ends and the forecast begins; the tint, rule and reveal meet there.
  const boundary = firstProjection ? (lastHistorical?.month ?? firstProjection.month) : undefined
  // Split only the paint at the boundary. Values come from the unchanged model.
  const plotData = chartData.map((point) => ({
    ...point,
    historicalValue: point.isHistorical ? point.value : null,
    projectedValue: !point.isHistorical || point === lastHistorical ? point.value : null,
  }))

  return (
    <>
      <ChartSeriesLegend
        items={[
          { key: 'invested', label: 'Invested Amount', color: INVESTED_COLOR },
          { key: 'value', label: 'Portfolio Value', color: VALUE_COLOR },
          ...(hasExpected ? [{ key: 'expectedValue', label: EXPECTED_LABEL, color: EXPECTED_COLOR }] : []),
        ]}
        caption="Dashed blue = projected value"
      />
      <CartesianChart
        data={plotData}
        categoryKey="month"
        categoryKind="point"
        series={hasExpected ? PLOT_SERIES_EXPECTED : PLOT_SERIES}
        margin={PLOT_MARGIN}
        height={360}
        mobileHeight={300}
        ariaLabel="Area chart projecting principal invested versus portfolio value over the selected number of years."
        tooltip={(
          <CartesianTooltip
            series={hasExpected ? TIP_SERIES_EXPECTED : TIP_SERIES}
            formatLabel={tooltipHeading}
            render={(_row, index) => <GrowthTooltipContent point={chartData[index]} />}
          />
        )}
      >
        <Grid />
        <Crosshair />
        {/* The zero rule below draws the baseline whether or not the domain crosses 0. */}
        <ValueAxis zeroLine={false} />
        <CategoryAxis interval="preserveStartEnd" />
        {boundary && lastPoint && (
          <ReferenceArea category={[boundary, lastPoint.month]} color={VALUE_COLOR} opacity={0.05} />
        )}
        <ProjectionReveal boundary={boundary}>
          <AreaSeries dataKey="invested" color={INVESTED_COLOR} fillOpacity={0.12} strokeWidth={2} />
          <AreaSeries dataKey="historicalValue" color={VALUE_COLOR} fillOpacity={0.26} strokeWidth={2.5} />
          {boundary && (
            <AreaSeries dataKey="projectedValue" color={VALUE_COLOR} fillOpacity={0.26} strokeWidth={2.5} dash="6 4" />
          )}
          {hasExpected && <LineSeries dataKey="expectedValue" color={EXPECTED_COLOR} strokeWidth={2} dash="5 4" />}
        </ProjectionReveal>
        <ReferenceLine value={0} variant="zero" />
        {boundary && (
          <ReferenceLine
            category={boundary}
            variant="target"
            dash="3 3"
            label="Projection begins"
            // The label takes the side with room: left of a late boundary, right of an early one.
            labelPosition={projectionStartsLate ? 'insideTopRight' : 'insideTopLeft'}
          />
        )}
      </CartesianChart>
    </>
  )
}
