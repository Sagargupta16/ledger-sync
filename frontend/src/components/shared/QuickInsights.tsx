import { useMemo } from 'react'

import {
  ShoppingBag, TrendingUp, TrendingDown, Zap, Gift, Receipt,
  Flame, ArrowLeftRight, Landmark, Calendar, BarChart3,
  Clock, Layers, DollarSign, Hourglass, ShieldCheck, Lock, Percent,
  Repeat, Scale, CalendarRange,
} from 'lucide-react'

import { useCategoryBreakdown, useTotals, useQuickInsights } from '@/hooks/api/useAnalytics'
import { formatCurrency } from '@/lib/formatters'

import LoadingSkeleton from './LoadingSkeleton'
import {
  type CategoryData,
  type InsightDescriptor,
  getVisibleWidgetKeys,
  filterByVisibility,
  computeDaysInRange,
  computeMonthsInRange,
  fmtChange,
  buildQuickInsights,
  buildFunFacts,
  DAY_NAMES,
  monthLabel,
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

function InsightCard({ item }: Readonly<{ item: InsightDescriptor }>) {
  return (
    <div className="ledger-cell flex min-h-20 items-center gap-3 p-3 transition-colors duration-150 hover:bg-[var(--overlay-1)]">
      <div className={`flex size-7 shrink-0 items-center justify-center rounded-md ${item.bg}`}>
        <item.icon className={`size-3.5 ${item.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="truncate text-[11px] text-muted-foreground">{item.title}</p>
        <p className="ledger-figure truncate text-xs font-semibold text-foreground sm:text-sm" title={item.value}>{item.value}</p>
        {item.subtitle && <p className="text-[11px] text-text-tertiary truncate" title={item.subtitle}>{item.subtitle}</p>}
      </div>
    </div>
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
  const { data: insights, isLoading: insightsLoading } = useQuickInsights(dateRange)
  const { data: totalsData, isLoading: totalsLoading } = useTotals(dateRange)

  const isLoading = categoryLoading || insightsLoading || totalsLoading

  const categories = categoryData?.categories || {}

  const topCategory = Object.entries(categories)
    .sort(([, a], [, b]) => (b as CategoryData).total - (a as CategoryData).total)[0]

  // Days/months in range: prefer the explicit filter, else the data's actual
  // span (returned by the endpoint as min/max date) -- no raw rows needed.
  const spanRange = {
    start_date: dateRange.start_date ?? insights?.min_date ?? undefined,
    end_date: dateRange.end_date ?? insights?.max_date ?? undefined,
  }
  const daysInRange = computeDaysInRange(spanRange, [])
  const monthsInRange = computeMonthsInRange(spanRange, [])

  const totalSpending = insights?.total_spending ?? 0
  const avgDailySpending = totalSpending / daysInRange
  const monthlyBurnRate = totalSpending / monthsInRange

  const netCashback = insights?.net_cashback ?? 0
  const cashbackCount = insights?.cashback_count ?? 0

  const avgTransactionAmount = insights?.avg_expense ?? 0
  const totalTransfers = insights?.total_transfers ?? 0

  // New insights data
  const savingsRate = totalsData?.savings_rate ?? 0
  const totalIncome = totalsData?.total_income ?? 0
  const netSavings = totalsData?.net_savings ?? 0

  const topIncomeSource: [string, number] | null = insights?.top_income_source
    ? [insights.top_income_source.category, insights.top_income_source.amount]
    : null
  const weekendSpending = insights?.weekend_spending ?? 0
  const weekdaySpending = insights?.weekday_spending ?? 0
  const weekendPercent = totalSpending > 0 ? (weekendSpending / totalSpending) * 100 : 0
  const peakDay = {
    name: DAY_NAMES[insights?.peak_day ?? 0],
    total: insights?.peak_day_total ?? 0,
  }

  const uniqueCategories = Object.keys(categories).length
  const uniqueSubcategories = Object.values(categories).reduce(
    (sum, cat) => sum + Object.keys((cat as CategoryData).subcategories || {}).length, 0,
  )

  const medianTransaction = insights?.median_expense ?? 0

  // ─── Build two arrays: Quick Insights (key metrics) + Fun Facts (behavioral) ─

  const biggestTransaction = {
    amount: insights?.biggest_expense?.amount ?? 0,
    category: insights?.biggest_expense?.category || 'N/A',
  }

  // Recurring coverage: what % of monthly income goes to fixed recurring
  const monthlyIncome = totalIncome / Math.max(monthsInRange, 1)
  const recurringCoverage = monthlyIncome > 0 ? (fixedCommitmentsMonthly / monthlyIncome) * 100 : 0

  // Income vs Expense ratio
  const totalExpenseAbs = Math.abs(totalsData?.total_expenses ?? 0)
  const incomeExpenseRatio = totalIncome > 0 ? totalExpenseAbs / totalIncome : 0

  // Most expensive month
  const mostExpensiveMonth = insights?.most_expensive_month
    ? {
        label: monthLabel(insights.most_expensive_month.period),
        amount: insights.most_expensive_month.amount,
      }
    : null

  const incomeChange = fmtChange(momChanges?.income, momChanges?.label ?? '')
  const expenseChange = fmtChange(momChanges?.expense, momChanges?.label ?? '')
  const savingsChange = fmtChange(momChanges?.savings, momChanges?.label ?? '')

  const quickInsights = buildQuickInsights(
    {
      totalIncome,
      totalExpenses: totalsData?.total_expenses ?? 0,
      netSavings,
      savingsRate,
      incomeChange,
      expenseChange,
      savingsChange,
      ageOfMoney,
      daysOfBuffering,
      fixedCommitmentsMonthly,
      fixedCount,
      recurringCoverage,
    },
    { TrendingUp, TrendingDown, DollarSign, Percent, Hourglass, ShieldCheck, Lock, Repeat },
    formatCurrency,
  )

  const funFacts = buildFunFacts(
    {
      topCategory,
      topIncomeSource,
      netCashback,
      cashbackCount,
      biggestTransaction,
      medianTransaction,
      avgTransactionAmount,
      avgDailySpending,
      daysInRange,
      weekendPercent,
      weekendSpending,
      weekdaySpending,
      peakDay,
      monthlyBurnRate,
      monthsInRange,
      uniqueCategories,
      uniqueSubcategories,
      totalTransfers,
      transferCount: insights?.transfer_count ?? 0,
      incomeExpenseRatio,
      mostExpensiveMonth,
    },
    {
      ShoppingBag, Landmark, Gift, TrendingUp, BarChart3, Zap, Calendar, Clock,
      Flame, Layers, Receipt, ArrowLeftRight, Scale, CalendarRange,
    },
    formatCurrency,
  )

  // Filter by user widget prefs
  const visibleKeys = useMemo(() => getVisibleWidgetKeys(), [])

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="ledger-band grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 7 }, (_, i) => <LoadingSkeleton key={`s-${i}`} className="h-16 w-full" />)}
        </div>
        <div className="ledger-band grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => <LoadingSkeleton key={`f-${i}`} className="h-16 w-full" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Quick Insights */}
      <div className="ledger-band grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {filterByVisibility(quickInsights, visibleKeys).map((item) => <InsightCard key={item.title} item={item} />)}
      </div>

      {/* Fun Facts */}
      <div>
        <h3 className="mb-2 text-xs font-medium text-muted-foreground">Behavior signals</h3>
        <div className="ledger-band grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {filterByVisibility(funFacts, visibleKeys).map((item) => <InsightCard key={item.title} item={item} />)}
        </div>
      </div>
    </div>
  )
}
