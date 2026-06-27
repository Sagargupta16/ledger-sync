import { TrendingUp } from 'lucide-react'

import AnalyticsTimeFilter from '@/components/shared/AnalyticsTimeFilter'
import EmptyState from '@/components/shared/EmptyState'
import { PageSkeleton } from '@/components/shared/LoadingSkeleton'
import { PageHeader } from '@/components/ui'

import { AccountsTable } from './components/AccountsTable'
import { AssetAllocationChart } from './components/AssetAllocationChart'
import { GrowthOverTimeChart } from './components/GrowthOverTimeChart'
import { PortfolioMetrics } from './components/PortfolioMetrics'
import { useInvestmentAnalytics } from './useInvestmentAnalytics'

export default function InvestmentAnalyticsPage() {
  const m = useInvestmentAnalytics()

  if (m.isLoading) return <PageSkeleton />

  if (m.totalInvestmentValue === 0) {
    return (
      <div className="min-h-dvh p-4 md:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
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
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Investment Analytics"
          subtitle="Monitor your investment portfolio performance"
          action={<AnalyticsTimeFilter {...m.timeFilterProps} />}
        />

        <PortfolioMetrics
          totalInvestmentValue={m.totalInvestmentValue}
          investmentAccountsCount={m.investmentAccounts.length}
          netInvestmentPL={m.netInvestmentPL}
          plPercent={m.plPercent}
          portfolioXIRR={m.portfolioXIRR}
          monthlyInvestmentTarget={m.monthlyInvestmentTarget}
          currentMonthInvestment={m.currentMonthInvestment}
          targetProgress={m.targetProgress}
          isLoading={m.isLoading}
        />

        <AssetAllocationChart
          isLoading={m.isLoading}
          assetAllocation={m.investmentTypeBreakdown}
        />

        <GrowthOverTimeChart
          isLoading={m.isLoading}
          filteredGrowthData={m.filteredGrowthData}
        />

        {m.portfolioData.length > 0 && (
          <AccountsTable
            sortedPortfolioData={m.sortedPortfolioData}
            investSortKey={m.investSortKey}
            investSortDir={m.investSortDir}
            toggleInvestSort={m.toggleInvestSort}
          />
        )}
      </div>
    </div>
  )
}
