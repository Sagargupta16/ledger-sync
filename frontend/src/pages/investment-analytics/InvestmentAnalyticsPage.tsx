import { TrendingUp } from 'lucide-react'

import AnalyticsTimeFilter from '@/components/shared/AnalyticsTimeFilter'
import CostBasisOnlyNotice from '@/components/shared/CostBasisOnlyNotice'
import EmptyState from '@/components/shared/EmptyState'
import PageErrorState from '@/components/shared/PageErrorState'
import { PageSkeleton } from '@/components/shared/LoadingSkeleton'
import { PageContainer, PageHeader } from '@/components/ui'

import { AccountsTable } from './components/AccountsTable'
import { AssetAllocationChart } from './components/AssetAllocationChart'
import { GrowthOverTimeChart } from './components/GrowthOverTimeChart'
import { PortfolioMetrics } from './components/PortfolioMetrics'
import { useInvestmentAnalytics } from './useInvestmentAnalytics'

export default function InvestmentAnalyticsPage() {
  const m = useInvestmentAnalytics()

  if (m.isError) {
    return (
      <PageErrorState
        title="Investment Analytics"
        subtitle="Monitor your investment portfolio performance"
        onRetry={m.retry}
      />
    )
  }

  if (m.isLoading) return <PageSkeleton />

  if (m.totalInvestmentValue === 0) {
    return (
      <PageContainer>
        <PageHeader
          title="Investment Analytics"
          subtitle="Monitor your investment portfolio performance"
        />
        <EmptyState
          icon={TrendingUp}
          title="No investment accounts classified"
          description="Classify your accounts as Investments in Settings to track portfolio value, allocation, and growth over time."
          actionLabel="Go to Settings"
          actionHref="/settings"
          variant="card"
        />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader
        title="Investment Analytics"
        subtitle="Monitor your investment portfolio performance"
        action={<AnalyticsTimeFilter {...m.timeFilterProps} />}
      />

      {/* portfolioData is already sorted by amount invested, descending. */}
      <PortfolioMetrics
        totalInvestmentValue={m.totalInvestmentValue}
        investmentAccountsCount={m.investmentAccounts.length}
        netInvestmentPL={m.netInvestmentPL}
        plPercent={m.plPercent}
        topHolding={m.portfolioData[0] ?? null}
        monthlyInvestmentTarget={m.monthlyInvestmentTarget}
        currentMonthInvestment={m.currentMonthInvestment}
        targetProgress={m.targetProgress}
        isLoading={m.isLoading}
      />

      <CostBasisOnlyNotice
        metricLabel="Portfolio return and XIRR"
        shownInstead="Every figure here is cost basis: what you contributed, where it went, and when."
      />

      <AssetAllocationChart isLoading={m.isLoading} assetAllocation={m.investmentTypeBreakdown} />

      <GrowthOverTimeChart isLoading={m.isLoading} filteredGrowthData={m.filteredGrowthData} />

      {m.portfolioData.length > 0 && (
        <AccountsTable
          portfolioData={m.portfolioData}
          totalAccountCount={m.totalInvestmentAccountCount}
        />
      )}
    </PageContainer>
  )
}
