import { motion } from 'framer-motion'
import { ShoppingBag, TrendingUp, Zap, Activity, Gift, Receipt, Flame, ArrowLeftRight } from 'lucide-react'
import { useCategoryBreakdown } from '@/hooks/useAnalytics'
import { useTransactions } from '@/hooks/api/useTransactions'
import { useTotals } from '@/hooks/useAnalytics'
import LoadingSkeleton from './LoadingSkeleton'
import { formatCurrency } from '@/lib/formatters'

interface QuickInsightsProps {
  dateRange?: { start_date?: string; end_date?: string }
}

export default function QuickInsights({ dateRange = {} }: QuickInsightsProps) {
  const { data: categoryData, isLoading: categoryLoading } = useCategoryBreakdown({
    transaction_type: 'expense',
    ...dateRange,
  })
  const { data: allTransactions = [], isLoading: transactionsLoading } = useTransactions({
    start_date: dateRange.start_date,
    end_date: dateRange.end_date,
  })
  const { isLoading: totalsLoading } = useTotals(dateRange)

  // Filter for expense transactions
  const transactionsData = {
    transactions: allTransactions.filter(
      (t) => t.type === 'Expense' || t.type === 'expense'
    ),
  }

  const isLoading = categoryLoading || transactionsLoading || totalsLoading

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <LoadingSkeleton className="h-16 w-full" />
        <LoadingSkeleton className="h-16 w-full" />
        <LoadingSkeleton className="h-16 w-full" />
        <LoadingSkeleton className="h-16 w-full" />
        <LoadingSkeleton className="h-16 w-full" />
        <LoadingSkeleton className="h-16 w-full" />
        <LoadingSkeleton className="h-16 w-full" />
        <LoadingSkeleton className="h-16 w-full" />
      </div>
    )
  }

  // Find top spending category
  const categories = categoryData?.categories || {}
  interface CategoryData {
    total: number
    count: number
    percentage: number
    subcategories: Record<string, number>
  }
  const topCategory = Object.entries(categories)
    .sort(([, a], [, b]) => {
      const aTotal = (a as CategoryData).total
      const bTotal = (b as CategoryData).total
      return bTotal - aTotal
    })[0]

  // Find biggest transaction
  const transactions = transactionsData?.transactions || []
  const biggestTransaction = transactions.length > 0
    ? transactions.reduce(
        (max, t) => (Math.abs(t.amount) > Math.abs(max.amount) ? t : max),
        transactions[0],
      )
    : { amount: 0, category: 'N/A', date: '' }

  // Calculate days in range
  const getDaysInRange = () => {
    if (!dateRange.start_date || !dateRange.end_date) {
      // For ALL time, calculate from earliest transaction to today
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
  const daysInRange = getDaysInRange()

  // Calculate average daily spending
  const totalSpending = Object.values(categories).reduce(
    (sum, cat) => sum + (cat as CategoryData).total,
    0,
  )
  const avgDailySpending = totalSpending / daysInRange

  // Calculate total transactions count
  const totalTransactions = transactions.length

  // Find most frequent spending category
  const mostFrequentCategory = Object.entries(categories)
    .sort(([, a], [, b]) => {
      const aCount = (a as CategoryData).count
      const bCount = (b as CategoryData).count
      return bCount - aCount
    })[0]

  // Calculate net cashback earned (Refund & Cashbacks - Cashback Shared transfers)
  // Only count Credit Card Cashbacks and Other Cashbacks, exclude refunds
  const cashbackTransactions = allTransactions.filter(
    (t) => 
      t.category === 'Refund & Cashbacks' && 
      (t.type === 'Income' || t.type === 'income') &&
      (t.subcategory === 'Credit Card Cashbacks' || t.subcategory === 'Other Cashbacks')
  )
  const cashbackSharedTransactions = allTransactions.filter(
    (t) => (t.type === 'Transfer' || t.type === 'transfer') && t.to_account === 'Cashback Shared'
  )
  const totalCashback = cashbackTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0)
  const totalCashbackShared = cashbackSharedTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0)
  const netCashback = totalCashback - totalCashbackShared

  // Calculate average transaction amount
  const avgTransactionAmount = transactions.length > 0 
    ? totalSpending / transactions.length 
    : 0

  // Calculate monthly burn rate (average spending per month)
  const getMonthsInRange = () => {
    if (!dateRange.start_date || !dateRange.end_date) {
      // For ALL time, calculate from earliest transaction
      if (transactions.length > 0) {
        const dates = transactions.map(t => new Date(t.date).getTime())
        const earliest = Math.min(...dates)
        const latest = Math.max(...dates)
        const days = Math.ceil((latest - earliest) / (1000 * 60 * 60 * 24))
        return Math.max(days / 30, 1) // Convert days to months
      }
      return 1
    }
    const start = new Date(dateRange.start_date)
    const end = new Date(dateRange.end_date)
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
    return Math.max(days / 30, 1) // Convert days to months
  }
  const monthsInRange = getMonthsInRange()
  const monthlyBurnRate = totalSpending / monthsInRange

  // Calculate total internal transfers
  const transferTransactions = allTransactions.filter(
    (t) => t.type === 'Transfer' || t.type === 'transfer'
  )
  const totalTransfers = transferTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0)

  const insights = [
    {
      icon: ShoppingBag,
      color: 'text-purple-400',
      bg: 'bg-purple-500/20',
      title: 'Top Spending Category',
      value: topCategory ? topCategory[0] : 'N/A',
      subtitle: topCategory
        ? formatCurrency(Math.abs((topCategory[1] as CategoryData).total))
        : '',
    },
    {
      icon: Gift,
      color: 'text-green-400',
      bg: 'bg-green-500/20',
      title: 'Net Cashback Earned',
      value: formatCurrency(netCashback),
      subtitle: `From ${cashbackTransactions.length} cashback transactions`,
    },
    {
      icon: Activity,
      color: 'text-blue-400',
      bg: 'bg-blue-500/20',
      title: 'Total Transactions',
      value: totalTransactions.toLocaleString('en-IN'),
      subtitle: mostFrequentCategory ? `Most frequent: ${mostFrequentCategory[0]}` : '',
    },
    {
      icon: TrendingUp,
      color: 'text-red-400',
      bg: 'bg-red-500/20',
      title: 'Biggest Transaction',
      value: formatCurrency(Math.abs(biggestTransaction?.amount || 0)),
      subtitle: biggestTransaction?.category || '',
    },
    {
      icon: Receipt,
      color: 'text-cyan-400',
      bg: 'bg-cyan-500/20',
      title: 'Avg Transaction Amount',
      value: formatCurrency(avgTransactionAmount),
      subtitle: `Per transaction`,
    },
    {
      icon: Zap,
      color: 'text-amber-400',
      bg: 'bg-amber-500/20',
      title: 'Average Daily Spending',
      value: formatCurrency(avgDailySpending),
      subtitle: `Over ${daysInRange} days`,
    },
    {
      icon: Flame,
      color: 'text-orange-400',
      bg: 'bg-orange-500/20',
      title: 'Monthly Burn Rate',
      value: formatCurrency(monthlyBurnRate),
      subtitle: `Avg per month over ${monthsInRange.toFixed(1)} months`,
    },
    {
      icon: ArrowLeftRight,
      color: 'text-indigo-400',
      bg: 'bg-indigo-500/20',
      title: 'Total Internal Transfers',
      value: formatCurrency(totalTransfers),
      subtitle: `${transferTransactions.length} transfer transactions`,
    },
  ]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {insights.map((insight, index) => (
        <motion.div
          key={insight.title}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.1 }}
          className="flex items-center gap-4 p-4 glass rounded-lg border border-white/10 hover:border-primary/30 transition-all"
        >
          <div className={`p-3 ${insight.bg} rounded-lg`}>
            <insight.icon className={`w-5 h-5 ${insight.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-400">{insight.title}</p>
            <p className="text-lg font-semibold text-white truncate">{insight.value}</p>
            {insight.subtitle && (
              <p className="text-xs text-gray-500 truncate">{insight.subtitle}</p>
            )}
          </div>
        </motion.div>
      ))}
    </div>
  )
}
