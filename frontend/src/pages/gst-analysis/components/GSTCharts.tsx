import { useMemo } from 'react'
import { motion } from 'motion/react'

import { CategoryAxis, ValueAxis } from '@/components/charts/Axis'
import Bars from '@/components/charts/Bars'
import CartesianChart, { type SeriesSpec } from '@/components/charts/CartesianChart'
import CartesianTooltip from '@/components/charts/CartesianTooltip'
import Crosshair from '@/components/charts/Crosshair'
import Grid from '@/components/charts/Grid'
import ChartEmptyState from '@/components/shared/ChartEmptyState'
import ChartSeriesLegend from '@/components/ui/ChartSeriesLegend'
import { chartDataTable } from '@/components/ui/chartDataTable'
import { fadeUpItem } from '@/constants/animations'
import { rawColors } from '@/constants/colors'
import { useIsMobile } from '@/hooks/useIsMobile'
import { usePaletteSnapshot } from '@/hooks/usePaletteSnapshot'
import { formatChartDate } from '@/lib/chartDateLabels'
import { capSeriesToToday } from '@/lib/dateUtils'
import { formatCurrency } from '@/lib/formatters'
import type { GSTSlabBreakdown, GSTSummary } from '@/lib/gstCalculator'

import GSTRateMix from './GSTRateMix'

/** The one series the bars draw; CartesianChart sizes the value axis from it. */
const SERIES: readonly SeriesSpec[] = [{ key: 'gstAmount' }]

interface Props {
  data: GSTSummary
  taxableSlabs: GSTSlabBreakdown[]
}

export default function GSTCharts({ data, taxableSlabs }: Readonly<Props>) {
  const isMobile = useIsMobile()
  // A theme-scoped copy: a toggle re-renders the bars, swatch and tooltip in the new palette.
  const app = usePaletteSnapshot(rawColors.app)
  // Future-dated rows (scheduled bills) would otherwise draw months that have not happened yet.
  const monthly = useMemo(() => capSeriesToToday(data.monthlyTrend, 'month'), [data.monthlyTrend])
  const latestMonth = monthly.at(-1)

  return (
    <div className="grid min-w-0 grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
      <GSTRateMix totalGST={data.totalGST} taxableSlabs={taxableSlabs} />

      <motion.div variants={fadeUpItem} className="ledger-panel relative min-w-0 p-4 sm:p-6">
        <div className="mb-6">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">02 / Over time</p>
          <h3 className="text-xl font-semibold tracking-tight text-foreground">Monthly estimated GST</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Month-by-month indirect tax estimate
          </p>
        </div>
        {latestMonth && (
          <ChartSeriesLegend
            items={[{ key: 'gst', label: 'Estimated GST', color: app.indigo, value: formatCurrency(latestMonth.gstAmount) }]}
            caption={`Latest: ${formatChartDate(latestMonth.month)}`}
          />
        )}
        {monthly.length <= 1 ? (
          <ChartEmptyState
            height={isMobile ? 270 : 320}
            message="Need at least two months of spending to show a trend"
          />
        ) : (
          // Bars grow out of the zero line in sequence when the panel scrolls into view;
          // a month below zero (refunds) gets the axis's zero rule.
          <CartesianChart
            data={monthly}
            categoryKey="month"
            series={SERIES}
            categoryKind="band"
            height={270}
            ariaLabel="Estimated GST paid each month across the selected fiscal year"
            tooltip={<CartesianTooltip series={[{ key: 'gstAmount', label: 'Estimated GST', color: app.indigo }]} />}
          >
            <Grid />
            <Crosshair />
            <ValueAxis />
            <CategoryAxis />
            {/* The Crosshair already draws the active band. */}
            <Bars dataKey="gstAmount" color={app.indigo} fillOpacity={0.85} barSize={32} highlightBand={false} />
          </CartesianChart>
        )}
        {monthly.length > 1 && chartDataTable(
          monthly,
          [
            { header: 'Month', rowHeader: true, value: (row) => formatChartDate(row.month) },
            { header: 'Estimated GST', value: (row) => formatCurrency(row.gstAmount) },
          ],
          'Monthly estimated GST: exact amounts',
          (row) => row.month,
        )}
      </motion.div>
    </div>
  )
}
