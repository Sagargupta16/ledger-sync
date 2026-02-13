import { motion } from 'framer-motion'
import { fadeUpWithDelay } from '@/constants/animations'
import { DollarSign, TrendingDown, TrendingUp, Percent, Wallet, CreditCard } from 'lucide-react'
import MetricCard from '@/components/shared/MetricCard'
import RecentTransactions from '@/components/shared/RecentTransactions'
import QuickInsights from '@/components/shared/QuickInsights'
import AnalyticsTimeFilter from '@/components/shared/AnalyticsTimeFilter'
import Sparkline from '@/components/shared/Sparkline'
import EmptyState from '@/components/shared/EmptyState'
import { FinancialHealthScore, PeriodComparison } from '@/components/analytics'
import { formatCurrency } from '@/lib/formatters'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts'
import { chartTooltipProps, PageHeader } from '@/components/ui'
import { SEMANTIC_COLORS } from '@/constants/chartColors'
import { useDashboardMetrics } from '@/hooks/useDashboardMetrics'

export default function DashboardPage() {
  const {
    viewMode,
    setViewMode,
    currentYear,
    setCurrentYear,
    currentMonth,
    setCurrentMonth,
    currentFY,
    setCurrentFY,
    fiscalYearStartMonth,
    dataDateRange,
    dateRange,
    filteredTotals,
    isLoading,
    filteredTransactions,
    recentTransactions,
    isLoadingTransactions,
    incomeBreakdown,
    cashbacksTotal,
    incomeChartData,
    incomeColorStyles,
    spendingBreakdown,
    spendingChartData,
    spendingColorStyles,
    spendingBarStyles,
    incomeSparkline,
    expenseSparkline,
    momChanges,
  } = useDashboardMetrics()

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <PageHeader
        title="Dashboard"
        subtitle="Your financial overview at a glance"
        action={
          <AnalyticsTimeFilter
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            currentYear={currentYear}
            currentMonth={currentMonth}
            currentFY={currentFY}
            onYearChange={setCurrentYear}
            onMonthChange={setCurrentMonth}
            onFYChange={setCurrentFY}
            minDate={dataDateRange.minDate}
            maxDate={dataDateRange.maxDate}
            fiscalYearStartMonth={fiscalYearStartMonth}
          />
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Total Income"
          value={formatCurrency(filteredTotals?.total_income ?? 0)}
          icon={TrendingUp}
          color="green"
          isLoading={isLoading}
          change={momChanges.income}
          changeLabel={momChanges.label}
          trend={incomeSparkline.length > 0 ? <Sparkline data={incomeSparkline} color={SEMANTIC_COLORS.income} height={30} /> : undefined}
        />
        <MetricCard
          title="Total Expenses"
          value={formatCurrency(Math.abs(filteredTotals?.total_expenses ?? 0))}
          icon={TrendingDown}
          color="red"
          isLoading={isLoading}
          change={momChanges.expense}
          invertChange
          changeLabel={momChanges.label}
          trend={expenseSparkline.length > 0 ? <Sparkline data={expenseSparkline} color={SEMANTIC_COLORS.expense} height={30} /> : undefined}
        />
        <MetricCard
          title="Net Savings"
          value={formatCurrency(filteredTotals?.net_savings ?? 0)}
          icon={DollarSign}
          color="blue"
          isLoading={isLoading}
          change={momChanges.savings}
          changeLabel={momChanges.label}
        />
        <MetricCard
          title="Savings Rate"
          value={`${(filteredTotals?.savings_rate ?? 0).toFixed(1)}%`}
          icon={Percent}
          color="purple"
          isLoading={isLoading}
          change={momChanges.savingsRate}
          changeLabel={momChanges.label ? `pts ${momChanges.label}` : 'pts vs prev month'}
        />
      </div>

      {/* Financial Health & Quick Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <FinancialHealthScore transactions={filteredTransactions} />

        <motion.div
          {...fadeUpWithDelay(0.2)}
          className="p-6 glass rounded-2xl border border-white/10 shadow-xl"
        >
          <h2 className="text-xl font-semibold mb-4">Quick Insights</h2>
          <QuickInsights dateRange={dateRange} />
        </motion.div>
      </div>

      {/* Income & Spending Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Income Sources Breakdown */}
        <motion.div
          {...fadeUpWithDelay(0.4)}
          className="p-6 glass rounded-2xl border border-white/10 shadow-xl"
        >
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Wallet className="w-5 h-5 text-green-500" />
            Income Sources
          </h2>
          {incomeChartData.length > 0 ? (
            <div className="flex items-center gap-6">
              <div className="w-40 h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={incomeChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={35}
                      outerRadius={65}
                      dataKey="value"
                      stroke="none"
                    >
                      {incomeChartData.map((entry) => (
                        <Cell key={`cell-${entry.name}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      {...chartTooltipProps}
                      formatter={(value: number | undefined) => value === undefined ? '' : formatCurrency(value)}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-2">
                {incomeChartData.map((item, i) => (
                  <div key={item.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={incomeColorStyles[i]}
                      />
                      <span className="text-sm">{item.name}</span>
                    </div>
                    <span className="text-sm font-medium">{formatCurrency(item.value)}</span>
                  </div>
                ))}
                {incomeBreakdown && (
                  <div className="pt-2 mt-2 border-t border-white/10 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Total</span>
                      <span className="text-sm font-bold text-green-500">
                        {formatCurrency(
                          Object.values(incomeBreakdown).reduce((a, b) => a + b, 0)
                        )}
                      </span>
                    </div>
                    {cashbacksTotal > 0 && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-cyan-400">Cashbacks Earned</span>
                        <span className="text-cyan-400 font-medium">
                          {formatCurrency(cashbacksTotal)}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <EmptyState
              icon={Wallet}
              title="No income data available"
              description="Configure income categories in Settings to see your income breakdown."
              actionLabel="Go to Settings"
              actionHref="/settings"
              variant="compact"
            />
          )}
        </motion.div>

        {/* Essential vs Discretionary Spending */}
        <motion.div
          {...fadeUpWithDelay(0.5)}
          className="p-6 glass rounded-2xl border border-white/10 shadow-xl"
        >
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-red-500" />
            Spending Breakdown
          </h2>
          {spendingChartData.length > 0 ? (
            <div className="flex items-center gap-6">
              <div className="w-40 h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={spendingChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={35}
                      outerRadius={65}
                      dataKey="value"
                      stroke="none"
                    >
                      {spendingChartData.map((entry) => (
                        <Cell key={`cell-${entry.name}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      {...chartTooltipProps}
                      formatter={(value: number | undefined) => value === undefined ? '' : formatCurrency(value)}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-3">
                {spendingChartData.map((item, i) => {
                  const percentage = spendingBreakdown
                    ? ((item.value / spendingBreakdown.total) * 100).toFixed(1)
                    : '0'
                  return (
                    <div key={item.name}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={spendingColorStyles[i]}
                          />
                          <span className="text-sm">{item.name}</span>
                        </div>
                        <span className="text-sm font-medium">
                          {formatCurrency(item.value)} ({percentage}%)
                        </span>
                      </div>
                      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={spendingBarStyles[i]}
                        />
                      </div>
                    </div>
                  )
                })}
                {spendingBreakdown && (
                  <div className="pt-2 mt-2 border-t border-white/10">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Total Spending</span>
                      <span className="text-sm font-bold text-red-500">
                        {formatCurrency(spendingBreakdown.total)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <EmptyState
              icon={CreditCard}
              title="No spending data available"
              description="Configure essential categories in Settings to see your spending breakdown."
              actionLabel="Go to Settings"
              actionHref="/settings"
              variant="compact"
            />
          )}
        </motion.div>
      </div>

      {/* Recent Activity & Period Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          {...fadeUpWithDelay(0.5)}
          className="p-6 glass rounded-2xl border border-white/10 shadow-xl"
        >
          <h2 className="text-xl font-semibold mb-4">Recent Activity</h2>
          <RecentTransactions transactions={recentTransactions ?? []} isLoading={isLoadingTransactions} />
        </motion.div>
        <PeriodComparison />
      </div>
    </div>
  )
}
