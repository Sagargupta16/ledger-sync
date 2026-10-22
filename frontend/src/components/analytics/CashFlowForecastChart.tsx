/**
 * Plot and legend for CashFlowForecast. Recorded income, living expenses and
 * capital losses draw as lines with net savings as an area; after the last
 * complete month the projection continues as dashed lines inside the cone of
 * historical consumption-surplus variability. The series stagger is the
 * choreography: history draws first, each projection wipes on from the
 * boundary as its history line arrives there, and the cone fills in last.
 */

import { useMemo } from 'react'

import AreaSeries from '@/components/charts/AreaSeries'
import { CategoryAxis, ValueAxis } from '@/components/charts/Axis'
import CartesianChart, { type SeriesSpec } from '@/components/charts/CartesianChart'
import CartesianTooltip, { type TooltipSeries } from '@/components/charts/CartesianTooltip'
import type { ChartRow } from '@/components/charts/chartContext'
import Crosshair from '@/components/charts/Crosshair'
import Grid from '@/components/charts/Grid'
import LineSeries from '@/components/charts/LineSeries'
import { ReferenceLine } from '@/components/charts/References'
import ChartSeriesLegend from '@/components/ui/ChartSeriesLegend'
import { usePaletteSnapshot } from '@/hooks/usePaletteSnapshot'
import { formatChartDate, formatChartPeriod } from '@/lib/chartDateLabels'
import { rawColors } from '@/constants/colors'

import type { buildForecast } from './cashFlowUtils'

type ForecastRow = NonNullable<ReturnType<typeof buildForecast>>['combined'][number]
type Palette = typeof rawColors.app

interface CashFlowForecastChartProps {
  readonly rows: readonly ForecastRow[]
  readonly forecastStartMonth: string | undefined
}

/** Every drawn key, so the value axis spans the recorded lines, the projections and the cone. */
const SERIES: readonly SeriesSpec[] = [
  { key: 'income' }, { key: 'expense' }, { key: 'capitalLosses' }, { key: 'net' },
  { key: 'forecastIncome' }, { key: 'forecastExpense' }, { key: 'forecastNet' },
  { key: 'lower' }, { key: 'upper' },
]

/**
 * Tooltip-only copies of the projected figures, set on projected months alone.
 * The last recorded month also carries the projection's starting values, since
 * the dashed lines and the cone begin there; reading these keys instead keeps
 * that month's readout, spoken one included, to what was recorded.
 */
function withProjectedReadout(row: ForecastRow) {
  const projected = row.isForecast
  return {
    ...row,
    projectedIncome: projected ? row.forecastIncome : undefined,
    projectedExpense: projected ? row.forecastExpense : undefined,
    projectedSurplus: projected ? row.forecastNet : undefined,
    rangeHigh: projected ? row.upper : undefined,
    rangeLow: projected ? row.lower : undefined,
  }
}

/** Recorded months list what was booked; projected months list the projection and its range. */
const tooltipSeries = (app: Palette): readonly TooltipSeries[] => [
  { key: 'income', label: 'Income', color: app.green },
  { key: 'expense', label: 'Living expenses', color: app.red },
  { key: 'capitalLosses', label: 'Capital losses', color: app.orange },
  { key: 'net', label: 'Net savings', color: app.blue },
  { key: 'projectedIncome', label: 'Income', color: app.green },
  { key: 'projectedExpense', label: 'Living expenses', color: app.red },
  { key: 'projectedSurplus', label: 'Consumption surplus before losses', color: app.purple },
  { key: 'rangeHigh', label: 'Upper surplus estimate', color: app.blue },
  { key: 'rangeLow', label: 'Lower surplus estimate', color: app.blue },
]

const legendItems = (app: Palette) => [
  { key: 'income', label: 'Income', color: app.green },
  { key: 'expense', label: 'Living expenses', color: app.red },
  { key: 'capitalLosses', label: 'Recorded capital losses', color: app.orange },
  { key: 'net', label: 'Recorded net savings', color: app.blue },
  { key: 'forecast', label: 'Projected consumption surplus', color: app.purple },
]

/** The month, then which group its figures belong to. */
const heading = (month: string, row: ChartRow) =>
  `${formatChartDate(month)} · ${row.isForecast === true ? 'Projected' : 'Recorded'}`

export default function CashFlowForecastChart({ rows, forecastStartMonth }: CashFlowForecastChartProps) {
  const app = usePaletteSnapshot(rawColors.app)
  const data = useMemo(() => rows.map(withProjectedReadout), [rows])
  const tooltip = useMemo(() => tooltipSeries(app), [app])

  return (
    <>
      <ChartSeriesLegend
        items={legendItems(app)}
        caption={forecastStartMonth ? `Projection starts ${formatChartPeriod(forecastStartMonth)}` : undefined}
      />
      <CartesianChart
        data={data}
        categoryKey="month"
        series={SERIES}
        height={320}
        mobileHeight={260}
        ariaLabel="Recorded income, living expenses, capital losses and net savings, with projected consumption surplus before future capital losses"
        tooltip={<CartesianTooltip series={tooltip} formatLabel={heading} />}
      >
        <Grid />
        <ValueAxis />
        <CategoryAxis interval="preserveStartEnd" />
        <Crosshair />
        {/* The cone sits behind every line but enters last, wiping on from the boundary. */}
        <AreaSeries dataKey="cone" lowerKey="lower" upperKey="upper" color={app.blue} fillOpacity={0.14} seriesIndex={7} />
        <LineSeries dataKey="income" color={app.green} strokeWidth={1.5} opacity={0.8} />
        <LineSeries dataKey="expense" color={app.red} strokeWidth={1.5} opacity={0.8} seriesIndex={1} />
        <LineSeries dataKey="capitalLosses" color={app.orange} strokeWidth={1.5} opacity={0.8} seriesIndex={2} />
        <AreaSeries dataKey="net" color={app.blue} strokeWidth={2.5} fillOpacity={0.2} seriesIndex={3} />
        <LineSeries dataKey="forecastIncome" color={app.green} strokeWidth={1.5} dash="6 4" opacity={0.65} seriesIndex={4} />
        <LineSeries dataKey="forecastExpense" color={app.red} strokeWidth={1.5} dash="6 4" opacity={0.65} seriesIndex={5} />
        <LineSeries dataKey="forecastNet" color={app.purple} strokeWidth={2.5} dash="8 4" seriesIndex={6} />
        {forecastStartMonth && <ReferenceLine category={forecastStartMonth} variant="target" dash="4 4" />}
      </CartesianChart>
    </>
  )
}
