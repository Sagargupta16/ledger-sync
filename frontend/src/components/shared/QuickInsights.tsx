import { motion } from 'framer-motion'
import { ShoppingBag, TrendingUp, Zap } from 'lucide-react'
import { useCategoryBreakdown } from '@/hooks/useAnalytics'
import { useTransactions } from '@/hooks/api/useTransactions'
import LoadingSkeleton from './LoadingSkeleton'

export default function QuickInsights() {
  const { data: categoryData, isLoading: categoryLoading } = useCategoryBreakdown({
    transaction_type: 'expense',
  })
  const { data: allTransactions = [], isLoading: transactionsLoading } = useTransactions()

  // Filter for expense transactions
  const transactionsData = {
    transactions: allTransactions.filter(
      (t) => t.type === 'Expense' || t.type === 'expense'
    ),
  }

  const isLoading = categoryLoading || transactionsLoading

  if (isLoading) {
    return (
      <div className="space-y-3">
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

  // Calculate average daily spending
  const totalSpending = Object.values(categories).reduce(
    (sum, cat) => sum + (cat as CategoryData).total,
    0,
  )
  const avgDailySpending = totalSpending / 30 // Approximate for last month

  const insights = [
    {
      icon: ShoppingBag,
      color: 'text-purple-400',
      bg: 'bg-purple-500/20',
      title: 'Top Spending Category',
      value: topCategory ? topCategory[0] : 'N/A',
      subtitle: topCategory
        ? `₹${Math.abs((topCategory[1] as CategoryData).total).toLocaleString('en-IN')}`
        : '',
    },
    {
      icon: TrendingUp,
      color: 'text-red-400',
      bg: 'bg-red-500/20',
      title: 'Biggest Transaction',
      value: `₹${Math.abs(biggestTransaction?.amount || 0).toLocaleString('en-IN')}`,
      subtitle: biggestTransaction?.category || '',
    },
    {
      icon: Zap,
      color: 'text-blue-400',
      bg: 'bg-blue-500/20',
      title: 'Average Daily Spending',
      value: `₹${avgDailySpending.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
      subtitle: 'Last 30 days',
    },
  ]

  return (
    <div className="space-y-3">
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
