import { motion } from 'motion/react'

import { CategoryAxis, ValueAxis } from '@/components/charts/Axis'
import Bars from '@/components/charts/Bars'
import CartesianChart, { type SeriesSpec } from '@/components/charts/CartesianChart'
import CartesianTooltip, { type TooltipSeries } from '@/components/charts/CartesianTooltip'
import Grid from '@/components/charts/Grid'
import LineSeries from '@/components/charts/LineSeries'
import ChartEmptyState from '@/components/shared/ChartEmptyState'
import { BAR_RADIUS } from '@/components/ui'
import ChartSeriesLegend from '@/components/ui/ChartSeriesLegend'
import { chartDataTable } from '@/components/ui/chartDataTable'
import { useIsMobile } from '@/hooks/useIsMobile'
import { formatCurrency, formatCurrencyShort } from '@/lib/formatters'
import { colors } from '@/constants/colors'

import { buildYearlyTaxData } from '../taxPlanningUtils'
import type { TaxPlanningModel } from '../useTaxPlanning'
import { shortFyLabel, taxYearChartLayout } from './taxChartLayout'

interface Props {
  planning: TaxPlanningModel
}

/** Recorded-income tax at the base of each year's stack, the remaining projection on top. */
const TAX_STACK = ['paidTax', 'projected'] as const
const SERIES: readonly SeriesSpec[] = [
  { key: 'paidTax', stackId: 'tax' },
  { key: 'projected', stackId: 'tax' },
  { key: 'cumulative', axis: 'right' },
]
const TOOLTIP_SERIES: readonly TooltipSeries[] = [
  { key: 'paidTax', label: 'Tax on recorded income', color: colors.app.red },
  { key: 'projected', label: 'Projected Tax', color: colors.app.orange },
  { key: 'cumulative', label: 'Cumulative', color: colors.app.blue },
]
const BAR_SIZE = 48
/** Four series steps (0.48s): the cumulative line sweeps in as the yearly stacks finish rising. */
const LINE_AFTER_BARS = 4
const fyLabel = (fy: string) => fy

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
  const layout = taxYearChartLayout(isMobile, cumulativeTaxMax)
  const latestYear = yearlyTaxData.at(-1)
  const cumulativeScaleShort = `${formatCurrencyShort(0)}-${formatCurrencyShort(cumulativeTaxMax)}`
  const chartAriaLabel = isMobile
    ? `Tax per fiscal year, recorded-income estimates and projections. Cumulative tax uses the right scale from ${formatCurrency(0)} to ${formatCurrency(cumulativeTaxMax)}.`
    : 'Tax per fiscal year, recorded-income estimates and projections, with a cumulative total trend line'

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
            Tax on recorded income and remaining projections, with a cumulative total
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
            { key: 'paid', label: 'Recorded-income estimate', color: colors.app.red },
            { key: 'projected', label: 'Projected', color: colors.app.orange },
            { key: 'cumulative', label: 'Cumulative total', color: colors.app.blue },
          ]}
          caption={`${yearlyTaxData.length} fiscal ${yearlyTaxData.length === 1 ? 'year' : 'years'}`}
        />
      )}
      {!hasTaxData ? (
        <ChartEmptyState height={280} message="No tax liability found across years" />
      ) : (
        <CartesianChart
          data={yearlyTaxData}
          categoryKey="fy"
          categoryKind="band"
          series={SERIES}
          value2Domain={layout.value2Domain}
          margin={layout.margin}
          bandPadding={0.28}
          height={340}
          mobileHeight={270}
          ariaLabel={chartAriaLabel}
          // A past year has no projected tax and a future one no recorded tax: zero rows stay out.
          tooltip={<CartesianTooltip series={TOOLTIP_SERIES} formatLabel={fyLabel} hideZero />}
        >
          <Grid />
          <ValueAxis />
          <ValueAxis axis="right" hide={layout.hideRightAxis} />
          <CategoryAxis tickFormatter={isMobile ? shortFyLabel : fyLabel} />
          <Bars
            dataKey="paidTax"
            color={colors.app.red}
            fillOpacity={0.9}
            radius={BAR_RADIUS[0]}
            stackKeys={TAX_STACK}
            barSize={BAR_SIZE}
          />
          <Bars
            dataKey="projected"
            color={colors.app.orange}
            fillOpacity={0.35}
            stroke={colors.app.orange}
            strokeDasharray="3 3"
            radius={BAR_RADIUS[0]}
            stackKeys={TAX_STACK}
            barSize={BAR_SIZE}
          />
          <LineSeries
            dataKey="cumulative"
            color={colors.app.blue}
            strokeWidth={2.5}
            dash="4 4"
            seriesIndex={LINE_AFTER_BARS}
          />
        </CartesianChart>
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
          { header: 'Tax on recorded income', value: (row) => formatCurrency(row.paidTax) },
          { header: 'Projected tax', value: (row) => formatCurrency(row.projected) },
          { header: 'Cumulative tax', value: (row) => formatCurrency(row.cumulative) },
        ],
        'Tax per fiscal year: exact amounts',
        (row) => row.fy,
      )}
    </motion.div>
  )
}
