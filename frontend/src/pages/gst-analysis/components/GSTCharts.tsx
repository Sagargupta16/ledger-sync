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
  shouldAnimate,
  xAxisDefaults,
  yAxisDefaults,
} from '@/components/ui'
import { fadeUpItem } from '@/constants/animations'
import { rawColors } from '@/constants/colors'
import { tooltipLabelString } from '@/lib/chartUtils'
import { formatCurrencyCompact, formatCurrencyShort } from '@/lib/formatters'
import type { GSTSlabBreakdown, GSTSummary } from '@/lib/gstCalculator'

import { GST_SLAB_COLORS } from '../constants'

interface Props {
  data: GSTSummary
  taxableSlabs: GSTSlabBreakdown[]
}

export default function GSTCharts({ data, taxableSlabs }: Readonly<Props>) {
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
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <motion.div variants={fadeUpItem} className="ledger-panel p-4 sm:p-5">
        <div className="mb-4">
          <h3 className="text-base font-semibold text-foreground">Estimated GST by slab</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Share of estimated GST across applied tax rates
          </p>
        </div>
        <div className="h-[270px]">
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
                innerRadius={50}
                paddingAngle={2}
                isAnimationActive={shouldAnimate(slabSlices.length)}
              />
              <Tooltip
                formatter={currencyTooltipFormatter}
                // Pie tooltip label is the `nameKey` value, i.e. the numeric slab rate.
                labelFormatter={(slab) => `${tooltipLabelString(slab)}% slab`}
                {...chartTooltipProps}
              />
            </PieChart>
          </ChartContainer>
        </div>
        <div className="flex flex-wrap gap-2 mt-2 justify-center">
          {taxableSlabs.map((slab) => {
            const share = data.totalGST > 0 ? (slab.gstAmount / data.totalGST) * 100 : 0
            return (
              <div
                key={slab.slab}
                className="flex items-center gap-1.5 rounded-md border border-border bg-[var(--overlay-2)] px-2 py-1 text-xs"
              >
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: GST_SLAB_COLORS[slab.slab] }}
                />
                <span className="font-medium text-foreground">{slab.slab}%</span>
                <span className="tabular-nums text-app-indigo">
                  {formatCurrencyCompact(slab.gstAmount)}
                </span>
                <span className="tabular-nums text-text-tertiary">{share.toFixed(0)}%</span>
              </div>
            )
          })}
        </div>
      </motion.div>

      <motion.div variants={fadeUpItem} className="ledger-panel p-4 sm:p-5">
        <div className="mb-4">
          <h3 className="text-base font-semibold text-foreground">Monthly estimated GST</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Month-by-month indirect tax estimate
          </p>
        </div>
        {data.monthlyTrend.length <= 1 ? (
          <ChartEmptyState
            height={270}
            message="Need at least two months of spending to show a trend"
          />
        ) : (
          <ChartContainer
            width="100%"
            height={270}
            ariaLabel="Estimated GST paid each month across the selected fiscal year"
          >
            <BarChart data={data.monthlyTrend}>
              <CartesianGrid {...GRID_DEFAULTS} />
              <XAxis dataKey="monthLabel" {...xAxisDefaults(data.monthlyTrend.length)} />
              <YAxis {...yAxisDefaults()} tickFormatter={(value: number) => formatCurrencyShort(value)} />
              <Tooltip formatter={currencyTooltipFormatter} {...chartTooltipProps} />
              <Bar
                dataKey="gstAmount"
                fill={rawColors.app.indigo}
                radius={BAR_RADIUS}
                isAnimationActive={shouldAnimate(data.monthlyTrend.length)}
              />
            </BarChart>
          </ChartContainer>
        )}
      </motion.div>
    </div>
  )
}
