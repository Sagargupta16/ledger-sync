import { CashFlowForecast } from '@/components/analytics'
import AnalyticsTimeFilter from '@/components/shared/AnalyticsTimeFilter'
import PageErrorState from '@/components/shared/PageErrorState'
import PartialPeriodNotice from '@/components/shared/PartialPeriodNotice'
import { PageContainer, PageHeader } from '@/components/ui'
import { rollingAvgCaption } from '@/lib/chartUtils'

import MonthlyBreakdownTable from './components/MonthlyBreakdownTable'
import MonthlyTrendSection from './components/MonthlyTrendSection'
import SavingsRateSection from './components/SavingsRateSection'
import TrendSummaryGrid from './components/TrendSummaryGrid'
import { useTrendsForecasts } from './useTrendsForecasts'

const PAGE_TITLE = 'Trends & Forecasts'
const PAGE_SUBTITLE = 'Analyze patterns and predict future trends'

export default function TrendsForecastsPage() {
  const trends = useTrendsForecasts()

  if (trends.isError) {
    return (
      <PageErrorState
        title={PAGE_TITLE}
        subtitle={PAGE_SUBTITLE}
        message="We could not load your trends, transactions, and preferences. Check your connection and try again."
        onRetry={trends.retry}
      />
    )
  }

  return (
    <PageContainer>
      <PageHeader
        title={PAGE_TITLE}
        subtitle={PAGE_SUBTITLE}
        action={<AnalyticsTimeFilter {...trends.timeFilterProps} />}
      />

      {trends.partialMonth && (
        <PartialPeriodNotice
          label={trends.partialMonth.label}
          daysElapsed={trends.partialMonth.daysElapsed}
          daysTotal={trends.partialMonth.daysTotal}
          treatment="Trends, averages and the month-on-month table cover completed months only, so a half-month of income cannot masquerade as a spending win."
        />
      )}

      <TrendSummaryGrid metrics={trends.metrics} isLoading={trends.isLoading} />
      {!trends.isLoading && trends.averageMonthCount > 0 && (
        <p className="text-sm text-text-tertiary">
          Averages and trends cover{' '}
          <span className="font-medium text-foreground tabular-nums">
            {trends.averageMonthCount}
          </span>{' '}
          completed {trends.averageMonthCount === 1 ? 'month' : 'months'} of data.{' '}
          {rollingAvgCaption(trends.rollingAvgPointCount, trends.rollingAvgMonths)}
        </p>
      )}
      <MonthlyTrendSection
        isLoading={trends.isLoading}
        data={trends.monthlyTrendWithAvg}
        peakIncome={trends.peakIncome}
        peakExpenses={trends.peakExpenses}
        peakSavings={trends.peakSavings}
        rollingAvgPointCount={trends.rollingAvgPointCount}
        rollingAvgMonths={trends.rollingAvgMonths}
        activeLabel={trends.activeLabel}
        onActiveLabelChange={trends.setActiveLabel}
      />
      <SavingsRateSection
        isLoading={trends.isLoading}
        data={trends.dailySavingsData}
        savingsGoalPercent={trends.savingsGoalPercent}
      />
      <MonthlyBreakdownTable
        isLoading={trends.isLoading}
        chartData={trends.recentChartData}
      />
      <CashFlowForecast />
    </PageContainer>
  )
}
