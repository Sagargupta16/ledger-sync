import { CashFlowForecast } from '@/components/analytics'
import AnalyticsTimeFilter from '@/components/shared/AnalyticsTimeFilter'
import PageErrorState from '@/components/shared/PageErrorState'
import { PageContainer, PageHeader } from '@/components/ui'

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

      <TrendSummaryGrid metrics={trends.metrics} isLoading={trends.isLoading} />
      <MonthlyTrendSection
        isLoading={trends.isLoading}
        data={trends.monthlyTrendWithAvg}
        peakIncome={trends.peakIncome}
        peakExpenses={trends.peakExpenses}
        peakSavings={trends.peakSavings}
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
