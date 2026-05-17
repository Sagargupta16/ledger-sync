import { motion } from 'framer-motion'
import { CreditCard, PiggyBank, Target, TrendingUp } from 'lucide-react'

import { CreditCardHealth } from '@/components/analytics'
import AnalyticsTimeFilter from '@/components/shared/AnalyticsTimeFilter'
import MetricCard from '@/components/shared/MetricCard'
import { PageHeader } from '@/components/ui'
import { formatCurrency } from '@/lib/formatters'

import MilestonesTable from './components/MilestonesTable'
import { AccountCategoryTable } from './components/AccountCategoryTable'
import { NetWorthTrendChart } from './components/NetWorthTrendChart'
import { useNetWorth } from './useNetWorth'

export default function NetWorthPage() {
  const m = useNetWorth()

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Net Worth"
          subtitle="Track your total assets and liabilities"
          action={<AnalyticsTimeFilter {...m.timeFilterProps} />}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
          <MetricCard
            title="Total Assets"
            value={formatCurrency(m.totalAssets)}
            icon={PiggyBank}
            color="green"
            isLoading={m.isLoading}
          />
          <MetricCard
            title="Total Liabilities"
            value={formatCurrency(m.totalLiabilities)}
            icon={CreditCard}
            color="red"
            isLoading={m.isLoading}
          />
          <MetricCard
            title="Net Worth"
            value={formatCurrency(m.netWorth)}
            icon={TrendingUp}
            color="blue"
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
          monthlyGrowthRate={m.monthlyGrowthRate}
          anchor={m.anchor}
          milestoneRows={m.milestoneRows}
        />

        {/* (Monthly Net Worth Change waterfall chart removed -- the Net
            Worth Trend already shows month-over-month direction; the
            waterfall added clutter without unique insight.) */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-50px' }}
          transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="glass rounded-2xl border border-border p-4 md:p-6"
        >
          <div className="flex items-center gap-3 mb-4">
            <Target className="w-5 h-5 text-app-blue" />
            <h3 className="text-lg font-semibold text-white">Net Worth Milestones</h3>
          </div>
          <MilestonesTable
            rows={m.milestoneRows}
            currentNetWorth={m.currentNetWorth}
            monthlyGrowthRate={m.monthlyGrowthRate}
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-50px' }}
          transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="glass rounded-2xl border border-border p-4 md:p-6"
        >
          <h3 className="text-lg font-semibold text-white mb-4">Assets (Positive Balances)</h3>
          <AccountCategoryTable
            accounts={m.accounts}
            filterFn={(b) => b > 0}
            total={m.totalAssets}
            balanceColorClass="text-app-green"
            headerBalanceColorClass="text-app-green/70"
            expandedCategories={m.expandedAssetCategories}
            onToggleCategory={(cat) => m.toggleCategory(m.setExpandedAssetCategories, cat)}
            getAccountType={m.getAccountType}
            emptyIcon={PiggyBank}
            emptyTitle="No asset accounts found"
            emptyDescription="Add transactions for accounts with positive balances to see your assets."
            isLoading={m.isLoading}
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-50px' }}
          transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="glass rounded-2xl border border-border p-4 md:p-6"
        >
          <h3 className="text-lg font-semibold text-white mb-4">
            Liabilities (Negative Balances)
          </h3>
          <AccountCategoryTable
            accounts={m.accounts}
            filterFn={(b) => b < 0}
            total={m.totalLiabilities}
            balanceColorClass="text-app-red"
            headerBalanceColorClass="text-app-red/70"
            expandedCategories={m.expandedLiabilityCategories}
            onToggleCategory={(cat) => m.toggleCategory(m.setExpandedLiabilityCategories, cat)}
            getAccountType={m.getAccountType}
            emptyIcon={CreditCard}
            emptyTitle="No liability accounts found"
            emptyDescription="Great news! You don't have any liability accounts with negative balances."
            isLoading={m.isLoading}
          />
        </motion.div>

        <CreditCardHealth />
      </div>
    </div>
  )
}
