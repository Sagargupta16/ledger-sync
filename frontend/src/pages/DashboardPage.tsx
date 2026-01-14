import { motion } from 'framer-motion'
import { DollarSign, TrendingDown, TrendingUp, Percent } from 'lucide-react'
import MetricCard from '@/components/shared/MetricCard'
import RecentTransactions from '@/components/shared/RecentTransactions'
import QuickInsights from '@/components/shared/QuickInsights'
import TimeRangeSelector, { type TimeRange } from '@/components/shared/TimeRangeSelector'
import Sparkline from '@/components/shared/Sparkline'
import { useRecentTransactions } from '@/hooks/api/useAnalytics'
import { useMonthlyAggregation, useTotals } from '@/hooks/useAnalytics'
import { useState, useMemo } from 'react'

export default function DashboardPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>('6M')

  // Calculate date range based on selection
  const getDateRange = (range: TimeRange): { start_date?: string; end_date?: string } => {
    const today = new Date()
    const endDate = today.toISOString().split('T')[0]
    let startDate = ''

    switch (range) {
      case '1M':
        startDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        break
      case '3M':
        startDate = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        break
      case '6M':
        startDate = new Date(today.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        break
      case '1Y':
        startDate = new Date(today.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        break
      case 'ALL':
        return {} // No date filters
      default:
        startDate = new Date(today.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    }

    return { start_date: startDate, end_date: endDate }
  }

  const dateRange = getDateRange(timeRange)

  const { data: recentTransactions, isLoading: isLoadingTransactions } = useRecentTransactions(5)
  const { data: filteredTotals, isLoading } = useTotals(dateRange)
  const { data: monthlyData } = useMonthlyAggregation(dateRange)

  // Prepare sparkline data for mini charts - show all months in the filtered range
  const incomeSparkline = useMemo(() => {
    if (!monthlyData) return []
    return Object.values(monthlyData).map((m: { income?: number }) => m.income || 0)
  }, [monthlyData])

  const expenseSparkline = useMemo(() => {
    if (!monthlyData) return []
    return Object.values(monthlyData).map((m: { expense?: number }) => Math.abs(m.expense || 0))
  }, [monthlyData])

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold">Dashboard</h1>
            <p className="text-muted-foreground mt-2">Your financial overview at a glance</p>
          </div>
          <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
        </div>
      </motion.div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Total Income"
          value={filteredTotals ? formatCurrency(filteredTotals.total_income) : '₹0'}
          icon={TrendingUp}
          color="green"
          isLoading={isLoading}
          trend={incomeSparkline.length > 0 ? <Sparkline data={incomeSparkline} color="#10b981" height={30} /> : undefined}
        />
        <MetricCard
          title="Total Expenses"
          value={filteredTotals ? formatCurrency(Math.abs(filteredTotals.total_expenses)) : '₹0'}
          icon={TrendingDown}
          color="red"
          isLoading={isLoading}
          trend={expenseSparkline.length > 0 ? <Sparkline data={expenseSparkline} color="#ef4444" height={30} /> : undefined}
        />
        <MetricCard
          title="Net Savings"
          value={filteredTotals ? formatCurrency(filteredTotals.net_savings) : '₹0'}
          icon={DollarSign}
          color="blue"
          isLoading={isLoading}
        />
        <MetricCard
          title="Savings Rate"
          value={filteredTotals ? `${filteredTotals.savings_rate.toFixed(1)}%` : '0%'}
          icon={Percent}
          color="purple"
          isLoading={isLoading}
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
    </div>
  )
}
