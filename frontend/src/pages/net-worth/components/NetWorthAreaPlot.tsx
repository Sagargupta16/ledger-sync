import { useMemo } from 'react'

import AreaSeries from '@/components/charts/AreaSeries'
import { CategoryAxis, ValueAxis } from '@/components/charts/Axis'
import CartesianChart, { type SeriesSpec } from '@/components/charts/CartesianChart'
import ChartBrush from '@/components/charts/ChartBrush'
import Crosshair from '@/components/charts/Crosshair'
import Grid from '@/components/charts/Grid'
import LineSeries from '@/components/charts/LineSeries'
import { ReferenceDot, ReferenceLine } from '@/components/charts/References'
import type { ChartRangeControl } from '@/components/ui/useChartRange'
import { usePaletteSnapshot } from '@/hooks/usePaletteSnapshot'
import { formatChartPeriod } from '@/lib/chartDateLabels'
import { colors, rawColors } from '@/constants/colors'

import { CATEGORY_CONFIG } from '../netWorthUtils'
import type { MilestoneRow, NetWorthPoint } from '../netWorthProjection'
import { trendValue, type NetWorthPlotRow } from './netWorthPlotRows'
import { NetWorthTooltip } from './NetWorthTooltip'

interface NetWorthAreaPlotProps {
  /** One row per date (see toNetWorthPlotRows). */
  rows: readonly NetWorthPlotRow[]
  allCategories: readonly string[]
  effectiveStacked: boolean
  showProjectionLine: boolean
  spansYears: boolean
  anchor: NetWorthPoint | null
  anchorDateIso: string
  milestoneRows?: readonly MilestoneRow[]
  range: ChartRangeControl
}

const TOTAL_SERIES: readonly SeriesSpec[] = [{ key: 'netWorth' }]
const PROJECTION_SERIES: readonly SeriesSpec[] = [
  { key: 'netWorth' },
  { key: 'projected' },
  { key: 'projectionLow' },
  { key: 'projectionHigh' },
]

const monthLabel = (key: string) => formatChartPeriod(key, true)

/** The trend plot: total or stacked layers, the projection cone, milestones and the zoom brush. */
export function NetWorthAreaPlot({
  rows,
  allCategories,
  effectiveStacked,
  showProjectionLine,
  spansYears,
  anchor,
  anchorDateIso,
  milestoneRows,
  range,
}: Readonly<NetWorthAreaPlotProps>) {
  // Resolved hex for the SVG attributes; the snapshots repaint them on a theme toggle.
  const app = usePaletteSnapshot(rawColors.app)
  const config = usePaletteSnapshot(CATEGORY_CONFIG)
  const layers = useMemo(
    () => (effectiveStacked
      ? allCategories.map((key) => {
        const { label, color } = config[key] || config.other
        return { key, label, color }
      })
      : []),
    [effectiveStacked, allCategories, config],
  )
  const stackSeries = useMemo(() => layers.map(({ key }) => ({ key, stackId: 'categories' })), [layers])
  const totalSeries = showProjectionLine ? PROJECTION_SERIES : TOTAL_SERIES
  // The next three targets above today; the whole ladder crowded the top with
  // lines a saver will not reach for decades. Rows arrive sorted by value.
  const milestones = effectiveStacked
    ? []
    : (milestoneRows ?? []).filter((row) => row.status === 'upcoming').slice(0, 3)

  return (
    <>
      <CartesianChart
        data={rows}
        categoryKey="date"
        series={effectiveStacked ? stackSeries : totalSeries}
        categoryKind="point"
        visibleRange={range}
        height={360}
        mobileHeight={300}
        ariaLabel="Cumulative income less expenses over time, with optional allocated category breakdown and forward projection band"
        tooltip={<NetWorthTooltip layers={layers} color={app.blue} projection={showProjectionLine} />}
      >
        <Grid />
        <Crosshair />
        {/* Its zero line appears once the trend or the band dips below zero. */}
        <ValueAxis zeroLine />
        <CategoryAxis
          interval="preserveStartEnd"
          tickFormatter={showProjectionLine || spansYears ? monthLabel : undefined}
        />
        {/* Layers wipe in bottom to top, each 0.12s after the one beneath it. */}
        {layers.map((layer, index) => (
          <AreaSeries
            key={layer.key}
            dataKey={layer.key}
            color={layer.color}
            strokeWidth={2}
            fillOpacity={0.5}
            seriesIndex={index}
          />
        ))}
        {!effectiveStacked && (
          <AreaSeries dataKey="netWorth" color={app.blue} strokeWidth={2.5} fillOpacity={0.3} />
        )}
        {/* The wipe reaches the anchor as the history line does, so the band fans
        out and the dashed median draws on from there. Both are empty before it. */}
        {showProjectionLine && (
          <>
            <AreaSeries
              dataKey="projectionBand"
              lowerKey="projectionLow"
              upperKey="projectionHigh"
              color={app.blue}
              fillOpacity={0.32}
              seriesIndex={1}
            />
            <LineSeries dataKey="projected" color={app.blue} strokeWidth={2.5} dash="6 4" seriesIndex={2} />
          </>
        )}
        {milestones.map((milestone) => (
          <ReferenceLine
            key={`milestone-${milestone.value}`}
            value={milestone.value}
            variant="target"
            dash="2 4"
            label={milestone.label}
            labelPosition="insideTopLeft"
          />
        ))}
        {showProjectionLine && (
          <ReferenceLine
            category={anchorDateIso}
            color={colors.text.tertiary}
            dash="4 4"
            label="Projection begins"
            labelPosition="insideTopLeft"
            labelColor={colors.text.secondary}
          />
        )}
        {!effectiveStacked && anchor && (
          <ReferenceDot category={anchor.date} value={anchor.netWorth} color={colors.app.blue} />
        )}
      </CartesianChart>
      {rows.length > 6 && (
        <ChartBrush range={range} values={rows.map(trendValue)} ariaLabel="Net worth chart zoom" />
      )}
    </>
  )
}
