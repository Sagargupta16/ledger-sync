import { TrendingUp } from 'lucide-react'
import { motion } from 'framer-motion'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import ChartEmptyState from '@/components/shared/ChartEmptyState'
import {
  ACTIVE_DOT,
  BAR_RADIUS,
  ChartContainer,
  chartTooltipProps,
  GRID_DEFAULTS,
  shouldAnimate,
  xAxisDefaults,
  yAxisDefaults,
} from '@/components/ui'
import { rawColors } from '@/constants/colors'
import { formatCurrency } from '@/lib/formatters'

import { buildYearlyTaxData } from '../taxPlanningUtils'
import type { TaxPlanningModel } from '../useTaxPlanning'

interface Props {
  planning: TaxPlanningModel
}

export default function TaxYearChart({ planning }: Readonly<Props>) {
  if (planning.fyList.length === 0) return null

  const yearlyTaxData = buildYearlyTaxData(
    planning.fyList,
    planning.transactionsByFY,
    planning.multiYearProjections,
    planning.currentFYLabel,
    planning.regimeOverride,
    planning.preferredRegime,
    planning.salaryIsNetOfTds,
  )
  const hasTaxData = yearlyTaxData.some((row) => row.paidTax !== 0 || row.projected !== 0)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="glass rounded-2xl border border-border p-4 md:p-6"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2.5 bg-app-blue/10 rounded-xl">
          <TrendingUp className="w-5 h-5 text-app-blue" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Tax Per Year</h3>
          <p className="text-xs text-muted-foreground">
            Paid (red) vs projected (orange) bars on the left axis; cumulative total (blue) on the
            right axis
          </p>
        </div>
      </div>

      {!hasTaxData ? (
        <ChartEmptyState height={280} message="No tax liability found across years" />
      ) : (
        <ChartContainer
          height={300}
          ariaLabel="Tax per fiscal year -- paid versus projected, with a cumulative total trend line"
        >
          <BarChart data={yearlyTaxData} margin={{ top: 8, right: 12, bottom: 8, left: 4 }}>
            <CartesianGrid {...GRID_DEFAULTS} />
            <XAxis {...xAxisDefaults(yearlyTaxData.length)} dataKey="fy" />
            <YAxis {...yAxisDefaults()} yAxisId="left" />
            <YAxis {...yAxisDefaults()} yAxisId="right" orientation="right" />
            <Tooltip
              {...chartTooltipProps}
              formatter={(value, name) => {
                if (typeof value !== 'number' || value === 0) return ['', '']
                const labels: Record<string, string> = {
                  paidTax: 'Tax Paid',
                  projected: 'Projected Tax',
                  cumulative: 'Cumulative',
                }
                return [formatCurrency(value), labels[name ?? ''] ?? name]
              }}
              cursor={{ fill: rawColors.chart.grid }}
            />
            <Bar
              yAxisId="left"
              dataKey="paidTax"
              name="paidTax"
              stackId="tax"
              fill={rawColors.app.red}
              fillOpacity={0.7}
              maxBarSize={40}
              isAnimationActive={shouldAnimate(yearlyTaxData.length)}
              animationDuration={600}
              animationEasing="ease-out"
            />
            <Bar
              yAxisId="left"
              dataKey="projected"
              name="projected"
              stackId="tax"
              fill={rawColors.app.orange}
              fillOpacity={0.5}
              radius={BAR_RADIUS}
              maxBarSize={40}
              isAnimationActive={shouldAnimate(yearlyTaxData.length)}
              animationDuration={600}
              animationEasing="ease-out"
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="cumulative"
              name="cumulative"
              stroke={rawColors.app.blue}
              strokeWidth={2}
              strokeDasharray="6 3"
              dot={false}
              activeDot={{ ...ACTIVE_DOT, fill: rawColors.app.blue }}
              isAnimationActive={shouldAnimate(yearlyTaxData.length)}
              animationDuration={600}
            />
          </BarChart>
        </ChartContainer>
      )}
    </motion.div>
  )
}
