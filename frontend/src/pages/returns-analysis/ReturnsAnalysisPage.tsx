import AnalyticsTimeFilter from '@/components/shared/AnalyticsTimeFilter'
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
    estimatedCAGR,
    roi,
    monthlyComboData,
  } = useReturnsAnalysis()

  if (isError) {
    return (
      <PageContainer className="md:space-y-6">
        <PageHeader
          title="Returns Analysis"
          subtitle="Analyze your investment returns over time"
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
        subtitle="Analyze your investment returns over time"
        action={<AnalyticsTimeFilter {...timeFilterProps} />}
      />

      <ReturnsSummary
        netProfitLoss={netProfitLoss}
        estimatedCAGR={estimatedCAGR}
        roi={roi}
        totalIncome={totalIncome}
        totalExpenses={totalExpenses}
      />
      <ReturnsMonthlyChart data={monthlyComboData} />

      {investmentAccounts.length > 0 && (
        <>
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
          <ReturnsHoldingsChart accounts={investmentAccounts} />
        </>
      )}
    </PageContainer>
  )
}
