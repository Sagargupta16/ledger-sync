import { useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  ShoppingBag, TrendingUp, TrendingDown, Zap, Gift, Receipt,
  Flame, ArrowLeftRight, Landmark, Calendar, BarChart3,
  Clock, Layers, DollarSign, Hourglass, ShieldCheck, Lock, Percent,
  Repeat, Scale, CalendarRange,
} from 'lucide-react'
import { useCategoryBreakdown, useTotals } from '@/hooks/useAnalytics'
import { useTransactions } from '@/hooks/api/useTransactions'
import LoadingSkeleton from './LoadingSkeleton'
import { formatCurrency } from '@/lib/formatters'
import { staggerContainer, fadeUpItem } from '@/constants/animations'

/** Maps insight titles to widget keys used in Settings → Dashboard Widgets */
const TITLE_TO_WIDGET_KEY: Record<string, string> = {
  'Savings Rate': 'savings_rate',
  'Top Spending Category': 'top_spending',
  'Top Income Source': 'top_income',
  'Net Cashback Earned': 'cashback',
  'Total Transactions': 'total_transactions',
  'Biggest Transaction': 'biggest_transaction',
  'Median Transaction': 'median_transaction',
  'Average Daily Spending': 'daily_spending',
  'Weekend Spending': 'weekend_spending',
  'Peak Spending Day': 'peak_day',
  'Monthly Burn Rate': 'burn_rate',
  'Spending Diversity': 'spending_diversity',
  'Avg Transaction Amount': 'avg_transaction',
  'Total Internal Transfers': 'total_transfers',
  // New insights - always visible (not in legacy widget settings)
  'Total Income': 'total_income',
  'Total Expenses': 'total_expenses',
  'Net Savings': 'net_savings',
  'Age of Money': 'age_of_money',
  'Days of Buffering': 'days_of_buffering',
  'Fixed Commitments': 'fixed_commitments',
  'Recurring Coverage': 'recurring_coverage',
  'Income vs Expense': 'income_expense_ratio',
  'Most Expensive Month': 'most_expensive_month',
  'Total Tax Paid': 'total_tax_paid',
  'Effective Tax Rate': 'effective_tax_rate',
  'Highest Tax Year': 'highest_tax_year',
}

function getVisibleWidgetKeys(): Set<string> | null {
  try {
    const raw = localStorage.getItem('ledger-sync-visible-widgets')
    if (raw) {
      const arr = JSON.parse(raw) as string[]
      // If most widgets are visible, treat as "no filter"
      if (arr.length >= 14) return null
      return new Set(arr)
    }
  } catch (e) { console.warn('[getVisibleWidgetKeys] Failed to read localStorage:', e) }
  return null // null = show all
}

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
  return Object.entries(byCat).sort(([, a], [, b]) => b - a)[0] ?? null
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
  const mostExpensiveMonth = (() => {
    const byMonth: Record<string, number> = {}
    for (const t of transactions) {
      const key = t.date.slice(0, 7) // YYYY-MM
      byMonth[key] = (byMonth[key] || 0) + Math.abs(t.amount)
    }
    const entries = Object.entries(byMonth)
    if (entries.length === 0) return null
    const [monthKey, amount] = entries.reduce((max, cur) => cur[1] > max[1] ? cur : max, entries[0])
    const [y, m] = monthKey.split('-')
    const label = new Date(Number(y), Number(m) - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    return { label, amount }
  })()

  const fmtChange = (v: number | undefined, label: string) => {
    if (v == null) return ''
    const sign = v > 0 ? '+' : ''
    return `${sign}${v}% ${label}`
  }
  const incomeChange = fmtChange(momChanges?.income, momChanges?.label ?? '')
  const expenseChange = fmtChange(momChanges?.expense, momChanges?.label ?? '')
  const savingsChange = fmtChange(momChanges?.savings, momChanges?.label ?? '')

  const quickInsights = [
    { icon: TrendingUp, color: 'text-app-green', bg: 'bg-app-green/10', title: 'Total Income', value: formatCurrency(totalIncome), subtitle: incomeChange },
    { icon: TrendingDown, color: 'text-app-red', bg: 'bg-app-red/10', title: 'Total Expenses', value: formatCurrency(Math.abs(totalsData?.total_expenses ?? 0)), subtitle: expenseChange },
    { icon: DollarSign, color: 'text-app-blue', bg: 'bg-app-blue/10', title: 'Net Savings', value: formatCurrency(netSavings), subtitle: savingsChange },
    { icon: Percent, color: 'text-app-purple', bg: 'bg-app-purple/10', title: 'Savings Rate', value: `${savingsRate.toFixed(1)}%`, subtitle: totalIncome > 0 ? `${formatCurrency(netSavings)} saved of ${formatCurrency(totalIncome)}` : 'No income recorded' },
    ...(ageOfMoney != null ? [{ icon: Hourglass, color: 'text-app-indigo', bg: 'bg-app-indigo/10', title: 'Age of Money', value: `${ageOfMoney} days`, subtitle: ageOfMoney >= 30 ? 'Healthy buffer' : ageOfMoney >= 15 ? 'Building runway' : 'Living paycheck to paycheck' }] : []),
    ...(daysOfBuffering != null ? [{ icon: ShieldCheck, color: 'text-app-teal', bg: 'bg-app-teal/10', title: 'Days of Buffering', value: `${daysOfBuffering} days`, subtitle: 'At current spending rate' }] : []),
    ...(fixedCommitmentsMonthly > 0 ? [{ icon: Lock, color: 'text-app-orange', bg: 'bg-app-orange/10', title: 'Fixed Commitments', value: formatCurrency(fixedCommitmentsMonthly), subtitle: `${fixedCount} active recurring` }] : []),
    ...(fixedCommitmentsMonthly > 0 ? [{ icon: Repeat, color: 'text-app-yellow', bg: 'bg-app-yellow/10', title: 'Recurring Coverage', value: `${recurringCoverage.toFixed(1)}%`, subtitle: recurringCoverage > 50 ? 'High fixed cost load' : recurringCoverage > 30 ? 'Moderate fixed costs' : 'Low fixed costs' }] : []),
  ]

  const funFacts = [
    { icon: ShoppingBag, color: 'text-app-purple', bg: 'bg-app-purple/10', title: 'Top Spending Category', value: topCategory ? topCategory[0] : 'N/A', subtitle: topCategory ? formatCurrency(Math.abs((topCategory[1] as CategoryData).total)) : '' },
    { icon: Landmark, color: 'text-sky-400', bg: 'bg-sky-500/10', title: 'Top Income Source', value: topIncomeSource ? topIncomeSource[0] : 'N/A', subtitle: topIncomeSource ? formatCurrency(topIncomeSource[1]) : '' },
    { icon: Gift, color: 'text-app-green', bg: 'bg-app-green/10', title: 'Net Cashback Earned', value: formatCurrency(netCashback), subtitle: `From ${cashbackTransactions.length} cashback transactions` },
    { icon: TrendingUp, color: 'text-app-red', bg: 'bg-app-red/10', title: 'Biggest Transaction', value: formatCurrency(Math.abs(biggestTransaction?.amount || 0)), subtitle: biggestTransaction?.category || '' },
    { icon: BarChart3, color: 'text-app-purple', bg: 'bg-app-purple/10', title: 'Median Transaction', value: formatCurrency(medianTransaction), subtitle: avgTransactionAmount > medianTransaction ? 'Few large purchases skew average up' : 'Spending is fairly even' },
    { icon: Zap, color: 'text-app-yellow', bg: 'bg-app-yellow/10', title: 'Average Daily Spending', value: formatCurrency(avgDailySpending), subtitle: `Over ${daysInRange} days` },
    { icon: Calendar, color: 'text-app-red', bg: 'bg-app-red/10', title: 'Weekend Spending', value: `${weekendPercent.toFixed(0)}%`, subtitle: `${formatCurrency(weekendSpending)} weekends vs ${formatCurrency(weekdaySpending)} weekdays` },
    { icon: Clock, color: 'text-app-orange', bg: 'bg-app-orange/10', title: 'Peak Spending Day', value: peakDay.name, subtitle: `${formatCurrency(peakDay.total)} total on ${peakDay.name}s` },
    { icon: Flame, color: 'text-app-orange', bg: 'bg-app-orange/10', title: 'Monthly Burn Rate', value: formatCurrency(monthlyBurnRate), subtitle: `Avg over ${monthsInRange.toFixed(1)} months` },
    { icon: Layers, color: 'text-app-teal', bg: 'bg-app-teal/10', title: 'Spending Diversity', value: `${uniqueCategories} categories`, subtitle: `Across ${uniqueSubcategories} subcategories` },
    { icon: Receipt, color: 'text-app-teal', bg: 'bg-app-teal/10', title: 'Avg Transaction', value: formatCurrency(avgTransactionAmount), subtitle: 'Per transaction' },
    { icon: ArrowLeftRight, color: 'text-app-indigo', bg: 'bg-app-indigo/10', title: 'Internal Transfers', value: formatCurrency(totalTransfers), subtitle: `${transferTransactions.length} transfers` },
    { icon: Scale, color: 'text-app-blue', bg: 'bg-app-blue/10', title: 'Income vs Expense', value: `${incomeExpenseRatio.toFixed(2)}x`, subtitle: incomeExpenseRatio < 0.7 ? 'Great! Spending well below income' : incomeExpenseRatio < 0.9 ? 'Spending close to income' : 'Spending nearly all income' },
    ...(mostExpensiveMonth ? [{ icon: CalendarRange, color: 'text-app-red', bg: 'bg-app-red/10', title: 'Most Expensive Month', value: mostExpensiveMonth.label, subtitle: formatCurrency(mostExpensiveMonth.amount) }] : []),
  ]

  // Filter by user widget prefs
  const visibleKeys = useMemo(() => getVisibleWidgetKeys(), [])
  // Legacy widget keys that users may have toggled in Settings
  const LEGACY_KEYS = new Set([
    'savings_rate', 'top_spending', 'top_income', 'cashback',
    'total_transactions', 'biggest_transaction', 'median_transaction',
    'daily_spending', 'weekend_spending', 'peak_day', 'burn_rate',
    'spending_diversity', 'avg_transaction', 'total_transfers',
  ])
  const filterByVis = <T extends { title: string }>(items: T[]) => {
    if (!visibleKeys) return items
    return items.filter((i) => {
      const key = TITLE_TO_WIDGET_KEY[i.title]
      if (!key || !LEGACY_KEYS.has(key)) return true // new items always show
      return visibleKeys.has(key)
    })
  }

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

  const InsightCard = ({ item }: { item: typeof quickInsights[number] }) => (
    <motion.div
      variants={fadeUpItem}
      className="flex items-center gap-3 p-3 bg-white/[0.04] border border-white/[0.06] rounded-xl hover:bg-white/[0.05] hover:border-white/[0.10] transition-all duration-150"
    >
      <div className={`p-2 ${item.bg} rounded-lg shrink-0`}>
        <item.icon className={`w-4 h-4 ${item.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-zinc-400">{item.title}</p>
        <p className="text-sm font-semibold text-white truncate">{item.value}</p>
        {item.subtitle && <p className="text-[11px] text-zinc-500 truncate">{item.subtitle}</p>}
      </div>
    </motion.div>
  )

  return (
    <div className="space-y-6">
      {/* Quick Insights */}
      <motion.div
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3"
        variants={staggerContainer} initial="hidden" animate="visible"
      >
        {filterByVis(quickInsights).map((item) => <InsightCard key={item.title} item={item} />)}
      </motion.div>

      {/* Fun Facts */}
      <div>
        <h3 className="text-sm font-medium text-zinc-400 mb-3">Fun Facts</h3>
        <motion.div
          className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3"
          variants={staggerContainer} initial="hidden" animate="visible"
        >
          {filterByVis(funFacts).map((item) => <InsightCard key={item.title} item={item} />)}
        </motion.div>
      </div>
    </div>
  )
}
