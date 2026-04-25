import { useMemo } from 'react'

import { motion } from 'framer-motion'
import { Wallet, CreditCard } from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip } from 'recharts'

import { SCROLL_FADE_UP } from '@/constants/animations'
import QuickInsights from '@/components/shared/QuickInsights'
import { PageSkeleton } from '@/components/shared/LoadingSkeleton'
import AnalyticsTimeFilter from '@/components/shared/AnalyticsTimeFilter'
import EmptyState from '@/components/shared/EmptyState'
import { FinancialHealthScore } from '@/components/analytics'
import { formatCurrency, formatCurrencyCompact } from '@/lib/formatters'
import { chartTooltipProps, PageHeader, ChartContainer } from '@/components/ui'
import { useDashboardMetrics } from '@/hooks/useDashboardMetrics'
import { computeAgeOfMoney, computeDaysOfBuffering } from '@/lib/ageOfMoneyCalculator'
import { usePreferences } from '@/hooks/api/usePreferences'
import { useRecurringTransactions } from '@/hooks/api/useAnalyticsV2'
import { toMonthlyAmount } from '@/pages/subscription-tracker/helpers'

export default function DashboardPage() {
  usePreferences()

  const {
    viewMode, setViewMode,
    currentYear, setCurrentYear,
    currentMonth, setCurrentMonth,
    currentFY, setCurrentFY,
    fiscalYearStartMonth,
    dataDateRange, dateRange,
    filteredTotals, filteredTransactions, isLoading,
    incomeBreakdown, cashbacksTotal,
    incomeChartData, incomeColorStyles,
    expenseChartData, expenseColorStyles,
    momChanges,
  } = useDashboardMetrics()

  // Fixed Commitments from active recurring
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

  const incomeTotal = useMemo(() => incomeChartData.reduce((sum, d) => sum + d.value, 0), [incomeChartData])
  const expenseTotal = useMemo(() => expenseChartData.reduce((sum, d) => sum + d.value, 0), [expenseChartData])

  if (isLoading) return <PageSkeleton />

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6 md:space-y-8">
      <PageHeader
        title="Dashboard"
        subtitle="Your financial overview at a glance"
        action={
          <AnalyticsTimeFilter
            viewMode={viewMode} onViewModeChange={setViewMode}
            currentYear={currentYear} currentMonth={currentMonth} currentFY={currentFY}
            onYearChange={setCurrentYear} onMonthChange={setCurrentMonth} onFYChange={setCurrentFY}
            minDate={dataDateRange.minDate} maxDate={dataDateRange.maxDate}
            fiscalYearStartMonth={fiscalYearStartMonth}
          />
        }
      />

      {/* Quick Insights -- full width */}
      <motion.div className="p-6 glass rounded-2xl border border-border" {...SCROLL_FADE_UP}>
        <h2 className="text-lg font-semibold mb-4">Quick Insights</h2>
        <QuickInsights
          dateRange={dateRange}
          ageOfMoney={ageOfMoney}
          daysOfBuffering={daysOfBuffering}
          fixedCommitmentsMonthly={fixedCommitmentsMonthly}
          fixedCount={fixedCount}
          momChanges={momChanges}
        />
      </motion.div>

      {/* Financial Health Score */}
      <FinancialHealthScore transactions={filteredTransactions} />

      {/* Income Sources & Expense Sources */}
      <motion.div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6" {...SCROLL_FADE_UP}>
        {/* Income Sources */}
        <div className="p-6 glass rounded-2xl border border-border border-l-4 border-l-app-green glow-income">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Wallet className="w-5 h-5 text-app-green" />
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
                      <span className="text-sm font-bold text-app-green">{formatCurrency(Object.values(incomeBreakdown).reduce((a, b) => a + b, 0))}</span>
                    </div>
                    {cashbacksTotal > 0 && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-app-teal">Cashbacks Earned</span>
                        <span className="text-app-teal font-medium">{formatCurrency(cashbacksTotal)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <EmptyState icon={Wallet} title="No income data available" description="Configure income categories in Settings." actionLabel="Go to Settings" actionHref="/settings" variant="compact" />
          )}
        </div>

        {/* Expense Sources */}
        <div className="p-6 glass rounded-2xl border border-border border-l-4 border-l-app-red glow-expense">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-app-red" />
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
                    <span className="text-sm font-bold text-app-red">{formatCurrency(expenseTotal)}</span>
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
    </div>
  )
}
