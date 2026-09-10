import { useMemo } from 'react'
import { motion } from 'motion/react'
import { Bar, BarChart, CartesianGrid, Pie, PieChart, Tooltip, XAxis, YAxis } from 'recharts'

import ChartEmptyState from '@/components/shared/ChartEmptyState'
import {
  BAR_RADIUS,
  ChartContainer,
  chartTooltipProps,
  currencyTooltipFormatter,
  GRID_DEFAULTS,
  xAxisDefaults,
  yAxisDefaults,
} from '@/components/ui'
import ChartSeriesLegend from '@/components/ui/ChartSeriesLegend'
import { chartDataTable } from '@/components/ui/chartDataTable'
import { referenceLine } from '@/components/ui/chartDefaults'
import { useChartPresentation } from '@/components/ui/useChartPresentation'
import { fadeUpItem } from '@/constants/animations'
import { rawColors } from '@/constants/colors'
import { tooltipLabelString } from '@/lib/chartUtils'
import { formatCurrency, formatCurrencyShort } from '@/lib/formatters'
import type { GSTSlabBreakdown, GSTSummary } from '@/lib/gstCalculator'

import { GST_SLAB_COLORS } from '../constants'

interface Props {
  data: GSTSummary
  taxableSlabs: GSTSlabBreakdown[]
}

export default function GSTCharts({ data, taxableSlabs }: Readonly<Props>) {
  const { animate, isMobile } = useChartPresentation(Math.max(taxableSlabs.length, data.monthlyTrend.length))
  const latestMonth = data.monthlyTrend.at(-1)
  // Slice colours ride on the data rows as `fill`. Recharts merges each row
  // over its sector props, so this is the supported replacement for the
  // deprecated `<Cell>` child and resolves to the exact same hex values.
  // Memoised so the `Pie` keeps a stable `data` identity and does not
  // re-run its entry animation on unrelated parent re-renders.
  const slabSlices = useMemo(
    () =>
      taxableSlabs.map((entry) => ({
        ...entry,
        fill: GST_SLAB_COLORS[entry.slab] ?? rawColors.app.blue,
      })),
    [taxableSlabs],
  )

  return (
    <div className="grid min-w-0 grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
      <motion.div variants={fadeUpItem} className="ledger-panel relative min-w-0 p-4 sm:p-6">
        <div className="mb-2">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">01 / Rate mix</p>
          <h3 className="text-xl font-semibold tracking-tight text-foreground">Estimated GST by slab</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Share of estimated GST across applied tax rates
          </p>
        </div>
        <div className="h-[240px]">
          <ChartContainer
            width="100%"
            height="100%"
            ariaLabel="Estimated GST paid split by tax slab rate"
          >
            <PieChart>
              <Pie
                data={slabSlices}
                dataKey="gstAmount"
                nameKey="slab"
                cx="50%"
                cy="50%"
                outerRadius={90}
                innerRadius={66}
                paddingAngle={2}
                cornerRadius={4}
                strokeWidth={0}
                isAnimationActive={animate}
                animationDuration={520}
                animationEasing="ease-out"
              />
              <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" pointerEvents="none">
                <tspan x="50%" dy="-6" fill={rawColors.chart.textPrimary} fontSize={22} fontFamily="var(--font-mono)" fontWeight={600}>
                  {formatCurrencyShort(data.totalGST)}
                </tspan>
                <tspan x="50%" dy="24" fill={rawColors.chart.textSubtle} fontSize={10}>
                  Estimated GST
                </tspan>
              </text>
              <Tooltip
                formatter={(value, name) => [currencyTooltipFormatter(value), `${name ?? ''}% slab`]}
                // Pie tooltip label is the `nameKey` value, i.e. the numeric slab rate.
                labelFormatter={(slab) => `${tooltipLabelString(slab)}% slab`}
                {...chartTooltipProps}
              />
            </PieChart>
          </ChartContainer>
        </div>
        <ul aria-label="GST by tax rate" className="divide-y divide-border/60 border-t border-border">
          {taxableSlabs.map((slab) => {
            const share = data.totalGST > 0 ? (slab.gstAmount / data.totalGST) * 100 : 0
            return (
              <li
                key={slab.slab}
                className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-3 py-3"
              >
                <span className="font-mono text-xs font-semibold tabular-nums text-foreground">{slab.slab}%</span>
                <div className="min-w-0">
                  <div className="h-1.5 overflow-hidden rounded-full bg-[var(--overlay-2)]" aria-hidden="true">
                    <motion.div
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: Math.max(0, Math.min(share / 100, 1)) }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                      className="h-full w-full origin-left rounded-full"
                      style={{ backgroundColor: GST_SLAB_COLORS[slab.slab] ?? rawColors.app.blue }}
                    />
                  </div>
                </div>
                <span className="text-right">
                  <span className="block font-mono text-xs font-semibold tabular-nums text-foreground">{formatCurrency(slab.gstAmount)}</span>
                  <span className="mt-0.5 block font-mono text-[10px] tabular-nums text-muted-foreground">{share.toFixed(0)}% of GST</span>
                </span>
              </li>
            )
          })}
        </ul>
        {chartDataTable(
          taxableSlabs,
          [
            { header: 'Tax slab', rowHeader: true, value: (row) => `${row.slab}%` },
            { header: 'Estimated GST', value: (row) => formatCurrency(row.gstAmount) },
            { header: 'Share of GST', value: (row) => `${(data.totalGST > 0 ? (row.gstAmount / data.totalGST) * 100 : 0).toFixed(0)}%` },
          ],
          'Estimated GST by tax slab: exact amounts',
          (row) => String(row.slab),
        )}
      </motion.div>

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
            items={[{ key: 'gst', label: 'Estimated GST', color: rawColors.app.indigo, value: formatCurrency(latestMonth.gstAmount) }]}
            caption={`Latest: ${latestMonth.monthLabel}`}
          />
        )}
        {data.monthlyTrend.length <= 1 ? (
          <ChartEmptyState
            height={isMobile ? 270 : 320}
            message="Need at least two months of spending to show a trend"
          />
        ) : (
          <ChartContainer
            width="100%"
            height={270}
            ariaLabel="Estimated GST paid each month across the selected fiscal year"
          >
            <BarChart data={data.monthlyTrend} margin={{ top: 16, right: 4, bottom: 8, left: 0 }} barCategoryGap="24%">
              <CartesianGrid {...GRID_DEFAULTS} />
              <XAxis dataKey="monthLabel" {...xAxisDefaults(data.monthlyTrend.length)} />
              <YAxis {...yAxisDefaults({ width: 52 })} tickFormatter={(value: number) => formatCurrencyShort(value)} />
              <Tooltip formatter={currencyTooltipFormatter} {...chartTooltipProps} />
              {data.monthlyTrend.some((row) => row.gstAmount < 0) && referenceLine({ y: 0, variant: 'zero' })}
              <Bar
                dataKey="gstAmount"
                name="Estimated GST"
                fill={rawColors.app.indigo}
                fillOpacity={0.85}
                radius={BAR_RADIUS}
                maxBarSize={32}
                isAnimationActive={animate}
                animationDuration={520}
                animationEasing="ease-out"
              />
            </BarChart>
          </ChartContainer>
        )}
        {data.monthlyTrend.length > 1 && chartDataTable(
          data.monthlyTrend,
          [
            { header: 'Month', rowHeader: true, value: (row) => row.monthLabel },
            { header: 'Estimated GST', value: (row) => formatCurrency(row.gstAmount) },
          ],
          'Monthly estimated GST: exact amounts',
          (row) => row.month,
        )}
      </motion.div>
    </div>
  )
}
