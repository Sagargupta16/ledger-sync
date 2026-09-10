import { CreditCard, PiggyBank, Target, TrendingUp } from 'lucide-react'

import { CreditCardHealth } from '@/components/analytics'
import AnalyticsTimeFilter from '@/components/shared/AnalyticsTimeFilter'
import MetricCard from '@/components/shared/MetricCard'
import PartialPeriodNotice from '@/components/shared/PartialPeriodNotice'
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

function accountLabel(count: number): string {
  return count === 1 ? 'account' : 'accounts'
}

export default function NetWorthPage() {
  const m = useNetWorth()
  const closedAccountsQuery = useClosedAccounts()
  const closedAccounts = closedAccountsQuery.data ?? []

  // Leverage = liabilities as a share of assets. Reuses the totals already
  // computed in the hook; clamps the assets-zero edge so we never divide by 0.
  const leveragePct = m.totalAssets > 0 ? (m.totalLiabilities / m.totalAssets) * 100 : 0
  const assetAccountSubtitle = m.assetAccountCount > 0
    ? `Across ${m.assetAccountCount} ${accountLabel(m.assetAccountCount)}`
    : undefined
  const liabilityAccountSubtitle = m.liabilityAccountCount > 0
    ? `${formatPercent(leveragePct)} of assets · ${m.liabilityAccountCount} ${accountLabel(m.liabilityAccountCount)}`
    : 'Debt-free'

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

  if (m.isLoading || closedAccountsQuery.isLoading) return <PageSkeleton />

  return (
    <PageContainer className="space-y-6">
      <PageHeader
        title="Net Worth"
        subtitle="Assets and liabilities from your transactions (book value, not live market prices)"
        action={
          <div className="w-full sm:w-auto [&_button]:min-h-11 [&_button]:min-w-11">
            <AnalyticsTimeFilter {...m.timeFilterProps} />
          </div>
        }
      />

      {m.partialPeriod && (
        <PartialPeriodNotice
          label={m.partialPeriod.label}
          daysElapsed={m.partialPeriod.daysElapsed}
          daysTotal={m.partialPeriod.daysTotal}
          treatment={
            m.growthUsesPartialMonth
              ? 'Balances and the trend line are current to today. The month-on-month badge and the sparkline compare completed months, but there are fewer than three of those, so the growth rate behind the milestone ETAs still includes the month in progress.'
              : 'Balances and the trend line are current to today. The month-on-month badge, the sparkline and the growth rate behind the milestone ETAs compare completed months only.'
          }
        />
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-[1.15fr_1fr_1fr]">
        <div className="sm:col-span-2 lg:col-span-1 [&>*]:h-full">
          <MetricCard
            title="Net Worth"
            value={formatCurrency(m.netWorth)}
            icon={TrendingUp}
            color="blue"
            hero
            change={m.netWorthMoMChange}
            changeLabel={m.netWorthMoMLabel}
            subtitle="Assets less liabilities"
            trend={
              m.netWorthSparkline.length >= 2 ? (
                <Sparkline
                  data={m.netWorthSparkline}
                  color={rawColors.app.blue}
                  height={40}
                  showTooltip={false}
                  ariaLabel="Net worth trend"
                />
              ) : undefined
            }
            isLoading={m.isLoading}
          />
        </div>
        <MetricCard
          title="Total Assets"
          value={formatCurrency(m.totalAssets)}
          icon={PiggyBank}
          color="green"
          subtitle={assetAccountSubtitle}
          isLoading={m.isLoading}
        />
        <MetricCard
          title="Total Liabilities"
          value={formatCurrency(m.totalLiabilities)}
          icon={CreditCard}
          color="red"
          subtitle={liabilityAccountSubtitle}
          isLoading={m.isLoading}
        />
      </div>

      <NetWorthTrendChart
        isLoading={m.isLoading}
        filteredNetWorthData={m.filteredNetWorthData}
        chartData={m.chartData}
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
      <section className="ledger-panel p-4 sm:p-5" aria-labelledby="net-worth-milestones-title">
        <div className="mb-4 flex items-center gap-2.5">
          <Target className="size-5 text-app-blue" aria-hidden="true" />
          <h2 id="net-worth-milestones-title" className="text-base font-semibold text-foreground">
            Net Worth Milestones
          </h2>
        </div>
        <MilestonesTable
          rows={m.milestoneRows}
          currentNetWorth={m.currentNetWorth}
          monthlyGrowth={m.monthlyGrowth}
        />
      </section>

      <section className="ledger-panel p-4 sm:p-5" aria-labelledby="asset-accounts-title">
        <h2 id="asset-accounts-title" className="mb-4 text-base font-semibold text-foreground">
          Assets (Positive Balances)
        </h2>
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
      </section>

      <section className="ledger-panel p-4 sm:p-5" aria-labelledby="liability-accounts-title">
        <h2 id="liability-accounts-title" className="mb-4 text-base font-semibold text-foreground">
          Liabilities (Negative Balances)
        </h2>
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
          emptyDescription="You do not have liability accounts with negative balances."
          isLoading={m.isLoading}
        />
      </section>

      <CreditCardHealth />
    </PageContainer>
  )
}
