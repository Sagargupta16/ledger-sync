import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { SCROLL_FADE_UP } from '@/constants/animations'
import { DollarSign, TrendingDown, TrendingUp, Percent, Wallet, CreditCard, Lock, Hourglass, ShieldCheck } from 'lucide-react'
import MetricCard from '@/components/shared/MetricCard'
import QuickInsights from '@/components/shared/QuickInsights'
import AnalyticsTimeFilter from '@/components/shared/AnalyticsTimeFilter'
import Sparkline from '@/components/shared/Sparkline'
import EmptyState from '@/components/shared/EmptyState'
import { FinancialHealthScore } from '@/components/analytics'
import { formatCurrency, formatCurrencyCompact } from '@/lib/formatters'
import { PieChart, Pie, Cell, Tooltip } from 'recharts'
import { chartTooltipProps, PageHeader, ChartContainer } from '@/components/ui'
import { SEMANTIC_COLORS } from '@/constants/chartColors'
import { useDashboardMetrics } from '@/hooks/useDashboardMetrics'
import { computeAgeOfMoney, computeDaysOfBuffering } from '@/lib/ageOfMoneyCalculator'
import { usePreferences } from '@/hooks/api/usePreferences'
import { useRecurringTransactions } from '@/hooks/api/useAnalyticsV2'
import { toMonthlyAmount } from '@/pages/subscription-tracker/helpers'

export default function DashboardPage() {
  const { data: preferences } = usePreferences()
  const savingsGoalPercent = preferences?.savings_goal_percent ?? 20

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
    incomeBreakdown,
    cashbacksTotal,
    incomeChartData,
    incomeColorStyles,
    expenseChartData,
    expenseColorStyles,
    incomeSparkline,
    expenseSparkline,
    momChanges,
  } = useDashboardMetrics()

  // Fixed Commitments from active recurring transactions
  const { data: recurringItems = [] } = useRecurringTransactions({ active_only: true, min_confidence: 0 })
  const fixedCommitmentsMonthly = useMemo(() => {
    const confirmed = recurringItems.filter((r) => r.is_confirmed && r.type === 'Expense')
    return confirmed.reduce((sum, r) => sum + toMonthlyAmount(r.expected_amount, r.frequency), 0)
  }, [recurringItems])
  const fixedCount = useMemo(
    () => recurringItems.filter((r) => r.is_confirmed && r.type === 'Expense').length,
    [recurringItems],
  )

  // Age of Money & Days of Buffering
  const ageOfMoney = useMemo(
    () => filteredTransactions?.length ? computeAgeOfMoney(filteredTransactions) : null,
    [filteredTransactions],
  )
  const daysOfBuffering = useMemo(() => {
    if (!filteredTransactions?.length || !filteredTotals) return null
    const liquidBalance = (filteredTotals.total_income ?? 0) - Math.abs(filteredTotals.total_expenses ?? 0)
    return computeDaysOfBuffering(liquidBalance, filteredTransactions)
  }, [filteredTransactions, filteredTotals])

  const incomeTotal = useMemo(
    () => incomeChartData.reduce((sum, d) => sum + d.value, 0),
    [incomeChartData],
  )

  const expenseTotal = useMemo(
    () => expenseChartData.reduce((sum, d) => sum + d.value, 0),
    [expenseChartData],
  )

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 md:space-y-8">
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Total Income"
          value={formatCurrency(filteredTotals?.total_income ?? 0)}
          icon={TrendingUp}
          color="green"
          isLoading={isLoading}
          change={momChanges.income}
          changeLabel={momChanges.label}
          trend={incomeSparkline.length > 1 ? <Sparkline data={incomeSparkline} color={SEMANTIC_COLORS.income} height={48} /> : undefined}
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
          trend={expenseSparkline.length > 1 ? <Sparkline data={expenseSparkline} color={SEMANTIC_COLORS.expense} height={48} /> : undefined}
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
          subtitle={savingsGoalPercent === 20 ? undefined : `Target: ${savingsGoalPercent}%`}
        />
      </div>

      {/* Secondary Indicators */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {ageOfMoney !== null && (
          <MetricCard
            title="Age of Money"
            value={`${ageOfMoney} days`}
            icon={Hourglass}
            color="indigo"
            isLoading={isLoading}
            subtitle={ageOfMoney >= 30 ? 'Healthy buffer' : ageOfMoney >= 15 ? 'Building runway' : 'Living paycheck to paycheck'}
          />
        )}
        {daysOfBuffering !== null && (
          <MetricCard
            title="Days of Buffering"
            value={`${daysOfBuffering} days`}
            icon={ShieldCheck}
            color="teal"
            isLoading={isLoading}
            subtitle="At current spending rate"
          />
        )}
        <MetricCard
          title="Fixed Commitments"
          value={formatCurrency(fixedCommitmentsMonthly)}
          icon={Lock}
          color="orange"
          isLoading={isLoading}
          subtitle={fixedCount > 0 ? `${fixedCount} active recurring` : 'No recurring set'}
        />
      </div>

      {/* Financial Health Score & Quick Insights */}
      <motion.div className="grid grid-cols-1 lg:grid-cols-2 gap-6" {...SCROLL_FADE_UP}>
        <FinancialHealthScore transactions={filteredTransactions} />

        <div className="p-6 glass rounded-2xl border border-border shadow-xl">
          <h2 className="text-xl font-semibold mb-4">Quick Insights</h2>
          <QuickInsights dateRange={dateRange} />
        </div>
      </motion.div>

      {/* Income Sources & Expense Sources */}
      <motion.div className="grid grid-cols-1 lg:grid-cols-2 gap-6" {...SCROLL_FADE_UP}>
        {/* Income Sources */}
        <div className="p-6 glass rounded-2xl border border-border border-l-4 border-l-ios-green shadow-xl glow-income">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Wallet className="w-5 h-5 text-ios-green" />
            Income Sources
          </h2>
          {incomeChartData.length > 0 ? (
            <div className="space-y-4">
              <div className="h-[180px]">
                <ChartContainer>
                  <PieChart>
                    <Pie data={incomeChartData} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%" paddingAngle={2} strokeWidth={0}>
                      {incomeChartData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                    </Pie>
                    <Tooltip {...chartTooltipProps} formatter={(v: number | undefined) => formatCurrency(v ?? 0)} />
                    <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle">
                      <tspan x="50%" dy="-6" fill="#fafafa" fontSize="16" fontWeight="700">{formatCurrencyCompact(incomeTotal)}</tspan>
                      <tspan x="50%" dy="18" fill="#71717a" fontSize="11">Total</tspan>
                    </text>
                  </PieChart>
                </ChartContainer>
              </div>
              <div className="space-y-2">
                {incomeChartData.map((item, i) => (
                  <div key={item.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={incomeColorStyles[i]} />
                      <span className="text-sm">{item.name}</span>
                    </div>
                    <span className="text-sm font-medium">{formatCurrency(item.value)}</span>
                  </div>
                ))}
                {incomeBreakdown && (
                  <div className="pt-2 mt-2 border-t border-border space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Total</span>
                      <span className="text-sm font-bold text-ios-green">{formatCurrency(Object.values(incomeBreakdown).reduce((a, b) => a + b, 0))}</span>
                    </div>
                    {cashbacksTotal > 0 && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-ios-teal">Cashbacks Earned</span>
                        <span className="text-ios-teal font-medium">{formatCurrency(cashbacksTotal)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <EmptyState icon={Wallet} title="No income data available" description="Configure income categories in Settings to see your income breakdown." actionLabel="Go to Settings" actionHref="/settings" variant="compact" />
          )}
        </div>

        {/* Expense Sources */}
        <div className="p-6 glass rounded-2xl border border-border border-l-4 border-l-ios-red shadow-xl glow-expense">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-ios-red" />
            Expense Sources
          </h2>
          {expenseChartData.length > 0 ? (
            <div className="space-y-4">
              <div className="h-[180px]">
                <ChartContainer>
                  <PieChart>
                    <Pie data={expenseChartData} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%" paddingAngle={2} strokeWidth={0}>
                      {expenseChartData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                    </Pie>
                    <Tooltip {...chartTooltipProps} formatter={(v: number | undefined) => formatCurrency(v ?? 0)} />
                    <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle">
                      <tspan x="50%" dy="-6" fill="#fafafa" fontSize="16" fontWeight="700">{formatCurrencyCompact(expenseTotal)}</tspan>
                      <tspan x="50%" dy="18" fill="#71717a" fontSize="11">Total</tspan>
                    </text>
                  </PieChart>
                </ChartContainer>
              </div>
              <div className="space-y-2">
                {expenseChartData.map((item, i) => (
                  <div key={item.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={expenseColorStyles[i]} />
                      <span className="text-sm">{item.name}</span>
                    </div>
                    <span className="text-sm font-medium">{formatCurrency(item.value)}</span>
                  </div>
                ))}
                <div className="pt-2 mt-2 border-t border-border">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Total</span>
                    <span className="text-sm font-bold text-ios-red">{formatCurrency(expenseTotal)}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState icon={CreditCard} title="No expense data available" description="Upload transactions to see your expense breakdown." variant="compact" />
          )}
        </div>
      </motion.div>
    </div>
  )
}
