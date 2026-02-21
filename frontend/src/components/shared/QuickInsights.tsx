import { useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  ShoppingBag, TrendingUp, Zap, Activity, Gift, Receipt,
  Flame, ArrowLeftRight, PiggyBank, Landmark, Calendar, BarChart3,
  Clock, Layers,
} from 'lucide-react'
import { useCategoryBreakdown, useTotals } from '@/hooks/useAnalytics'
import { useTransactions } from '@/hooks/api/useTransactions'
import LoadingSkeleton from './LoadingSkeleton'
import { formatCurrency } from '@/lib/formatters'
import { staggerContainer, fadeUpItem } from '@/constants/animations'

interface QuickInsightsProps {
  readonly dateRange?: { start_date?: string; end_date?: string }
}

interface CategoryData {
  total: number
  count: number
  percentage: number
  subcategories: Record<string, number>
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// ─── Computation helpers (extracted to reduce component complexity) ────

interface DateRange {
  start_date?: string
  end_date?: string
}

interface Transaction {
  date: string
  amount: number
  type: string
  category?: string
  subcategory?: string
  to_account?: string
}

function computeDaysInRange(dateRange: DateRange, transactions: Transaction[]): number {
  if (!dateRange.start_date || !dateRange.end_date) {
    if (transactions.length > 0) {
      const dates = transactions.map(t => new Date(t.date).getTime())
      const earliest = Math.min(...dates)
      const latest = Math.max(...dates)
      return Math.ceil((latest - earliest) / (1000 * 60 * 60 * 24)) || 1
    }
    return 30
  }
  const start = new Date(dateRange.start_date)
  const end = new Date(dateRange.end_date)
  return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) || 1
}

function computeMonthsInRange(dateRange: DateRange, transactions: Transaction[]): number {
  if (!dateRange.start_date || !dateRange.end_date) {
    if (transactions.length > 0) {
      const dates = transactions.map(t => new Date(t.date).getTime())
      const earliest = Math.min(...dates)
      const latest = Math.max(...dates)
      const days = Math.ceil((latest - earliest) / (1000 * 60 * 60 * 24))
      return Math.max(days / 30.44, 1)
    }
    return 1
  }
  const start = new Date(dateRange.start_date)
  const end = new Date(dateRange.end_date)
  const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  return Math.max(days / 30.44, 1)
}

function computeMedian(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  }
  return sorted[mid]
}

function computeWeekendSplit(transactions: Transaction[]) {
  let weekend = 0
  let weekday = 0
  for (const t of transactions) {
    const day = new Date(t.date).getDay()
    const amount = Math.abs(t.amount)
    if (day === 0 || day === 6) weekend += amount
    else weekday += amount
  }
  return { weekend, weekday }
}

function computePeakDay(transactions: Transaction[]) {
  const spendingByDay = [0, 0, 0, 0, 0, 0, 0]
  for (const t of transactions) {
    spendingByDay[new Date(t.date).getDay()] += Math.abs(t.amount)
  }
  const peakIndex = spendingByDay.indexOf(Math.max(...spendingByDay))
  return { name: DAY_NAMES[peakIndex], total: spendingByDay[peakIndex] }
}

function computeTopByCategory(transactions: Transaction[]) {
  const byCat: Record<string, number> = {}
  for (const t of transactions) {
    const cat = t.category || 'Other'
    byCat[cat] = (byCat[cat] || 0) + Math.abs(t.amount)
  }
  return Object.entries(byCat).sort(([, a], [, b]) => b - a)[0]
}

// ─── Main component ─────────────────────────────────────────────────────

export default function QuickInsights({ dateRange = {} }: QuickInsightsProps) {
  const { data: categoryData, isLoading: categoryLoading } = useCategoryBreakdown({
    transaction_type: 'expense',
    ...dateRange,
  })
  const { data: allTransactions = [], isLoading: transactionsLoading } = useTransactions({
    start_date: dateRange.start_date,
    end_date: dateRange.end_date,
  })
  const { data: totalsData, isLoading: totalsLoading } = useTotals(dateRange)

  const transactions = allTransactions.filter((t) => t.type === 'Expense')
  const isLoading = categoryLoading || transactionsLoading || totalsLoading

  const categories = categoryData?.categories || {}

  const topCategory = Object.entries(categories)
    .sort(([, a], [, b]) => (b as CategoryData).total - (a as CategoryData).total)[0]

  const daysInRange = computeDaysInRange(dateRange, transactions)
  const monthsInRange = computeMonthsInRange(dateRange, transactions)

  const totalSpending = Object.values(categories).reduce(
    (sum, cat) => sum + (cat as CategoryData).total, 0,
  )
  const avgDailySpending = totalSpending / daysInRange
  const totalTransactions = transactions.length
  const monthlyBurnRate = totalSpending / monthsInRange

  const mostFrequentCategory = Object.entries(categories)
    .sort(([, a], [, b]) => (b as CategoryData).count - (a as CategoryData).count)[0]

  // Cashback
  const cashbackTransactions = allTransactions.filter(
    (t) =>
      t.category === 'Refund & Cashbacks' &&
      t.type === 'Income' &&
      (t.subcategory === 'Credit Card Cashbacks' || t.subcategory === 'Other Cashbacks')
  )
  const cashbackSharedTransactions = allTransactions.filter(
    (t) => t.type === 'Transfer' && t.to_account === 'Cashback Shared'
  )
  const totalCashback = cashbackTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0)
  const totalCashbackShared = cashbackSharedTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0)
  const netCashback = totalCashback - totalCashbackShared

  const avgTransactionAmount = transactions.length > 0 ? totalSpending / transactions.length : 0

  const transferTransactions = allTransactions.filter((t) => t.type === 'Transfer')
  const totalTransfers = transferTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0)

  // New insights data
  const savingsRate = totalsData?.savings_rate ?? 0
  const totalIncome = totalsData?.total_income ?? 0
  const netSavings = totalsData?.net_savings ?? 0

  const topIncomeSource = computeTopByCategory(allTransactions.filter((t) => t.type === 'Income'))
  const { weekend: weekendSpending, weekday: weekdaySpending } = computeWeekendSplit(transactions)
  const weekendPercent = totalSpending > 0 ? (weekendSpending / totalSpending) * 100 : 0
  const peakDay = computePeakDay(transactions)

  const uniqueCategories = Object.keys(categories).length
  const uniqueSubcategories = Object.values(categories).reduce(
    (sum, cat) => sum + Object.keys((cat as CategoryData).subcategories || {}).length, 0,
  )

  const medianTransaction = computeMedian(transactions.map((t) => Math.abs(t.amount)))

  // ─── Build insights array ─────────────────────────────────────────────

  const insights = useMemo(() => {
  const biggestTransaction = transactions.length > 0
    ? transactions.reduce(
        (max, t) => (Math.abs(t.amount) > Math.abs(max.amount) ? t : max),
        transactions[0],
      )
    : { amount: 0, category: 'N/A', date: '' }

  return [
    {
      icon: PiggyBank,
      color: 'text-ios-green',
      bg: 'bg-ios-green/20',
      title: 'Savings Rate',
      value: `${savingsRate.toFixed(1)}%`,
      subtitle: totalIncome > 0
        ? `${formatCurrency(netSavings)} saved of ${formatCurrency(totalIncome)}`
        : 'No income recorded',
    },
    {
      icon: ShoppingBag,
      color: 'text-ios-purple',
      bg: 'bg-ios-purple/20',
      title: 'Top Spending Category',
      value: topCategory ? topCategory[0] : 'N/A',
      subtitle: topCategory
        ? formatCurrency(Math.abs((topCategory[1] as CategoryData).total))
        : '',
    },
    {
      icon: Landmark,
      color: 'text-sky-400',
      bg: 'bg-sky-500/20',
      title: 'Top Income Source',
      value: topIncomeSource ? topIncomeSource[0] : 'N/A',
      subtitle: topIncomeSource ? formatCurrency(topIncomeSource[1]) : '',
    },
    {
      icon: Gift,
      color: 'text-ios-green',
      bg: 'bg-ios-green/20',
      title: 'Net Cashback Earned',
      value: formatCurrency(netCashback),
      subtitle: `From ${cashbackTransactions.length} cashback transactions`,
    },
    {
      icon: Activity,
      color: 'text-ios-blue',
      bg: 'bg-ios-blue/20',
      title: 'Total Transactions',
      value: totalTransactions.toLocaleString('en-IN'),
      subtitle: mostFrequentCategory ? `Most frequent: ${mostFrequentCategory[0]}` : '',
    },
    {
      icon: TrendingUp,
      color: 'text-ios-red',
      bg: 'bg-ios-red/20',
      title: 'Biggest Transaction',
      value: formatCurrency(Math.abs(biggestTransaction?.amount || 0)),
      subtitle: biggestTransaction?.category || '',
    },
    {
      icon: BarChart3,
      color: 'text-ios-purple',
      bg: 'bg-ios-purple/20',
      title: 'Median Transaction',
      value: formatCurrency(medianTransaction),
      subtitle: avgTransactionAmount > medianTransaction
        ? 'Below average — few large purchases skew up'
        : 'Close to average — spending is even',
    },
    {
      icon: Zap,
      color: 'text-ios-yellow',
      bg: 'bg-ios-yellow/20',
      title: 'Average Daily Spending',
      value: formatCurrency(avgDailySpending),
      subtitle: `Over ${daysInRange} days`,
    },
    {
      icon: Calendar,
      color: 'text-ios-red',
      bg: 'bg-ios-red/20',
      title: 'Weekend Spending',
      value: `${weekendPercent.toFixed(0)}%`,
      subtitle: `${formatCurrency(weekendSpending)} on weekends vs ${formatCurrency(weekdaySpending)} weekdays`,
    },
    {
      icon: Clock,
      color: 'text-ios-orange',
      bg: 'bg-ios-orange/20',
      title: 'Peak Spending Day',
      value: peakDay.name,
      subtitle: `${formatCurrency(peakDay.total)} total on ${peakDay.name}s`,
    },
    {
      icon: Flame,
      color: 'text-ios-orange',
      bg: 'bg-ios-orange/20',
      title: 'Monthly Burn Rate',
      value: formatCurrency(monthlyBurnRate),
      subtitle: `Avg per month over ${monthsInRange.toFixed(1)} months`,
    },
    {
      icon: Layers,
      color: 'text-ios-teal',
      bg: 'bg-ios-teal/20',
      title: 'Spending Diversity',
      value: `${uniqueCategories} categories`,
      subtitle: `Across ${uniqueSubcategories} subcategories`,
    },
    {
      icon: Receipt,
      color: 'text-ios-teal',
      bg: 'bg-ios-teal/20',
      title: 'Avg Transaction Amount',
      value: formatCurrency(avgTransactionAmount),
      subtitle: `Per transaction`,
    },
    {
      icon: ArrowLeftRight,
      color: 'text-ios-indigo',
      bg: 'bg-ios-indigo/20',
      title: 'Total Internal Transfers',
      value: formatCurrency(totalTransfers),
      subtitle: `${transferTransactions.length} transfer transactions`,
    },
  ]}, [
    savingsRate, netSavings, totalIncome,
    topCategory, topIncomeSource,
    netCashback, cashbackTransactions.length,
    totalTransactions, mostFrequentCategory,
    transactions,
    medianTransaction, avgTransactionAmount,
    avgDailySpending, daysInRange,
    weekendPercent, weekendSpending, weekdaySpending,
    peakDay,
    monthlyBurnRate, monthsInRange,
    uniqueCategories, uniqueSubcategories,
    totalTransfers, transferTransactions.length,
  ])

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {Array.from({ length: 14 }, (_, i) => (
          <LoadingSkeleton key={`skeleton-${i}`} className="h-16 w-full" />
        ))}
      </div>
    )
  }

  return (
    <motion.div
      className="grid grid-cols-1 lg:grid-cols-2 gap-3"
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
    >
      {insights.map((insight) => (
        <motion.div
          key={insight.title}
          variants={fadeUpItem}
          className="flex items-center gap-4 p-4 glass rounded-lg border border-border hover:border-primary/30 transition-colors"
        >
          <div className={`p-3 ${insight.bg} rounded-lg`}>
            <insight.icon className={`w-5 h-5 ${insight.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">{insight.title}</p>
            <p className="text-lg font-semibold text-white truncate">{insight.value}</p>
            {insight.subtitle && (
              <p className="text-xs text-text-tertiary truncate">{insight.subtitle}</p>
            )}
          </div>
        </motion.div>
      ))}
    </motion.div>
  )
}
