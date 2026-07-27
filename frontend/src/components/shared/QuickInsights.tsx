import { useMemo } from 'react'

import {
  ShoppingBag, TrendingUp, TrendingDown, Zap, Gift, Receipt,
  Flame, ArrowLeftRight, Landmark, Calendar, BarChart3,
  Clock, Layers, DollarSign, Hourglass, ShieldCheck, Lock, Percent,
  Repeat, Scale, CalendarRange, ChevronDown,
} from 'lucide-react'

import {
  useCategoryBreakdown,
  useTotals,
  useQuickInsights,
  useMonthlyAggregation,
} from '@/hooks/api/useAnalytics'
import { useDailySummaries, useMonthlySummaries } from '@/hooks/api/useAnalyticsV2'
import { useAnimatedValue } from '@/hooks/useAnimatedValue'
import { toLocalDateKey } from '@/lib/dateUtils'
import { formatCurrency } from '@/lib/formatters'
import { netSavings as computeNetSavings, savingsRatePercentOr } from '@/lib/savingsRate'

import ErrorState from './ErrorState'
import LoadingSkeleton from './LoadingSkeleton'
import {
  type CategoryData,
  type InsightDescriptor,
  getVisibleWidgetKeys,
  filterByVisibility,
  computeDaysInRange,
  computeMonthsInRange,
  resolveSpanRange,
  medianSpendingDay,
  medianSpendingMonth,
  fmtChange,
  buildQuickInsights,
  buildFunFacts,
  DAY_NAMES,
  monthLabel,
} from './quickInsightsData'
import { typicalMonthlyIncome } from './recentIncome'

/**
 * Upper bound the `/analytics/v2/daily-summaries` endpoint accepts (`Query(le=3000)`).
 * Requesting the maximum keeps ~8 years of daily history in one page; beyond it
 * the endpoint truncates the oldest days and the "typical spending day" figure
 * self-suppresses rather than quoting a partially covered window.
 */
const MAX_DAILY_SUMMARY_ROWS = 3000

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
  // Format-preserving count-up; settles on the exact formatted string.
  const animatedValue = useAnimatedValue(item.value)
  return (
    <div className="quick-insight-card ledger-cell flex min-h-20 items-center gap-3 p-3 transition-colors duration-150 hover:bg-[var(--overlay-1)]">
      <div className={`flex size-7 shrink-0 items-center justify-center rounded-md ${item.bg}`}>
        <item.icon className={`size-3.5 ${item.color}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] leading-4 text-muted-foreground">{item.title}</p>
        <p className="insight-value ledger-figure whitespace-nowrap font-semibold text-foreground tabular-nums" title={item.value}>
          {animatedValue}
        </p>
        {item.subtitle && (
          <p className="break-words text-[11px] leading-4 text-text-tertiary" title={item.subtitle}>
            {item.subtitle}
          </p>
        )}
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
  const categoryQuery = useCategoryBreakdown({
    transaction_type: 'expense',
    ...dateRange,
  })
  const insightsQuery = useQuickInsights(dateRange)
  const totalsQuery = useTotals(dateRange)
  // Period series behind the "typical day / typical month" halves of the mean
  // KPIs. The daily series asks for the endpoint's maximum page because the
  // 1,500-row default truncates the OLDEST days, and `medianSpendingDay` then
  // refuses to quote a typical day for any window starting before the first row
  // it received. On the real ledger (1,519 stored days) the default page dropped
  // 2019-01-01..2019-06-08, which is why this costs one request that the
  // no-argument app-wide prefetch cannot serve.
  const monthlyQuery = useMonthlyAggregation(dateRange)
  const dailyQuery = useDailySummaries({ limit: MAX_DAILY_SUMMARY_ROWS })
  // Recent-income baseline for Recurring Coverage. Argument-free so it shares the
  // cache slot the app-wide prefetch already warms -- no extra request.
  const monthlySummariesQuery = useMonthlySummaries()
  const categoryData = categoryQuery.data
  const insights = insightsQuery.data
  const totalsData = totalsQuery.data

  // The three rollup series are deliberately absent from the gates below. Each
  // one only feeds a disclosure that self-suppresses when its data is missing:
  // the period series drop the "typical" half of a subtitle, and the income
  // baseline withholds the Recurring Coverage card. Failing there degrades one
  // line rather than blanking every card in the band.
  const isLoading = categoryQuery.isLoading || insightsQuery.isLoading || totalsQuery.isLoading
  const isError = categoryQuery.isError || insightsQuery.isError || totalsQuery.isError
  const retry = () => {
    void Promise.all([
      categoryQuery.refetch(),
      insightsQuery.refetch(),
      totalsQuery.refetch(),
      monthlyQuery.refetch(),
      dailyQuery.refetch(),
      monthlySummariesQuery.refetch(),
    ])
  }

  const categories = categoryData?.categories ?? {}

  const topCategory = Object.entries(categories)
    .sort(([, a], [, b]) => (b as CategoryData).total - (a as CategoryData).total)[0]

  // Days/months in range: prefer the explicit filter, else the data's actual
  // span (returned by the endpoint as min/max date) -- no raw rows needed. The
  // end is capped at today so forward-dated rows cannot stretch the divisor past
  // the elapsed period; see `resolveSpanRange`.
  const spanRange = resolveSpanRange(dateRange, insights, toLocalDateKey(new Date()))
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
  //
  // Savings rate and net savings are recomputed from the flows through the
  // shared definition rather than read from the response's own `savings_rate` /
  // `net_savings` fields. Those are precomputed server-side, so a tile could
  // contradict the income and expense totals printed beside it on this very
  // card. Deriving all three from one pair of flows makes the band internally
  // consistent by construction.
  //
  // This does NOT make the number true: on the no-date-filter path the backend
  // serves these totals from the `monthly_summaries` rollup, which can lag the
  // raw ledger. That staleness is surfaced separately by StaleAnalyticsAlert.
  const totalIncome = totalsData?.total_income ?? 0
  const totalExpenses = Math.abs(totalsData?.total_expenses ?? 0)
  const savingsRate = savingsRatePercentOr({ income: totalIncome, expense: totalExpenses })
  const netSavings = computeNetSavings({ income: totalIncome, expense: totalExpenses })

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

  // Typical (median) counterparts to the mean rate KPIs. Scoped to the same
  // window the means use so the two halves of a subtitle describe one period.
  const typicalSpendingDay = medianSpendingDay(dailyQuery.data, spanRange)
  const typicalSpendingMonth = medianSpendingMonth(monthlyQuery.data)

  // ─── Build two arrays: Quick Insights (key metrics) + Fun Facts (behavioral) ─

  const biggestTransaction = {
    amount: insights?.biggest_expense?.amount ?? 0,
    category: insights?.biggest_expense?.category || 'N/A',
  }

  // Recurring coverage: what % of monthly income goes to fixed recurring.
  //
  // The denominator is the median of the last 12 COMPLETE months, not the
  // all-time mean (`totalIncome / monthsInRange`). Both the numerator and the
  // question are about today: `fixedCommitmentsMonthly` is what the active
  // recurring patterns cost per month right now. Dividing that by a lifetime
  // average of a growing income answers nothing -- on the real ledger the mean is
  // 68,130.93/month against a recent median of 216,756.94, which turned 115,027.89
  // of commitments into 168.8% coverage ("High fixed cost load") instead of 53.1%.
  //
  // Falling back to the all-time mean when the rollup is unavailable would swap
  // the honest number for the wrong one, so coverage stays null and the card is
  // withheld instead.
  const typicalIncome = typicalMonthlyIncome(monthlySummariesQuery.data)
  const recurringCoverage =
    typicalIncome != null && typicalIncome > 0
      ? (fixedCommitmentsMonthly / typicalIncome) * 100
      : null

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
      medianSpendingDay: typicalSpendingDay,
      medianSpendingMonth: typicalSpendingMonth,
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
  const visibleQuickInsights = filterByVisibility(quickInsights, visibleKeys)
  const visibleFunFacts = filterByVisibility(funFacts, visibleKeys)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="ledger-band ledger-flow-grid">
          {Array.from({ length: 7 }, (_, i) => <LoadingSkeleton key={`s-${i}`} className="h-16 w-full" />)}
        </div>
        <div className="ledger-band ledger-flow-grid">
          {Array.from({ length: 8 }, (_, i) => <LoadingSkeleton key={`f-${i}`} className="h-16 w-full" />)}
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <ErrorState
        title="Insights unavailable"
        message="We could not load the selected period's insights. No values have been replaced with zero."
        onRetry={retry}
        errorType="network"
        variant="inline"
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="ledger-band ledger-flow-grid">
        {visibleQuickInsights.map((item) => <InsightCard key={item.title} item={item} />)}
      </div>

      <details className="group">
        <summary className="ledger-control flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-md border px-3 py-2 text-sm font-medium text-foreground">
          <span className="flex-1">Behavior signals</span>
          <span className="text-xs font-normal text-muted-foreground">
            {visibleFunFacts.length} metrics
          </span>
          <ChevronDown
            className="size-4 text-muted-foreground transition-transform duration-150 group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <div className="ledger-band ledger-flow-grid mt-2">
          {visibleFunFacts.map((item) => <InsightCard key={item.title} item={item} />)}
        </div>
      </details>
    </div>
  )
}
