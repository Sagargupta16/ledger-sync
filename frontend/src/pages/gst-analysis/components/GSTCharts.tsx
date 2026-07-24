import { motion } from 'framer-motion'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

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
import { formatCurrencyCompact, formatCurrencyShort } from '@/lib/formatters'
import type { GSTSlabBreakdown, GSTSummary } from '@/lib/gstCalculator'

import { GST_SLAB_COLORS } from '../constants'

interface Props {
  data: GSTSummary
  taxableSlabs: GSTSlabBreakdown[]
}

export default function GSTCharts({ data, taxableSlabs }: Readonly<Props>) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <motion.div variants={fadeUpItem} className="glass rounded-2xl border border-border p-5">
        <h3 className="text-sm font-medium text-muted-foreground mb-4">GST by Slab</h3>
        <div className="h-[270px]">
          <ChartContainer
            width="100%"
            height="100%"
            ariaLabel="Estimated GST paid split by tax slab rate"
          >
            <PieChart>
              <Pie
                data={taxableSlabs}
                dataKey="gstAmount"
                nameKey="slab"
                cx="50%"
                cy="50%"
                outerRadius={90}
                innerRadius={50}
                paddingAngle={2}
                isAnimationActive={shouldAnimate(taxableSlabs.length)}
              >
                {taxableSlabs.map((entry) => (
                  <Cell
                    key={entry.slab}
                    fill={GST_SLAB_COLORS[entry.slab] ?? rawColors.app.blue}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={currencyTooltipFormatter}
                labelFormatter={(slab) => `${slab}% slab`}
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
                className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg bg-[var(--overlay-2)] border border-border"
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

      <motion.div variants={fadeUpItem} className="glass rounded-2xl border border-border p-5">
        <h3 className="text-sm font-medium text-muted-foreground mb-4">Monthly GST Trend</h3>
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
