/**
 * Radar wrapper for fixed 0-100 score profiles on the in-house chart kit. The
 * shape grows out of the centre as it scrolls into view and morphs when a score
 * changes; hover, a tap or the arrow keys read one axis' score beside its label.
 *
 * Usage:
 *   <StandardRadarChart
 *     data={[{ dimension: 'Savings', score: 80 }, ...]}
 *     dataKey="score"
 *     categoryKey="dimension"
 *     color={rawColors.app.blue}
 *   />
 */

import RadarChart from '@/components/charts/RadarChart'
import { chartCellText, chartDataTable } from '@/components/ui/chartDataTable'

interface StandardRadarChartProps<T> {
  readonly data: readonly T[]
  /** Key on each row that holds the score value (0 to 100). */
  readonly dataKey: string
  /** Key on each row that holds the axis label. */
  readonly categoryKey: string
  readonly color: string
  readonly name?: string
  readonly height?: number
  /** Print each ring's score (25 to 100) on the chart. Default false, which captions the scale instead. */
  readonly showRadiusTicks?: boolean
  /** Dot radius on the radar outline, in px. Default 2. */
  readonly dotRadius?: number
  /** Accessible description of the chart (role=img); also captions the data table. */
  readonly ariaLabel?: string
}

export default function StandardRadarChart<T>({
  data,
  dataKey,
  categoryKey,
  color,
  name,
  height = 200,
  showRadiusTicks = false,
  dotRadius = 2,
  ariaLabel,
}: StandardRadarChartProps<T>) {
  const rows = data as readonly Record<string, unknown>[]
  // Axes keyed by position, so a score change on the same dimensions morphs the shape in place.
  const axes = rows.map((row, index) => ({ key: String(index), label: chartCellText(row[categoryKey]) }))
  const series = [{
    key: dataKey,
    label: name ?? dataKey,
    color,
    values: Object.fromEntries(rows.map((row, index) => [String(index), Number(row[dataKey])])),
  }]

  return (
    <>
      <RadarChart
        axes={axes}
        series={series}
        ringLabels={showRadiusTicks}
        dotRadius={dotRadius}
        height={height}
        ariaLabel={ariaLabel}
      />
      {!showRadiusTicks && data.length > 0 && (
        <p className="mb-2 text-center font-mono text-[10px] tabular-nums text-muted-foreground">
          Scale 0 to 100
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
