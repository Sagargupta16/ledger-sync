import { useNavigate } from 'react-router-dom'

import AnalyticsTimeFilter from '@/components/shared/AnalyticsTimeFilter'
import ErrorState from '@/components/shared/ErrorState'
import { FilterBanner } from '@/components/shared/FilterBanner'
import { PageSkeleton } from '@/components/shared/LoadingSkeleton'
import PartialPeriodNotice from '@/components/shared/PartialPeriodNotice'
import { PageContainer, PageHeader } from '@/components/ui'

import IncomeCategorySection from './components/IncomeCategorySection'
import IncomeMetricGrid from './components/IncomeMetricGrid'
import IncomeSourcesSection from './components/IncomeSourcesSection'
import IncomeTrendSection from './components/IncomeTrendSection'
import { useIncomeAnalysis } from './useIncomeAnalysis'

export default function IncomeAnalysisPage() {
  const navigate = useNavigate()
  const {
    isLoading,
    isError,
    retry,
    categoryFilter,
    clearCategoryFilter,
    dateRange,
    partialPeriod,
    noCompleteMonthBasis,
    timeFilterProps,
    totalIncome,
    cashbacksTotal,
    peakIncome,
    growthRate,
    primaryIncomeType,
    primaryShare,
    cashbackShare,
    incomeTypeChartData,
    monthlyTrendData,
    rollingAvgPointCount,
    rollingAvgMonths,
    avgIncome,
    incomeSeries,
  } = useIncomeAnalysis()

  if (isError) {
    return (
      <PageContainer className="space-y-6">
        <PageHeader title="Income Analysis" subtitle="Track your income sources and trends" />
        <ErrorState
          variant="card"
          title="Could not load income analysis"
          message="Your income data could not be loaded. Check your connection and try again."
          onRetry={retry}
        />
      </PageContainer>
    )
  }

  if (isLoading) return <PageSkeleton />

  return (
    <PageContainer className="space-y-6">
      <PageHeader
        title="Income Analysis"
        subtitle="Track your income sources and trends"
        action={<AnalyticsTimeFilter {...timeFilterProps} />}
      />

      <FilterBanner value={categoryFilter} label="Source" onClear={clearCategoryFilter} />
      {partialPeriod && (
        <PartialPeriodNotice
          label={partialPeriod.label}
          daysElapsed={partialPeriod.daysElapsed}
          daysTotal={partialPeriod.daysTotal}
          treatment={
            noCompleteMonthBasis
              ? 'There is no completed month here to compare against, so the trend and average cover the month so far and the growth rate and peak are withheld rather than guessed.'
              : 'Total Income includes it. The trend, average, peak and growth rate cover completed months only, so salary that has not landed yet cannot read as income collapsing.'
          }
        />
      )}
      <IncomeMetricGrid
        totalIncome={totalIncome}
        primaryIncomeType={primaryIncomeType}
        primaryShare={primaryShare}
        growthRate={growthRate}
        incomeSeries={incomeSeries}
        cashbacksTotal={cashbacksTotal}
        cashbackShare={cashbackShare}
      />
      <IncomeCategorySection
        data={incomeTypeChartData}
        totalIncome={totalIncome}
        onSelectCategory={(name) => {
          // navigate is typed `void | Promise<void>`; under BrowserRouter it
          // returns undefined and the prop expects void.
          void navigate(`/transactions?type=Income&category=${encodeURIComponent(name)}`)
        }}
      />
      <IncomeTrendSection
        data={monthlyTrendData}
        peakIncome={peakIncome}
        avgIncome={avgIncome}
        rollingAvgPointCount={rollingAvgPointCount}
        rollingAvgMonths={rollingAvgMonths}
      />
      <IncomeSourcesSection dateRange={dateRange} />
    </PageContainer>
  )
}
