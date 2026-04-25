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
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Tooltip,
} from 'recharts'

import { chartTooltipProps, ChartContainer } from '@/components/ui'
import { shouldAnimate } from '@/components/ui/chartDefaults'

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
}: StandardRadarChartProps<T>) {
  const animate = shouldAnimate(data.length)

  return (
    <ChartContainer height={height}>
      <RadarChart data={data as unknown as Array<Record<string, unknown>>}>
        <PolarGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
        <PolarAngleAxis
          dataKey={categoryKey}
          tick={{ fill: '#71717a', fontSize: labelFontSize }}
        />
        <PolarRadiusAxis
          angle={30}
          domain={radiusDomain}
          tick={showRadiusTicks ? { fill: '#52525b', fontSize: 9 } : false}
          axisLine={false}
        />
        <Radar
          name={name ?? dataKey}
          dataKey={dataKey}
          stroke={color}
          fill={color}
          fillOpacity={fillOpacity}
          strokeWidth={2}
          dot={{ r: dotRadius, fill: color, strokeWidth: 0 }}
          isAnimationActive={animate}
          animationDuration={600}
          animationEasing="ease-out"
        />
        <Tooltip {...chartTooltipProps} />
      </RadarChart>
    </ChartContainer>
  )
}
