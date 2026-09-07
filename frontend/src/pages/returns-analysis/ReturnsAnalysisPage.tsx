import AnalyticsTimeFilter from '@/components/shared/AnalyticsTimeFilter'
import CostBasisOnlyNotice from '@/components/shared/CostBasisOnlyNotice'
import ErrorState from '@/components/shared/ErrorState'
import { PageSkeleton } from '@/components/shared/LoadingSkeleton'
import { PageContainer, PageHeader } from '@/components/ui'

import ReturnsBreakdown from './components/ReturnsBreakdown'
import ReturnsHoldingsChart from './components/ReturnsHoldingsChart'
import ReturnsMonthlyChart from './components/ReturnsMonthlyChart'
import ReturnsSummary from './components/ReturnsSummary'
import { useReturnsAnalysis } from './useReturnsAnalysis'

export default function ReturnsAnalysisPage() {
  const {
    isLoading,
    isError,
    retry,
    timeFilterProps,
    investmentAccounts,
    dividendIncome,
    brokerFees,
    interestIncome,
    investmentProfit,
    investmentLoss,
    netProfitLoss,
    totalIncome,
    totalExpenses,
    realisedEventCount,
    monthlyComboData,
  } = useReturnsAnalysis()

  if (isError) {
    return (
      <PageContainer className="md:space-y-6">
        <PageHeader
          title="Returns Analysis"
          subtitle="Review realised investment cash income, losses, and account book values"
        />
        <ErrorState
          variant="card"
          title="Could not load returns analysis"
          message="We could not fetch your transactions and balances. Check your connection and try again."
          onRetry={retry}
        />
      </PageContainer>
    )
  }

  if (isLoading) return <PageSkeleton />

  return (
    <PageContainer className="md:space-y-6">
      <PageHeader
        title="Returns Analysis"
        subtitle="Review realised investment cash income, losses, and account book values"
        action={
          <div className="w-full sm:w-auto [&_button]:min-h-11 [&_button]:min-w-11">
            <AnalyticsTimeFilter {...timeFilterProps} />
          </div>
        }
      />

      <ReturnsSummary
        netProfitLoss={netProfitLoss}
        totalIncome={totalIncome}
        totalExpenses={totalExpenses}
        realisedEventCount={realisedEventCount}
      />

      <CostBasisOnlyNotice
        metricLabel="CAGR and monthly ROI"
        shownInstead="This page reports realised cash only: dividends, interest, booked profit or loss, and broker costs."
      />

      <ReturnsMonthlyChart data={monthlyComboData} />

      {realisedEventCount > 0 && (
        <ReturnsBreakdown
          investmentProfit={investmentProfit}
          dividendIncome={dividendIncome}
          interestIncome={interestIncome}
          investmentLoss={investmentLoss}
          brokerFees={brokerFees}
          totalIncome={totalIncome}
          totalExpenses={totalExpenses}
          netProfitLoss={netProfitLoss}
        />
      )}

      {investmentAccounts.length > 0 && <ReturnsHoldingsChart accounts={investmentAccounts} />}
    </PageContainer>
  )
}
