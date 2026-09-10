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
  xAxisDefaults,
  yAxisDefaults,
} from '@/components/ui'
import ChartSeriesLegend from '@/components/ui/ChartSeriesLegend'
import { chartDataTable } from '@/components/ui/chartDataTable'
import { useChartPresentation } from '@/components/ui/useChartPresentation'
import { rawColors } from '@/constants/colors'
import { formatCurrency, formatCurrencyShort } from '@/lib/formatters'

import { buildYearlyTaxData } from '../taxPlanningUtils'
import type { TaxPlanningModel } from '../useTaxPlanning'

interface Props {
  planning: TaxPlanningModel
}

function getTaxChartLayout(isMobile: boolean) {
  return {
    height: isMobile ? 270 : 340,
    marginRight: isMobile ? 8 : 12,
    leftAxisWidth: isMobile ? 48 : 52,
    rightAxisWidth: isMobile ? 0 : 52,
  }
}

export default function TaxYearChart({ planning }: Readonly<Props>) {
  const { animate, isMobile } = useChartPresentation(planning.fyList.length)

  if (planning.fyList.length === 0) return null

  const layout = getTaxChartLayout(isMobile)
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
  const latestYear = yearlyTaxData.at(-1)
  const cumulativeScaleShort = `${formatCurrencyShort(0)}-${formatCurrencyShort(cumulativeTaxMax)}`
  const chartAriaLabel = isMobile
    ? `Tax per fiscal year -- paid versus projected. Cumulative tax uses the right scale from ${formatCurrency(0)} to ${formatCurrency(cumulativeTaxMax)}.`
    : 'Tax per fiscal year -- paid versus projected, with a cumulative total trend line'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.12, duration: 0.2 }}
      className="ledger-panel relative min-w-0 p-4 md:p-6"
    >
      <div className="mb-6 flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Annual liability
          </p>
          <h3 className="text-xl font-semibold tracking-tight">Tax per year</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Paid and projected tax, with a cumulative total
          </p>
        </div>
        {hasTaxData && latestYear && (
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Cumulative through {latestYear.fy}</p>
            <p className="mt-1.5 break-words font-mono text-2xl font-semibold tracking-tight tabular-nums text-foreground">
              {formatCurrency(latestYear.cumulative)}
            </p>
          </div>
        )}
      </div>

      {hasTaxData && (
        <ChartSeriesLegend
          items={[
            { key: 'paid', label: 'Tax paid', color: rawColors.app.red },
            { key: 'projected', label: 'Projected', color: rawColors.app.orange },
            { key: 'cumulative', label: 'Cumulative total', color: rawColors.app.blue },
          ]}
          caption={`${yearlyTaxData.length} fiscal ${yearlyTaxData.length === 1 ? 'year' : 'years'}`}
        />
      )}
      {!hasTaxData ? (
        <ChartEmptyState height={280} message="No tax liability found across years" />
      ) : (
        <ChartContainer
          height={layout.height}
          ariaLabel={chartAriaLabel}
        >
          <BarChart data={yearlyTaxData} margin={{ top: 16, right: layout.marginRight, bottom: 8, left: 0 }} barCategoryGap="28%">
            <CartesianGrid {...GRID_DEFAULTS} />
            <XAxis
              {...xAxisDefaults(yearlyTaxData.length)}
              dataKey="fy"
              tickFormatter={(fy: string) => isMobile ? fy.replace(/^FY\s+/i, '') : fy}
            />
            <YAxis
              {...yAxisDefaults()}
              yAxisId="left"
              tickFormatter={(value: number) => formatCurrencyShort(value)}
              width={layout.leftAxisWidth}
            />
            <YAxis
              {...yAxisDefaults()}
              yAxisId="right"
              orientation="right"
              tickFormatter={(value: number) => formatCurrencyShort(value)}
              width={layout.rightAxisWidth}
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
            />
            <Bar
              yAxisId="left"
              dataKey="paidTax"
              name="paidTax"
              stackId="tax"
              fill={rawColors.app.red}
              fillOpacity={0.9}
              maxBarSize={48}
              isAnimationActive={animate}
              animationDuration={520}
              animationEasing="ease-out"
            />
            <Bar
              yAxisId="left"
              dataKey="projected"
              name="projected"
              stackId="tax"
              fill={rawColors.app.orange}
              fillOpacity={0.35}
              stroke={rawColors.app.orange}
              strokeWidth={1}
              strokeDasharray="3 3"
              radius={BAR_RADIUS}
              maxBarSize={48}
              isAnimationActive={animate}
              animationDuration={520}
              animationEasing="ease-out"
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="cumulative"
              name="cumulative"
              stroke={rawColors.app.blue}
              strokeWidth={2.5}
              strokeDasharray="4 4"
              dot={yearlyTaxData.length === 1 ? { r: 4, fill: rawColors.app.blue, strokeWidth: 0 } : false}
              activeDot={{ ...ACTIVE_DOT, fill: rawColors.app.blue }}
              isAnimationActive={animate}
              animationDuration={520}
              animationEasing="ease-out"
            />
          </BarChart>
        </ChartContainer>
      )}
      {hasTaxData && (
        <div className="mt-3 flex flex-wrap justify-between gap-x-4 gap-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
          <span>Annual tax / left scale</span>
          <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
            <span className="h-0.5 w-4 shrink-0 bg-app-blue" aria-hidden="true" />
            <span className="min-w-0 truncate">
              Cumulative{isMobile ? `: ${cumulativeScaleShort}` : ' / right scale'}
            </span>
          </span>
        </div>
      )}
      {hasTaxData && chartDataTable(
        yearlyTaxData,
        [
          { header: 'Fiscal year', rowHeader: true, value: (row) => row.fy },
          { header: 'Tax paid', value: (row) => formatCurrency(row.paidTax) },
          { header: 'Projected tax', value: (row) => formatCurrency(row.projected) },
          { header: 'Cumulative tax', value: (row) => formatCurrency(row.cumulative) },
        ],
        'Tax per fiscal year: exact amounts',
        (row) => row.fy,
      )}
    </motion.div>
  )
}
