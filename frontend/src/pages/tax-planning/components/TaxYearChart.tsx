import { TrendingUp } from 'lucide-react'
import { motion } from 'motion/react'
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
import { useIsMobile } from '@/hooks/useIsMobile'
import { formatCurrency, formatCurrencyShort } from '@/lib/formatters'

import { buildYearlyTaxData } from '../taxPlanningUtils'
import type { TaxPlanningModel } from '../useTaxPlanning'

interface Props {
  planning: TaxPlanningModel
}

export default function TaxYearChart({ planning }: Readonly<Props>) {
  const isMobile = useIsMobile()

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
  const cumulativeTaxMax = Math.max(0, ...yearlyTaxData.map((row) => row.cumulative))
  const cumulativeScaleShort = `${formatCurrencyShort(0)}-${formatCurrencyShort(cumulativeTaxMax)}`
  const chartAriaLabel = isMobile
    ? `Tax per fiscal year -- paid versus projected. Cumulative tax uses the right scale from ${formatCurrency(0)} to ${formatCurrency(cumulativeTaxMax)}.`
    : 'Tax per fiscal year -- paid versus projected, with a cumulative total trend line'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.12, duration: 0.2 }}
      className="ledger-panel p-4 md:p-6"
    >
      <div className="mb-4 flex items-start gap-3">
        <div className="rounded-md bg-app-blue/10 p-2.5">
          <TrendingUp className="size-5 text-app-blue" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-semibold">Tax per year</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Annual liability and cumulative total
          </p>
        </div>
      </div>

      {!hasTaxData ? (
        <ChartEmptyState height={280} message="No tax liability found across years" />
      ) : (
        <ChartContainer
          height={isMobile ? 270 : 300}
          ariaLabel={chartAriaLabel}
        >
          <BarChart data={yearlyTaxData} margin={{ top: 8, right: 12, bottom: 8, left: 4 }}>
            <CartesianGrid {...GRID_DEFAULTS} />
            <XAxis {...xAxisDefaults(yearlyTaxData.length)} dataKey="fy" />
            <YAxis
              {...yAxisDefaults()}
              yAxisId="left"
              tickFormatter={(value: number) => formatCurrencyShort(value)}
              width={isMobile ? 40 : 44}
            />
            <YAxis
              {...yAxisDefaults()}
              yAxisId="right"
              orientation="right"
              tickFormatter={(value: number) => formatCurrencyShort(value)}
              width={isMobile ? 0 : 44}
              hide={isMobile}
              domain={isMobile ? [0, cumulativeTaxMax] : undefined}
            />
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
              animationDuration={450}
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
              animationDuration={450}
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
              animationDuration={450}
            />
          </BarChart>
        </ChartContainer>
      )}
      {hasTaxData && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-app-red/70" aria-hidden="true" />
            Tax paid
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-app-orange/50" aria-hidden="true" />
            Projected
          </span>
          <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
            <span className="h-0.5 w-4 shrink-0 bg-app-blue" aria-hidden="true" />
            <span className="min-w-0 truncate">
              Cumulative{isMobile ? `: ${cumulativeScaleShort}` : ''}
            </span>
          </span>
        </div>
      )}
    </motion.div>
  )
}
