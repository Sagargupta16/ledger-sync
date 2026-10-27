import { useMemo } from 'react'

import AreaSeries from '@/components/charts/AreaSeries'
import { CategoryAxis, ValueAxis } from '@/components/charts/Axis'
import CartesianChart, { type SeriesSpec } from '@/components/charts/CartesianChart'
import CartesianTooltip, { type TooltipSeries } from '@/components/charts/CartesianTooltip'
import Crosshair from '@/components/charts/Crosshair'
import Grid from '@/components/charts/Grid'
import LineSeries from '@/components/charts/LineSeries'
import { ReferenceLine } from '@/components/charts/References'
import ChartSeriesLegend from '@/components/ui/ChartSeriesLegend'
import { chartDataTable } from '@/components/ui/chartDataTable'
import { usePaletteSnapshot } from '@/hooks/usePaletteSnapshot'
import type { FanRow } from '@/lib/finance/monteCarlo'
import { formatCurrencyShort, formatPercent } from '@/lib/formatters'
import { colors, rawColors } from '@/constants/colors'

interface MonteCarloFanChartProps {
  readonly fan: readonly FanRow[]
  readonly retireAge: number
}

/** Every plotted key, so the value axis spans the whole fan. */
const SERIES: readonly SeriesSpec[] = [{ key: 'p10' }, { key: 'p25' }, { key: 'p50' }, { key: 'p75' }, { key: 'p90' }]

const share = (value: number) => formatPercent(value * 100)
const ageTick = (key: string) => key

/** Percentile fan of the portfolio by age: the 10th to 90th and 25th to 75th bands with the median run. */
export default function MonteCarloFanChart({ fan, retireAge }: MonteCarloFanChartProps) {
  const app = usePaletteSnapshot(rawColors.app)
  // String ages: the category scale keys on text.
  const rows = useMemo(() => fan.map((row) => ({ ...row, age: String(row.age) })), [fan])
  const tooltip = useMemo((): readonly TooltipSeries[] => [
    { key: 'p90', label: '90th percentile', color: app.blue },
    { key: 'p75', label: '75th percentile', color: app.blue },
    { key: 'p50', label: 'Median run', color: app.blue },
    { key: 'p25', label: '25th percentile', color: app.blue },
    { key: 'p10', label: '10th percentile', color: app.blue },
  ], [app])

  return (
    <>
      <ChartSeriesLegend
        items={[
          { key: 'p50', label: 'Median run', color: app.blue },
          { key: 'middle', label: 'Shaded dark · middle half of runs', color: app.blue },
          { key: 'wide', label: 'Shaded light · 80% of runs', color: app.blue },
        ]}
        caption="Today's money"
      />
      <CartesianChart
        data={rows}
        categoryKey="age"
        series={SERIES}
        height={340}
        mobileHeight={280}
        ariaLabel={`Monte Carlo fan of the portfolio by age in today's money: the 10th to 90th and 25th to 75th percentile bands and the median run, with retirement at ${retireAge}`}
        tooltip={(
          <CartesianTooltip
            series={tooltip}
            formatLabel={(label) => `Age ${label}`}
            formatValue={formatCurrencyShort}
            footer={(row) => `Out of money before this age: ${share(Number(row.depleted))}`}
          />
        )}
      >
        <Grid />
        <Crosshair />
        <ValueAxis />
        <CategoryAxis interval="preserveStartEnd" tickFormatter={ageTick} />
        <AreaSeries dataKey="wide" lowerKey="p10" upperKey="p90" color={app.blue} fillOpacity={0.18} />
        <AreaSeries dataKey="middle" lowerKey="p25" upperKey="p75" color={app.blue} fillOpacity={0.34} seriesIndex={1} />
        <LineSeries dataKey="p50" color={app.blue} strokeWidth={2.5} seriesIndex={2} />
        <ReferenceLine
          category={String(retireAge)}
          color={colors.text.tertiary}
          dash="4 4"
          label={`Retire at ${retireAge}`}
          labelPosition="insideTopLeft"
          labelColor={colors.text.secondary}
        />
      </CartesianChart>
      {chartDataTable<FanRow>(
        fan,
        [
          { header: 'Age', rowHeader: true, value: (row) => String(row.age) },
          { header: '10th percentile', value: (row) => formatCurrencyShort(row.p10) },
          { header: '25th percentile', value: (row) => formatCurrencyShort(row.p25) },
          { header: 'Median', value: (row) => formatCurrencyShort(row.p50) },
          { header: '75th percentile', value: (row) => formatCurrencyShort(row.p75) },
          { header: '90th percentile', value: (row) => formatCurrencyShort(row.p90) },
          { header: 'Out of money before this age', value: (row) => share(row.depleted) },
        ],
        "Simulated portfolio by age in today's money. Estimates from assumptions, not a forecast.",
        (row) => String(row.age),
      )}
    </>
  )
}
