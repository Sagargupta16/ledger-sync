import { motion } from 'motion/react'

import ChartFrame from '@/components/charts/ChartFrame'
import { useChartFrame } from '@/components/charts/chartContext'
import { chartTransition, staggerDelay } from '@/components/charts/chartMotion'
import { linearScale } from '@/components/charts/scales'
import { chartDataTable } from '@/components/ui/chartDataTable'
import { formatCurrencyCompact } from '@/lib/formatters'

import type { ChartRow, ChartSpec } from '../chartSpec'
import { CANVAS_CHART_HEIGHT, tickFont, type CanvasChartProps } from './canvasColors'
import { labelX, namedPoints, type PlacedPoint } from './scatterLabels'
import { XTicks, YTicks } from './svgAxes'
import { tickLabels } from './tickLabels'

type Props = CanvasChartProps & { readonly spec: ChartSpec }

/** Points are named on the plot only while there are few enough to read. */
const NAMED_POINTS = 12
const DOT = 5

/** The data's range plus a little room, so no dot sits on an axis and the corner ticks keep apart. */
function extent(values: readonly number[]): [number, number] {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const pad = (max - min) * 0.06 || Math.abs(max) * 0.05 || 1
  return [min - pad, max + pad]
}

function PointLabel({ point, font, plotRight }: Readonly<{ point: PlacedPoint; font: number; plotRight: number }>) {
  const { x, anchor } = labelX(point, font, DOT, plotRight)
  return (
    <text x={x} y={point.y} dy="0.355em" textAnchor={anchor} fontSize={font} className="fill-(--chart-text-secondary)">
      {point.name.length > 16 ? `${point.name.slice(0, 15)}…` : point.name}
    </text>
  )
}

function Points({ spec, colors, format, ticks }: Props) {
  const { width, height, isMobile, animate, entered } = useChartFrame()
  const [xSeries, ySeries] = spec.series
  const xs = spec.data.map((row) => Number(row[xSeries.key]))
  const ys = spec.data.map((row) => Number(row[ySeries.key]))
  const font = tickFont(isMobile)
  const tick = (value: number) => ticks(value)
  // Whole-rupee labels when the short ones would repeat on a narrow range.
  const precise = spec.valueFormat === 'currency' ? formatCurrencyCompact : format
  const yRange = linearScale(extent(ys), [1, 0], { tickCount: isMobile ? 4 : 5 })
  const longest = Math.max(4, ...tickLabels(yRange.ticks(isMobile ? 4 : 5), tick, precise).map(([, label]) => label.length))
  const margin = { top: 22, right: 16, bottom: 40, left: Math.max(isMobile ? 48 : 60, longest * font * 0.62 + 14) }
  const x = linearScale(extent(xs), [margin.left, width - margin.right], { tickCount: isMobile ? 3 : 5 })
  const y = linearScale(extent(ys), [height - margin.bottom, margin.top], { tickCount: isMobile ? 4 : 5 })
  const placed = spec.data.map((row, index) => ({ index, x: x(xs[index]), y: y(ys[index]), name: String(row[spec.xKey]) }))
  const named = spec.data.length <= NAMED_POINTS ? namedPoints(placed, font, DOT, width - margin.right) : new Set<number>()
  return (
    <>
      <YTicks scale={y} x0={margin.left} x1={width - margin.right} format={tick} fallback={precise} isMobile={isMobile} />
      <XTicks scale={x} y0={margin.top} y1={height - margin.bottom} format={tick} fallback={precise} isMobile={isMobile} />
      <text x={margin.left} y={12} fontSize={font} className="fill-(--chart-text-muted)">
        {ySeries.label}
      </text>
      <text x={width - margin.right} y={height - 6} textAnchor="end" fontSize={font} className="fill-(--chart-text-muted)">
        {xSeries.label}
      </text>
      {spec.data.map((row, index) => {
        const name = String(row[spec.xKey])
        return (
          <g key={name}>
            <motion.circle
              cx={x(xs[index])}
              cy={y(ys[index])}
              r={DOT}
              fill={colors[0]}
              className="origin-center [transform-box:fill-box]"
              initial={animate ? { opacity: 0, scale: 0 } : false}
              animate={entered ? { opacity: 0.85, scale: 1 } : { opacity: 0, scale: 0 }}
              transition={chartTransition('bar', animate, staggerDelay(index, spec.data.length))}
            >
              <title>{`${name}: ${xSeries.label} ${format(xs[index])}, ${ySeries.label} ${format(ys[index])}`}</title>
            </motion.circle>
            {named.has(index) && <PointLabel point={placed[index]} font={font} plotRight={width - margin.right} />}
          </g>
        )
      })}
    </>
  )
}

/** Two measures per item: x from the first series, y from the second, one dot per label. */
export default function ScatterChart(props: Props) {
  const { spec, format, ariaLabel } = props
  const [xSeries, ySeries] = spec.series
  return (
    <>
      <ChartFrame height={CANVAS_CHART_HEIGHT} ariaLabel={ariaLabel} dataLength={spec.data.length}>
        <Points {...props} />
      </ChartFrame>
      {chartDataTable<ChartRow>(
        spec.data,
        [
          { header: spec.xLabel, rowHeader: true, value: (row) => String(row[spec.xKey]) },
          { header: xSeries.label, value: (row) => format(Number(row[xSeries.key])) },
          { header: ySeries.label, value: (row) => format(Number(row[ySeries.key])) },
        ],
        ariaLabel,
        (row) => String(row[spec.xKey]),
      )}
    </>
  )
}
