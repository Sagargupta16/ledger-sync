import { useMemo } from 'react'

import { motion } from 'framer-motion'
import {
  ShoppingBag, TrendingUp, TrendingDown, Zap, Gift, Receipt,
  Flame, ArrowLeftRight, Landmark, Calendar, BarChart3,
  Clock, Layers, DollarSign, Hourglass, ShieldCheck, Lock, Percent,
  Repeat, Scale, CalendarRange,
} from 'lucide-react'

import { useCategoryBreakdown, useTotals } from '@/hooks/api/useAnalytics'
import { useTransactions } from '@/hooks/api/useTransactions'
import { formatCurrency } from '@/lib/formatters'
import { staggerContainer, fadeUpItem } from '@/constants/animations'

import LoadingSkeleton from './LoadingSkeleton'
import {
  type CategoryData,
  getVisibleWidgetKeys,
  filterByVisibility,
  computeDaysInRange,
  computeMonthsInRange,
  computeMedian,
  computeWeekendSplit,
  computePeakDay,
  ageOfMoneyLabel,
  recurringCoverageLabel,
  incomeExpenseRatioLabel,
  computeTopByCategory,
  computeMostExpensiveMonth,
  computeNetCashback,
  fmtChange,
} from './quickInsightsData'

interface QuickInsightsProps {
  readonly dateRange?: { start_date?: string; end_date?: string }
  readonly ageOfMoney?: number | null
  readonly daysOfBuffering?: number | null
  readonly fixedCommitmentsMonthly?: number
  readonly fixedCount?: number
  readonly momChanges?: {
    income?: number
    expense?: number
    savings?: number
    savingsRate?: number
    label: string
  }
}

interface InsightItem {
  icon: React.ComponentType<{ className?: string }>
  color: string
  bg: string
  title: string
  value: string
  subtitle?: string
}

function InsightCard({ item }: { item: InsightItem }) {
  return (
    <motion.div
      variants={fadeUpItem}
      className="flex items-center gap-3 p-3 bg-white/[0.04] border border-border rounded-xl hover:bg-white/[0.05] hover:border-white/[0.10] transition-all duration-150"
    >
      <div className={`p-2 ${item.bg} rounded-lg shrink-0`}>
        <item.icon className={`w-4 h-4 ${item.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-muted-foreground">{item.title}</p>
        <p className="text-sm font-semibold text-white truncate">{item.value}</p>
        {item.subtitle && <p className="text-[11px] text-text-tertiary truncate">{item.subtitle}</p>}
      </div>
    </motion.div>
  )
}

// ─── Main component ─────────────────────────────────────────────────────

export default function QuickInsights({
  dateRange = {},
  ageOfMoney,
  daysOfBuffering,
  fixedCommitmentsMonthly = 0,
  fixedCount = 0,
  momChanges,
}: QuickInsightsProps) {
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
  const monthlyBurnRate = totalSpending / monthsInRange

  // Cashback
  const { netCashback, cashbackCount } = computeNetCashback(allTransactions)

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

  // ─── Build two arrays: Quick Insights (key metrics) + Fun Facts (behavioral) ─

  const biggestTransaction = transactions.length > 0
    ? transactions.reduce((max, t) => (Math.abs(t.amount) > Math.abs(max.amount) ? t : max), transactions[0])
    : { amount: 0, category: 'N/A', date: '' }

  // Recurring coverage: what % of monthly income goes to fixed recurring
  const monthlyIncome = totalIncome / Math.max(monthsInRange, 1)
  const recurringCoverage = monthlyIncome > 0 ? (fixedCommitmentsMonthly / monthlyIncome) * 100 : 0

  // Income vs Expense ratio
  const totalExpenseAbs = Math.abs(totalsData?.total_expenses ?? 0)
  const incomeExpenseRatio = totalIncome > 0 ? totalExpenseAbs / totalIncome : 0

  // Most expensive month
  const mostExpensiveMonth = computeMostExpensiveMonth(transactions)

  const incomeChange = fmtChange(momChanges?.income, momChanges?.label ?? '')
  const expenseChange = fmtChange(momChanges?.expense, momChanges?.label ?? '')
  const savingsChange = fmtChange(momChanges?.savings, momChanges?.label ?? '')

  const quickInsights = [
    { icon: TrendingUp, color: 'text-app-green', bg: 'bg-app-green/10', title: 'Total Income', value: formatCurrency(totalIncome), subtitle: incomeChange },
    { icon: TrendingDown, color: 'text-app-red', bg: 'bg-app-red/10', title: 'Total Expenses', value: formatCurrency(Math.abs(totalsData?.total_expenses ?? 0)), subtitle: expenseChange },
    { icon: DollarSign, color: 'text-app-blue', bg: 'bg-app-blue/10', title: 'Net Savings', value: formatCurrency(netSavings), subtitle: savingsChange },
    { icon: Percent, color: 'text-app-purple', bg: 'bg-app-purple/10', title: 'Savings Rate', value: `${savingsRate.toFixed(1)}%`, subtitle: totalIncome > 0 ? `${formatCurrency(netSavings)} saved of ${formatCurrency(totalIncome)}` : 'No income recorded' },
    ...(ageOfMoney == null ? [] : [{ icon: Hourglass, color: 'text-app-indigo', bg: 'bg-app-indigo/10', title: 'Age of Money', value: `${ageOfMoney} days`, subtitle: ageOfMoneyLabel(ageOfMoney) }]),
    ...(daysOfBuffering == null ? [] : [{ icon: ShieldCheck, color: 'text-app-teal', bg: 'bg-app-teal/10', title: 'Days of Buffering', value: `${daysOfBuffering} days`, subtitle: 'At current spending rate' }]),
    ...(fixedCommitmentsMonthly > 0 ? [{ icon: Lock, color: 'text-app-orange', bg: 'bg-app-orange/10', title: 'Fixed Commitments', value: formatCurrency(fixedCommitmentsMonthly), subtitle: `${fixedCount} active recurring` }] : []),
    ...(fixedCommitmentsMonthly > 0 ? [{ icon: Repeat, color: 'text-app-yellow', bg: 'bg-app-yellow/10', title: 'Recurring Coverage', value: `${recurringCoverage.toFixed(1)}%`, subtitle: recurringCoverageLabel(recurringCoverage) }] : []),
  ]

  const funFacts = [
    { icon: ShoppingBag, color: 'text-app-purple', bg: 'bg-app-purple/10', title: 'Top Spending Category', value: topCategory ? topCategory[0] : 'N/A', subtitle: topCategory ? formatCurrency(Math.abs((topCategory[1] as CategoryData).total)) : '' },
    { icon: Landmark, color: 'text-sky-400', bg: 'bg-sky-500/10', title: 'Top Income Source', value: topIncomeSource ? topIncomeSource[0] : 'N/A', subtitle: topIncomeSource ? formatCurrency(topIncomeSource[1]) : '' },
    { icon: Gift, color: 'text-app-green', bg: 'bg-app-green/10', title: 'Net Cashback Earned', value: formatCurrency(netCashback), subtitle: `From ${cashbackCount} cashback transactions` },
    { icon: TrendingUp, color: 'text-app-red', bg: 'bg-app-red/10', title: 'Biggest Transaction', value: formatCurrency(Math.abs(biggestTransaction?.amount || 0)), subtitle: biggestTransaction?.category || '' },
    { icon: BarChart3, color: 'text-app-purple', bg: 'bg-app-purple/10', title: 'Median Transaction', value: formatCurrency(medianTransaction), subtitle: avgTransactionAmount > medianTransaction ? 'Few large purchases skew average up' : 'Spending is fairly even' },
    { icon: Zap, color: 'text-app-yellow', bg: 'bg-app-yellow/10', title: 'Average Daily Spending', value: formatCurrency(avgDailySpending), subtitle: `Over ${daysInRange} days` },
    { icon: Calendar, color: 'text-app-red', bg: 'bg-app-red/10', title: 'Weekend Spending', value: `${weekendPercent.toFixed(0)}%`, subtitle: `${formatCurrency(weekendSpending)} weekends vs ${formatCurrency(weekdaySpending)} weekdays` },
    { icon: Clock, color: 'text-app-orange', bg: 'bg-app-orange/10', title: 'Peak Spending Day', value: peakDay.name, subtitle: `${formatCurrency(peakDay.total)} total on ${peakDay.name}s` },
    { icon: Flame, color: 'text-app-orange', bg: 'bg-app-orange/10', title: 'Monthly Burn Rate', value: formatCurrency(monthlyBurnRate), subtitle: `Avg over ${monthsInRange.toFixed(1)} months` },
    { icon: Layers, color: 'text-app-teal', bg: 'bg-app-teal/10', title: 'Spending Diversity', value: `${uniqueCategories} categories`, subtitle: `Across ${uniqueSubcategories} subcategories` },
    { icon: Receipt, color: 'text-app-teal', bg: 'bg-app-teal/10', title: 'Avg Transaction', value: formatCurrency(avgTransactionAmount), subtitle: 'Per transaction' },
    { icon: ArrowLeftRight, color: 'text-app-indigo', bg: 'bg-app-indigo/10', title: 'Internal Transfers', value: formatCurrency(totalTransfers), subtitle: `${transferTransactions.length} transfers` },
    { icon: Scale, color: 'text-app-blue', bg: 'bg-app-blue/10', title: 'Income vs Expense', value: `${incomeExpenseRatio.toFixed(2)}x`, subtitle: incomeExpenseRatioLabel(incomeExpenseRatio) },
    ...(mostExpensiveMonth ? [{ icon: CalendarRange, color: 'text-app-red', bg: 'bg-app-red/10', title: 'Most Expensive Month', value: mostExpensiveMonth.label, subtitle: formatCurrency(mostExpensiveMonth.amount) }] : []),
  ]

  // Filter by user widget prefs
  const visibleKeys = useMemo(() => getVisibleWidgetKeys(), [])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 7 }, (_, i) => <LoadingSkeleton key={`s-${i}`} className="h-16 w-full" />)}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }, (_, i) => <LoadingSkeleton key={`f-${i}`} className="h-16 w-full" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Quick Insights */}
      <motion.div
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3"
        variants={staggerContainer} initial="hidden" animate="visible"
      >
        {filterByVisibility(quickInsights, visibleKeys).map((item) => <InsightCard key={item.title} item={item} />)}
      </motion.div>

      {/* Fun Facts */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Fun Facts</h3>
        <motion.div
          className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3"
          variants={staggerContainer} initial="hidden" animate="visible"
        >
          {filterByVisibility(funFacts, visibleKeys).map((item) => <InsightCard key={item.title} item={item} />)}
        </motion.div>
      </div>
    </div>
  )
}
