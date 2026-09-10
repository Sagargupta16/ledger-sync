import { useMemo } from 'react'

import { motion } from 'motion/react'
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
import { EASING } from '@/constants/animations'
import { toLocalDateKey } from '@/lib/dateUtils'
import { formatCurrency } from '@/lib/formatters'
import { netSavings as computeNetSavings, savingsRatePercentOr } from '@/lib/savingsRate'
import { useMotionStore } from '@/store/motionStore'

import ErrorState from './ErrorState'
import LoadingSkeleton from './LoadingSkeleton'
import {
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
const MONEY_FLOW_INSIGHT_COUNT = 4

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

function InsightCard({
  item,
  emphasis = false,
  index = 0,
}: Readonly<{ item: InsightDescriptor; emphasis?: boolean; index?: number }>) {
  // Format-preserving count-up; settles on the exact formatted string.
  const animatedValue = useAnimatedValue(item.value)
  const reduceMotion = useMotionStore((state) => state.mode === 'reduced')
  const reveal = {
    initial: reduceMotion ? false as const : { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: {
      duration: reduceMotion ? 0 : 0.32,
      delay: reduceMotion ? 0 : Math.min(index * 0.04, 0.16),
      ease: EASING.cinematic,
    },
  }

  if (emphasis) {
    return (
      <motion.div {...reveal} className="@container ledger-cell flex min-h-36 flex-col p-4">
        <dl className="flex flex-1 flex-col">
          <dt className="flex items-start justify-between gap-3">
            <span className="min-w-0 text-xs font-medium leading-5 text-muted-foreground">
              {item.title}
            </span>
            <item.icon className={`mt-0.5 size-4 shrink-0 ${item.color}`} aria-hidden="true" />
          </dt>
          <dd
            className="ledger-figure mt-4 break-words font-mono text-xl font-semibold leading-tight text-foreground tabular-nums @min-[14rem]:text-2xl"
            title={item.value}
          >
            {animatedValue}
          </dd>
          {item.subtitle && (
            <dd className="mt-2 break-words text-xs leading-5 text-text-tertiary tabular-nums" title={item.subtitle}>
              {item.subtitle}
            </dd>
          )}
        </dl>
      </motion.div>
    )
  }

  return (
    <motion.div
      {...reveal}
      className="ledger-cell flex min-h-28 items-start gap-3 p-4"
      style={{ flexBasis: '13rem', minWidth: 'min(100%, 13rem)' }}
    >
      <div className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md ${item.bg}`}>
        <item.icon className={`size-3.5 ${item.color}`} aria-hidden="true" />
      </div>
      <dl className="min-w-0 flex-1">
        <dt className="text-xs leading-5 text-muted-foreground">{item.title}</dt>
        <dd className="ledger-figure mt-1 break-words text-base font-semibold leading-6 text-foreground tabular-nums" title={item.value}>
          {animatedValue}
        </dd>
        {item.subtitle && (
          <dd className="mt-1 break-words text-xs leading-5 text-text-tertiary tabular-nums" title={item.subtitle}>
            {item.subtitle}
          </dd>
        )}
      </dl>
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
    .sort(([, a], [, b]) => (b).total - (a).total)[0]

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
    (sum, cat) => sum + Object.keys((cat).subcategories || {}).length, 0,
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

  // Keep the semantic groups stable when a user hides a configurable metric.
  const visibleKeys = useMemo(() => getVisibleWidgetKeys(), [])
  const moneyFlowInsights = quickInsights.slice(0, MONEY_FLOW_INSIGHT_COUNT)
  const operatingInsights = quickInsights.slice(MONEY_FLOW_INSIGHT_COUNT)
  const visibleMoneyFlowInsights = filterByVisibility(moneyFlowInsights, visibleKeys)
  const visibleOperatingInsights = filterByVisibility(operatingInsights, visibleKeys)
  const visibleFunFacts = filterByVisibility(funFacts, visibleKeys)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="ledger-band grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))]">
          {Array.from({ length: 4 }, (_, i) => <LoadingSkeleton key={`s-${i}`} className="h-36 w-full" />)}
        </div>
        <div className="ledger-band grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))]">
          {Array.from({ length: 4 }, (_, i) => <LoadingSkeleton key={`f-${i}`} className="h-28 w-full" />)}
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
    <div className="space-y-6">
      <section aria-labelledby="money-flow-heading">
        <div className="mb-3">
          <div className="flex items-center gap-3">
            <h3 id="money-flow-heading" className="ledger-meta text-text-secondary">
              Money flow
            </h3>
            <span className="h-px flex-1 bg-[var(--hairline-1)]" aria-hidden="true" />
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Income, spending, and retained cash for this period.
          </p>
        </div>
        <div className="ledger-band grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))]">
          {visibleMoneyFlowInsights.map((item, index) => (
            <InsightCard key={item.title} item={item} index={index} emphasis />
          ))}
        </div>
      </section>

      {visibleOperatingInsights.length > 0 && (
        <section aria-labelledby="operating-position-heading">
          <div className="mb-3">
            <div className="flex items-center gap-3">
              <h3 id="operating-position-heading" className="ledger-meta text-text-secondary">
                Operating position
              </h3>
              <span className="h-px flex-1 bg-[var(--hairline-1)]" aria-hidden="true" />
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Liquidity, commitments, and short-term resilience.
            </p>
          </div>
          <div className="ledger-band grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))]">
            {visibleOperatingInsights.map((item, index) => (
              <InsightCard key={item.title} item={item} index={index} />
            ))}
          </div>
        </section>
      )}

      <details open className="group/signals">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-md py-2 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
          <span className="flex-1">Behavior signals</span>
          <span className="font-mono text-xs font-normal text-muted-foreground tabular-nums">
            {visibleFunFacts.length} metrics
          </span>
          <ChevronDown
            className="size-4 text-muted-foreground transition-transform duration-150 group-open/signals:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <div className="ledger-band ledger-flow-grid mt-2">
          {visibleFunFacts.map((item, index) => (
            <InsightCard key={item.title} item={item} index={index} />
          ))}
        </div>
      </details>
    </div>
  )
}
