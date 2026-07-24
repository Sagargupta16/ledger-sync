import { CreditCard, PiggyBank, Target, TrendingUp } from 'lucide-react'

import { CreditCardHealth } from '@/components/analytics'
import AnalyticsTimeFilter from '@/components/shared/AnalyticsTimeFilter'
import MetricCard from '@/components/shared/MetricCard'
import Sparkline from '@/components/shared/Sparkline'
import { rawColors } from '@/constants/colors'
import { PageContainer, PageHeader } from '@/components/ui'
import PageErrorState from '@/components/shared/PageErrorState'
import { PageSkeleton } from '@/components/shared/LoadingSkeleton'
import { formatCurrency, formatPercent } from '@/lib/formatters'
import { useClosedAccounts } from '@/hooks/api/useAccountStatus'

import MilestonesTable from './components/MilestonesTable'
import { AccountCategoryTable } from './components/AccountCategoryTable'
import { NetWorthTrendChart } from './components/NetWorthTrendChart'
import { useNetWorth } from './useNetWorth'

export default function NetWorthPage() {
  const m = useNetWorth()
  const closedAccountsQuery = useClosedAccounts()
  const closedAccounts = closedAccountsQuery.data ?? []

  // Leverage = liabilities as a share of assets. Reuses the totals already
  // computed in the hook; clamps the assets-zero edge so we never divide by 0.
  const leveragePct = m.totalAssets > 0 ? (m.totalLiabilities / m.totalAssets) * 100 : 0

  if (m.isLoading || closedAccountsQuery.isLoading) return <PageSkeleton />

  if (m.isError || closedAccountsQuery.isError) {
    const retryNetWorth = () => {
      m.retry()
      void closedAccountsQuery.refetch()
    }
    return (
      <PageErrorState
        title="Net Worth"
        subtitle="Assets and liabilities from your transactions (book value, not live market prices)"
        onRetry={retryNetWorth}
      />
    )
  }

  return (
    <PageContainer className="space-y-6">
        <PageHeader
          title="Net Worth"
          subtitle="Assets and liabilities from your transactions (book value, not live market prices)"
          action={<AnalyticsTimeFilter {...m.timeFilterProps} />}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
          <MetricCard
            title="Total Assets"
            value={formatCurrency(m.totalAssets)}
            icon={PiggyBank}
            color="green"
            subtitle={
              m.assetAccountCount > 0
                ? `Across ${m.assetAccountCount} account${m.assetAccountCount === 1 ? '' : 's'}`
                : undefined
            }
            isLoading={m.isLoading}
          />
          <MetricCard
            title="Total Liabilities"
            value={formatCurrency(m.totalLiabilities)}
            icon={CreditCard}
            color="red"
            subtitle={
              m.liabilityAccountCount > 0
                ? `${formatPercent(leveragePct)} of assets · ${m.liabilityAccountCount} account${m.liabilityAccountCount === 1 ? '' : 's'}`
                : 'Debt-free'
            }
            isLoading={m.isLoading}
          />
          <MetricCard
            title="Net Worth"
            value={formatCurrency(m.netWorth)}
            icon={TrendingUp}
            color="blue"
            hero
            change={m.netWorthMoMChange}
            changeLabel="vs last month"
            subtitle="Assets less liabilities"
            trend={
              m.netWorthSparkline.length >= 2 ? (
                <Sparkline
                  data={m.netWorthSparkline}
                  color={rawColors.app.blue}
                  height={40}
                  showTooltip={false}
                />
              ) : undefined
            }
            isLoading={m.isLoading}
          />
        </div>

        <NetWorthTrendChart
          isLoading={m.isLoading}
          filteredNetWorthData={m.filteredNetWorthData}
          chartData={m.chartData as Array<Record<string, number | string | null>>}
          allCategories={m.allCategories}
          showStacked={m.showStacked}
          setShowStacked={m.setShowStacked}
          showProjection={m.showProjection}
          setShowProjection={m.setShowProjection}
          monthlyGrowth={m.monthlyGrowth}
          anchor={m.anchor}
          milestoneRows={m.milestoneRows}
        />

        {/* (Monthly Net Worth Change waterfall chart removed -- the Net
            Worth Trend already shows month-over-month direction; the
            waterfall added clutter without unique insight.) */}
        <div className="glass rounded-2xl border border-border p-4 md:p-6">
          <div className="flex items-center gap-3 mb-4">
            <Target className="w-5 h-5 text-app-blue" />
            <h3 className="text-lg font-semibold text-foreground">Net Worth Milestones</h3>
          </div>
          <MilestonesTable
            rows={m.milestoneRows}
            currentNetWorth={m.currentNetWorth}
            monthlyGrowth={m.monthlyGrowth}
          />
        </div>

        <div className="glass rounded-2xl border border-border p-4 md:p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Assets (Positive Balances)</h3>
          <AccountCategoryTable
            accounts={m.accounts}
            filterFn={(b) => b > 0}
            total={m.totalAssets}
            balanceColorClass="text-app-green"
            headerBalanceColorClass="text-app-green/70"
            barColor={rawColors.app.green}
            expandedCategories={m.expandedAssetCategories}
            onToggleCategory={(cat) => m.toggleCategory(m.setExpandedAssetCategories, cat)}
            getAccountType={m.getAccountType}
            closedAccounts={closedAccounts}
            emptyIcon={PiggyBank}
            emptyTitle="No asset accounts found"
            emptyDescription="Add transactions for accounts with positive balances to see your assets."
            isLoading={m.isLoading}
          />
        </div>

        <div className="glass rounded-2xl border border-border p-4 md:p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">
            Liabilities (Negative Balances)
          </h3>
          <AccountCategoryTable
            accounts={m.accounts}
            filterFn={(b) => b < 0}
            total={m.totalLiabilities}
            balanceColorClass="text-app-red"
            headerBalanceColorClass="text-app-red/70"
            barColor={rawColors.app.red}
            expandedCategories={m.expandedLiabilityCategories}
            onToggleCategory={(cat) => m.toggleCategory(m.setExpandedLiabilityCategories, cat)}
            getAccountType={m.getAccountType}
            closedAccounts={closedAccounts}
            emptyIcon={CreditCard}
            emptyTitle="No liability accounts found"
            emptyDescription="Great news! You don't have any liability accounts with negative balances."
            isLoading={m.isLoading}
          />
        </div>

        <CreditCardHealth />
    </PageContainer>
  )
}
