import { motion } from 'motion/react'

import ChartFrame from '@/components/charts/ChartFrame'
import { useChartFrame } from '@/components/charts/chartContext'
import { CHART_MOTION, CHART_EASE } from '@/components/charts/chartMotion'
import { chartDataTable } from '@/components/ui/chartDataTable'

import type { ChartRow, ChartSpec } from '../chartSpec'
import { tickFont, type CanvasChartProps } from './canvasColors'

type Props = CanvasChartProps & { readonly spec: ChartSpec }

const HEADER = 30
const ROW = { desktop: 30, mobile: 26 }
/** A cell prints its value only when the value fits; the title and the table always carry it. */
const LABEL_MIN_WIDTH = 46
const MIN_OPACITY = 0.1

function heights(rows: number) {
  return { desktop: HEADER + rows * ROW.desktop + 6, mobile: HEADER + rows * ROW.mobile + 6 }
}

/** Fill colour and strength: one hue for one-signed data, income and expense hues around zero. */
function shade(value: number, min: number, max: number, props: Props): { color: string; strength: number } {
  const { semantic, palette } = props
  if (min < 0 && max > 0) {
    const reach = Math.max(-min, max)
    return { color: value < 0 ? semantic.expense : semantic.income, strength: Math.abs(value) / reach }
  }
  const span = max - min
  return { color: palette[0], strength: span === 0 ? 1 : (value - min) / span }
}

function Cells(props: Props) {
  const { spec, format, ticks } = props
  const { width, isMobile, animate, entered } = useChartFrame()
  const rowHeight = isMobile ? ROW.mobile : ROW.desktop
  const font = tickFont(isMobile)
  const longest = Math.max(...spec.data.map((row) => String(row[spec.xKey]).length))
  const left = Math.min(isMobile ? 96 : 150, longest * font * 0.6 + 12)
  const cellWidth = Math.max(1, (width - left) / spec.series.length)
  const values = spec.data.flatMap((row) => spec.series.map((entry) => Number(row[entry.key])))
  const [min, max] = [Math.min(...values), Math.max(...values)]
  const count = values.length
  return (
    <>
      {spec.series.map((entry, column) => (
        <text
          key={entry.key}
          x={left + cellWidth * (column + 0.5)}
          y={HEADER - 10}
          textAnchor="middle"
          fontSize={font}
          className="fill-(--chart-text-subtle) font-mono"
        >
          {entry.label.length > 10 && cellWidth < 70 ? `${entry.label.slice(0, 9)}…` : entry.label}
        </text>
      ))}
      {spec.data.map((row, rowIndex) => {
        const name = String(row[spec.xKey])
        const y = HEADER + rowIndex * rowHeight
        return (
          <g key={name}>
            <text x={left - 8} y={y + rowHeight / 2} dy="0.355em" textAnchor="end" fontSize={font} className="fill-(--chart-text-secondary)">
              {name.length > 20 ? `${name.slice(0, 19)}…` : name}
            </text>
            {spec.series.map((entry, column) => {
              const value = Number(row[entry.key])
              const { color, strength } = shade(value, min, max, props)
              const order = rowIndex * spec.series.length + column
              const opacity = MIN_OPACITY + (1 - MIN_OPACITY) * strength
              return (
                <g key={entry.key}>
                  <motion.rect
                    x={left + column * cellWidth + 1}
                    y={y + 1}
                    width={Math.max(0, cellWidth - 2)}
                    height={rowHeight - 2}
                    rx={4}
                    fill={color}
                    initial={animate ? { opacity: 0 } : false}
                    animate={{ opacity: entered ? opacity : 0 }}
                    transition={
                      animate
                        ? { duration: CHART_MOTION.update, ease: CHART_EASE, delay: Math.min(order * 0.01, CHART_MOTION.maxStagger) }
                        : { duration: 0 }
                    }
                  >
                    <title>{`${name}, ${entry.label}: ${format(value)}`}</title>
                  </motion.rect>
                  {cellWidth >= LABEL_MIN_WIDTH && (
                    <text
                      x={left + cellWidth * (column + 0.5)}
                      y={y + rowHeight / 2}
                      dy="0.355em"
                      textAnchor="middle"
                      fontSize={font}
                      className="pointer-events-none fill-(--chart-text-primary) font-mono"
                    >
                      {ticks(value)}
                    </text>
                  )}
                </g>
              )
            })}
          </g>
        )
      })}
      <desc>{`${count} cells from ${format(min)} to ${format(max)}`}</desc>
    </>
  )
}

/** A grid of rows (labels) by columns (series), each cell shaded by its value. */
export default function HeatmapChart(props: Props) {
  const { spec, format, ariaLabel } = props
  const size = heights(spec.data.length)
  return (
    <>
      <ChartFrame height={size.desktop} mobileHeight={size.mobile} ariaLabel={ariaLabel} dataLength={spec.data.length * spec.series.length}>
        <Cells {...props} />
      </ChartFrame>
      {chartDataTable<ChartRow>(
        spec.data,
        [
          { header: spec.xLabel, rowHeader: true, value: (row) => String(row[spec.xKey]) },
          ...spec.series.map((entry) => ({ header: entry.label, value: (row: ChartRow) => format(Number(row[entry.key])) })),
        ],
        ariaLabel,
        (row) => String(row[spec.xKey]),
      )}
    </>
  )
}
