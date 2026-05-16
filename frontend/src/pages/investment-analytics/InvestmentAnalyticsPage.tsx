import { motion } from 'framer-motion'

import AnalyticsTimeFilter from '@/components/shared/AnalyticsTimeFilter'
import { PageSkeleton } from '@/components/shared/LoadingSkeleton'
import { PageHeader } from '@/components/ui'

import { AccountsTable } from './components/AccountsTable'
import { AssetAllocationChart } from './components/AssetAllocationChart'
import { GrowthOverTimeChart } from './components/GrowthOverTimeChart'
import { PortfolioMetrics } from './components/PortfolioMetrics'
import { useInvestmentAnalytics } from './useInvestmentAnalytics'

export default function InvestmentAnalyticsPage() {
  const m = useInvestmentAnalytics()

  if (m.totalInvestmentValue === 0) {
    return (
      <div className="min-h-screen p-4 md:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <PageHeader
            title="Investment Analytics"
            subtitle="Monitor your investment portfolio performance"
          />

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-2xl border border-border p-4 md:p-6 lg:p-8 text-center"
          >
            <p className="text-muted-foreground mb-4">No investment accounts classified yet.</p>
            <p className="text-sm text-muted-foreground">
              Go to{' '}
              <a href="/settings" className="text-primary hover:underline">
                Settings
              </a>{' '}
              to classify your accounts as Investments.
            </p>
          </motion.div>
        </div>
      </div>
    )
  }

  if (m.isLoading) return <PageSkeleton />

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
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
