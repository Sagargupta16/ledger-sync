import { useMemo } from 'react'

import { motion } from 'motion/react'
import { TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react'

import { useMonthlyAggregation } from '@/hooks/api/useAnalytics'
import { formatCurrency, formatPercent } from '@/lib/formatters'
import { chartDataTable } from '@/components/ui/chartDataTable'
import { SCROLL_FADE_UP } from '@/constants/animations'
import ChartEmptyState from '@/components/shared/ChartEmptyState'
import ErrorState from '@/components/shared/ErrorState'
import { PanelSkeleton } from '@/components/shared/LoadingSkeleton'

import CashFlowForecastChart from './CashFlowForecastChart'
import { buildForecast } from './cashFlowUtils'

export default function CashFlowForecast() {
  const { data: monthlyData, isLoading, isError, refetch } = useMonthlyAggregation()

  const forecastData = useMemo(() => buildForecast(monthlyData), [monthlyData])

  if (isLoading) {
    return <PanelSkeleton blockClassName="h-64" />
  }

  if (isError) {
    return (
      <ErrorState
        variant="card"
        title="Unable to load cash flow forecast"
        message="Your monthly totals couldn't be loaded. Try again to see the projection."
        onRetry={() => { void refetch() }}
      />
    )
  }

  if (!forecastData) {
    return (
      <div className="ledger-panel p-4 sm:p-5">
        <h3 className="mb-2 text-base font-semibold text-foreground">Cash Flow Forecast</h3>
        <ChartEmptyState message="Need at least 3 complete recorded months for forecasting." />
      </div>
    )
  }

  const { insights } = forecastData

  return (
    <motion.section {...SCROLL_FADE_UP} className="ledger-panel overflow-hidden">
      <div className="p-4 sm:p-5">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <h3 className="text-base font-semibold text-foreground">Future cash flow</h3>
              {insights.observedTrend === 'positive'
                ? <TrendingUp aria-hidden="true" className="size-4 shrink-0 text-app-green" />
                : <TrendingDown aria-hidden="true" className="size-4 shrink-0 text-app-red" />}
            </div>
            <p className="text-xs leading-relaxed text-text-tertiary">
              {forecastData.assumptions.horizonMonths} months ahead, based on {forecastData.basisMonths.length} recent complete recorded months
            </p>
          </div>
          {insights.monthsUntilConsumptionDeficit && (
            <div className="flex items-center gap-2 rounded-md border border-app-orange/20 bg-app-orange/10 px-3 py-1.5 text-xs font-medium text-app-orange">
              <AlertTriangle aria-hidden="true" className="size-3.5 shrink-0" />
              Spending exceeds income in {insights.monthsUntilConsumptionDeficit}mo
            </div>
          )}
        </div>

        <CashFlowForecastChart rows={forecastData.combined} forecastStartMonth={forecastData.forecastStartMonth} />

        <p className="mt-3 text-xs leading-relaxed text-text-tertiary">
          Recorded net savings include booked capital losses. The projection shows consumption
          surplus: income minus living expenses, before any future capital losses.
          The shaded range illustrates variation in historical consumption surplus.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-text-tertiary">
          The current month is excluded until its last calendar day. Projections start after
          the last included month; partial months are never scaled up.
        </p>
        {chartDataTable(
          forecastData.combined,
          [
            { header: 'Month', rowHeader: true, value: (row) => row.label },
            { header: 'Basis', value: (row) => row.isForecast ? 'Projected' : 'Recorded' },
            { header: 'Income', value: (row) => formatCurrency(row.income ?? row.forecastIncome ?? 0) },
            { header: 'Living expenses', value: (row) => formatCurrency(row.expense ?? row.forecastExpense ?? 0) },
            { header: 'Recorded net savings', value: (row) => row.net === undefined ? 'Not projected' : formatCurrency(row.net) },
            { header: 'Consumption surplus before capital losses', value: (row) => formatCurrency(row.consumptionSurplus ?? row.forecastNet ?? 0) },
            { header: 'Recorded capital losses', value: (row) => row.capitalLosses === undefined ? 'Not projected' : formatCurrency(row.capitalLosses) },
            { header: 'Lower estimate', value: (row) => row.isForecast && row.lower !== undefined ? formatCurrency(row.lower) : 'Not applicable' },
            { header: 'Upper estimate', value: (row) => row.isForecast && row.upper !== undefined ? formatCurrency(row.upper) : 'Not applicable' },
          ],
          'Recorded cash flow and the 12 month projection',
          (row) => row.month,
        )}
      </div>

      <div className="grid grid-cols-2 border-t border-[var(--hairline-1)] xl:grid-cols-4">
        <div className="border-r border-[var(--hairline-1)] p-3 sm:p-4">
          <p className="ledger-meta mb-1 text-text-quaternary">Avg monthly income</p>
          <p className="ledger-figure break-words text-lg font-semibold text-app-green sm:text-xl">{formatCurrency(insights.avgIncome)}</p>
          <p className="mt-1 text-xs text-text-tertiary">
            {insights.incomeGrowth >= 0 ? '↑' : '↓'} {formatPercent(Math.abs(insights.incomeGrowth))} monthly trend
          </p>
        </div>
        <div className="border-[var(--hairline-1)] p-3 sm:p-4 xl:border-r">
          <p className="ledger-meta mb-1 text-text-quaternary">Avg living expenses</p>
          <p className="ledger-figure break-words text-lg font-semibold text-app-red sm:text-xl">{formatCurrency(insights.avgExpense)}</p>
          <p className="mt-1 text-xs text-text-tertiary">
            {insights.expenseGrowth >= 0 ? '↑' : '↓'} {formatPercent(Math.abs(insights.expenseGrowth))} monthly trend
          </p>
        </div>
        <div className="border-r border-t border-[var(--hairline-1)] p-3 sm:p-4 xl:border-t-0">
          <p className="ledger-meta mb-1 text-text-quaternary">Avg recorded net savings</p>
          <p className={`ledger-figure break-words text-lg font-semibold sm:text-xl ${insights.avgNetSavings >= 0 ? 'text-app-blue' : 'text-app-red'}`}>
            {formatCurrency(insights.avgNetSavings)}
          </p>
          <p className="mt-1 text-xs leading-5 text-text-tertiary">
            From {formatCurrency(insights.avgConsumptionSurplus)} consumption surplus
            less {formatCurrency(insights.avgCapitalLosses)} recorded capital losses per month
          </p>
        </div>
        <div className="border-t border-[var(--hairline-1)] p-3 sm:p-4 xl:border-t-0">
          <p className="ledger-meta mb-1 text-text-quaternary">12-month consumption surplus</p>
          <p className={`ledger-figure break-words text-lg font-semibold sm:text-xl ${insights.projectedConsumptionSurplus >= 0 ? 'text-app-purple' : 'text-app-red'}`}>
            {insights.projectedConsumptionSurplus >= 0 ? '+' : ''}{formatCurrency(insights.projectedConsumptionSurplus)}
          </p>
          <p className="mt-1 text-xs text-text-tertiary">Projected before future capital losses</p>
        </div>
      </div>
    </motion.section>
  )
}
