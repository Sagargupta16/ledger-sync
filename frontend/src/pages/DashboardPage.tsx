import { motion } from 'framer-motion'
import { DollarSign, TrendingDown, TrendingUp, Percent, Wallet, CreditCard } from 'lucide-react'
import MetricCard from '@/components/shared/MetricCard'
import RecentTransactions from '@/components/shared/RecentTransactions'
import QuickInsights from '@/components/shared/QuickInsights'
import TimeRangeSelector, { type TimeRange } from '@/components/shared/TimeRangeSelector'
import Sparkline from '@/components/shared/Sparkline'
import EmptyState from '@/components/shared/EmptyState'
import { FinancialHealthScore, PeriodComparison } from '@/components/analytics'
import { useRecentTransactions } from '@/hooks/api/useAnalytics'
import { useMonthlyAggregation, useTotals } from '@/hooks/useAnalytics'
import { useTransactions } from '@/hooks/api/useTransactions'
import { usePreferences } from '@/hooks/api/usePreferences'
import { useState, useMemo } from 'react'
import { formatCurrency } from '@/lib/formatters'
import { getTimeRangeDateRange, filterTransactionsByDateRange } from '@/lib/dateUtils'
import { 
  calculateIncomeByCategoryBreakdown, 
  calculateSpendingBreakdown,
  calculateCashbacksTotal,
  INCOME_CATEGORY_COLORS,
  SPENDING_TYPE_COLORS,
} from '@/lib/preferencesUtils'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts'
import { chartTooltipProps, PageHeader } from '@/components/ui'
import { SEMANTIC_COLORS } from '@/constants/chartColors'

export default function DashboardPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>('6M')

  const dateRange = useMemo(() => getTimeRangeDateRange(timeRange), [timeRange])

  const { data: recentTransactions, isLoading: isLoadingTransactions } = useRecentTransactions(5)
  const { data: filteredTotals, isLoading } = useTotals(dateRange)
  const { data: monthlyData } = useMonthlyAggregation(dateRange)
  const { data: allTransactions } = useTransactions()
  const { data: preferences } = usePreferences()

  // Filter transactions once for reuse
  const filteredTransactions = useMemo(
    () => (allTransactions ? filterTransactionsByDateRange(allTransactions, dateRange) : []),
    [allTransactions, dateRange]
  )

  // Calculate income breakdown by actual data category (for display)
  const incomeBreakdown = useMemo(() => {
    if (filteredTransactions.length === 0) return null
    return calculateIncomeByCategoryBreakdown(filteredTransactions)
  }, [filteredTransactions])

  // Calculate total cashbacks using preferences classification
  const cashbacksTotal = useMemo(() => {
    if (filteredTransactions.length === 0 || !preferences) return 0
    
    // Build income classification from preferences
    const incomeClassification = {
      taxable: preferences.taxable_income_categories || [],
      investmentReturns: preferences.investment_returns_categories || [],
      nonTaxable: preferences.non_taxable_income_categories || [],
      other: preferences.other_income_categories || [],
    }
    
    return calculateCashbacksTotal(filteredTransactions, incomeClassification)
  }, [filteredTransactions, preferences])

  // Calculate spending breakdown (essential vs discretionary)
  const spendingBreakdown = useMemo(() => {
    if (filteredTransactions.length === 0 || !preferences) return null
    return calculateSpendingBreakdown(filteredTransactions, preferences.essential_categories)
  }, [filteredTransactions, preferences])

  // Prepare income breakdown for pie chart (using actual data categories)
  const incomeChartData = useMemo(() => {
    if (!incomeBreakdown) return []
    const defaultColor = SEMANTIC_COLORS.muted
    return Object.entries(incomeBreakdown)
      .filter(([, value]) => value > 0)
      .map(([category, value]) => ({
        name: category,
        value,
        color: INCOME_CATEGORY_COLORS[category] || defaultColor,
      }))
      .sort((a, b) => b.value - a.value)
  }, [incomeBreakdown])

  // Prepare spending breakdown for pie chart
  const spendingChartData = useMemo(() => {
    if (!spendingBreakdown) return []
    return [
      { name: 'Essential', value: spendingBreakdown.essential, color: SPENDING_TYPE_COLORS.essential },
      { name: 'Discretionary', value: spendingBreakdown.discretionary, color: SPENDING_TYPE_COLORS.discretionary },
    ].filter((d) => d.value > 0)
  }, [spendingBreakdown])

  // Prepare sparkline data for mini charts - show all months in the filtered range
  const incomeSparkline = useMemo(() => {
    if (!monthlyData) return []
    return Object.values(monthlyData).map((m: { income?: number }) => m.income || 0)
  }, [monthlyData])

  const expenseSparkline = useMemo(() => {
    if (!monthlyData) return []
    return Object.values(monthlyData).map((m: { expense?: number }) => Math.abs(m.expense || 0))
  }, [monthlyData])

  // MoM change %: compare the last two COMPLETE months (skip current incomplete month)
  const momChanges = useMemo(() => {
    const noChange = { income: undefined, expense: undefined, savings: undefined, savingsRate: undefined, label: 'vs prev month' }
    if (!monthlyData) return noChange
    const allMonths = Object.keys(monthlyData).sort((a, b) => a.localeCompare(b))

    // Current month key (YYYY-MM) — this month is still in progress
    const now = new Date()
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    // Drop the current month if it's the latest — it's incomplete
    const completeMonths = allMonths.at(-1) === currentMonthKey ? allMonths.slice(0, -1) : allMonths

    if (completeMonths.length < 2) return noChange
    const curr = monthlyData[completeMonths.at(-1)!]
    const prev = monthlyData[completeMonths.at(-2)!]
    const pct = (c: number, p: number) => (p === 0 ? undefined : Number((((c - p) / Math.abs(p)) * 100).toFixed(1)))
    const currSavingsRate = curr.income === 0 ? 0 : (curr.net_savings / curr.income) * 100
    const prevSavingsRate = prev.income === 0 ? 0 : (prev.net_savings / prev.income) * 100
    // Build a human-readable label like "Jan vs Dec"
    const fmt = (key: string) => {
      const [y, m] = key.split('-')
      return new Date(Number(y), Number(m) - 1).toLocaleString('default', { month: 'short' })
    }
    return {
      income: pct(curr.income, prev.income),
      expense: pct(Math.abs(curr.expense), Math.abs(prev.expense)),
      savings: pct(curr.net_savings, prev.net_savings),
      savingsRate: prev.income === 0 ? undefined : Number((currSavingsRate - prevSavingsRate).toFixed(1)),
      label: `${fmt(completeMonths.at(-1)!)} vs ${fmt(completeMonths.at(-2)!)}`,
    }
  }, [monthlyData])

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <PageHeader
        title="Dashboard"
        subtitle="Your financial overview at a glance"
        action={<TimeRangeSelector value={timeRange} onChange={setTimeRange} />}
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Total Income"
          value={filteredTotals ? formatCurrency(filteredTotals.total_income) : formatCurrency(0)}
          icon={TrendingUp}
          color="green"
          isLoading={isLoading}
          change={momChanges.income}
          changeLabel={momChanges.label}
          trend={incomeSparkline.length > 0 ? <Sparkline data={incomeSparkline} color={SEMANTIC_COLORS.income} height={30} /> : undefined}
        />
        <MetricCard
          title="Total Expenses"
          value={filteredTotals ? formatCurrency(Math.abs(filteredTotals.total_expenses)) : formatCurrency(0)}
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
          value={filteredTotals ? formatCurrency(filteredTotals.net_savings) : formatCurrency(0)}
          icon={DollarSign}
          color="blue"
          isLoading={isLoading}
          change={momChanges.savings}
          changeLabel={momChanges.label}
        />
        <MetricCard
          title="Savings Rate"
          value={filteredTotals ? `${filteredTotals.savings_rate.toFixed(1)}%` : '0%'}
          icon={Percent}
          color="purple"
          isLoading={isLoading}
          change={momChanges.savingsRate}
          changeLabel={momChanges.label ? `pts ${momChanges.label}` : 'pts vs prev month'}
        />
      </div>

      {/* Recent Activity & Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Transactions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="p-6 glass rounded-2xl border border-white/10 shadow-xl"
        >
          <h2 className="text-xl font-semibold mb-4">Recent Activity</h2>
          <RecentTransactions transactions={recentTransactions || []} isLoading={isLoadingTransactions} />
        </motion.div>

        {/* Quick Insights */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
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
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
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
                      {incomeChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      {...chartTooltipProps}
                      formatter={(value: number | undefined) => value !== undefined ? formatCurrency(value) : ''}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-2">
                {incomeChartData.map((item) => (
                  <div key={item.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: item.color }}
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
                        <span className="text-cyan-400">💳 Cashbacks Earned</span>
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
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
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
                      {spendingChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      {...chartTooltipProps}
                      formatter={(value: number | undefined) => value !== undefined ? formatCurrency(value) : ''}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-3">
                {spendingChartData.map((item) => {
                  const percentage = spendingBreakdown
                    ? ((item.value / spendingBreakdown.total) * 100).toFixed(1)
                    : '0'
                  return (
                    <div key={item.name}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: item.color }}
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
                          style={{
                            width: `${percentage}%`,
                            backgroundColor: item.color,
                          }}
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

      {/* Financial Health & Period Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <FinancialHealthScore />
        <PeriodComparison />
      </div>
    </div>
  )
}
