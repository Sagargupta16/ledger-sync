/**
 * Reusable radar chart wrapper with standardized premium styling.
 *
 * Usage:
 *   <StandardRadarChart
 *     data={[{ dimension: 'Savings', score: 80 }, ...]}
 *     dataKey="score"
 *     categoryKey="dimension"
 *     color={rawColors.app.blue}
 *   />
 */

import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Tooltip, Text,
} from 'recharts'

import { chartTooltipProps, ChartContainer } from '@/components/ui'
import { chartCellText, chartDataTable } from '@/components/ui/chartDataTable'
import { ACTIVE_DOT, AXIS_TICK } from '@/components/ui/chartDefaults'
import ChartTooltipContent from '@/components/ui/ChartTooltipContent'
import { useChartPresentation } from '@/components/ui/useChartPresentation'
import { rawColors } from '@/constants/colors'

interface StandardRadarChartProps<T> {
  readonly data: readonly T[]
  /** Key on each row that holds the score value. */
  readonly dataKey: string
  /** Key on each row that holds the axis label. */
  readonly categoryKey: string
  readonly color: string
  readonly name?: string
  readonly height?: number
  /** Domain for the radius axis. Default [0, 100]. */
  readonly radiusDomain?: [number, number]
  /** Font size for angle-axis labels. Default 10. */
  readonly labelFontSize?: number
  /** Show tick labels on the radius axis. Default false. */
  readonly showRadiusTicks?: boolean
  /** Dot radius on the radar line. Default 2. */
  readonly dotRadius?: number
  readonly fillOpacity?: number
  /** Accessible description of the chart, forwarded to ChartContainer (role=img). */
  readonly ariaLabel?: string
}

export default function StandardRadarChart<T>({
  data,
  dataKey,
  categoryKey,
  color,
  name,
  height = 200,
  radiusDomain = [0, 100],
  labelFontSize = 10,
  showRadiusTicks = false,
  dotRadius = 2,
  fillOpacity = 0.15,
  ariaLabel,
}: StandardRadarChartProps<T>) {
  const { animate, isMobile } = useChartPresentation(data.length)
  const rows = data as readonly Record<string, unknown>[]

  return (
    <>
      <ChartContainer height={height} ariaLabel={ariaLabel}>
        <RadarChart
          data={data as unknown as Array<Record<string, unknown>>}
          outerRadius="68%"
          margin={{ top: 16, right: 16, bottom: 16, left: 16 }}
        >
          <PolarGrid stroke={rawColors.chart.axisLine} strokeDasharray="2 5" />
          <PolarAngleAxis
            dataKey={categoryKey}
            axisLine={false}
            tickLine={false}
            tick={(props) => (
              <Text
                x={props.x}
                y={props.y}
                textAnchor={props.textAnchor}
                verticalAnchor="middle"
                width={isMobile ? 68 : 88}
                fill={rawColors.chart.textSubtle}
                fontSize={labelFontSize}
              >
                {chartCellText(props.payload.value)}
              </Text>
            )}
          />
          <PolarRadiusAxis
            angle={30}
            domain={radiusDomain}
            tick={showRadiusTicks ? { ...AXIS_TICK, fontSize: 10 } : false}
            axisLine={false}
          />
          <Radar
            name={name ?? dataKey}
            dataKey={dataKey}
            stroke={color}
            fill={color}
            fillOpacity={fillOpacity}
            strokeWidth={2.25}
            strokeLinejoin="round"
            dot={{ r: dotRadius, fill: color, stroke: rawColors.chart.activeStroke, strokeWidth: 1.5 }}
            activeDot={{ ...ACTIVE_DOT, fill: color }}
            isAnimationActive={animate}
            animationDuration={520}
            animationEasing="ease-out"
          />
          <Tooltip
            {...chartTooltipProps}
            content={<ChartTooltipContent />}
            labelFormatter={(_label, payload) => {
              const row = payload[0]?.payload as Record<string, unknown> | undefined
              return chartCellText(row?.[categoryKey])
            }}
          />
        </RadarChart>
      </ChartContainer>
      {!showRadiusTicks && data.length > 0 && (
        <p className="mb-2 text-center font-mono text-[10px] tabular-nums text-muted-foreground">
          Scale {radiusDomain[0]} to {radiusDomain[1]}
        </p>
      )}
      {chartDataTable(
        rows,
        [
          {
            header: 'Dimension',
            rowHeader: true,
            value: (row) => chartCellText(row[categoryKey]),
          },
          {
            header: name ?? dataKey,
            value: (row) => chartCellText(row[dataKey]),
          },
        ],
        ariaLabel ?? 'Radar chart data',
        (row, index) => `${chartCellText(row[categoryKey]) || 'row'}-${index}`,
      )}
    </>
  )
}
