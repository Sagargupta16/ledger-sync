import { lazy, Suspense, useMemo, type ReactNode } from 'react'

import { Upload, ArrowUpRight, CalendarRange } from 'lucide-react'
import { Link } from 'react-router'
import InvestmentFlowSummary from '@/components/analytics/InvestmentFlowSummary'
import SourcePanel from '@/components/analytics/SourcePanel'

import { ROUTES } from '@/constants'
import QuickInsights from '@/components/shared/QuickInsights'
import {
  CardGridSkeleton,
  ChartSkeleton,
  PageSkeleton,
  PanelSkeleton,
} from '@/components/shared/LoadingSkeleton'
import AnalyticsTimeFilter from '@/components/shared/AnalyticsTimeFilter'
import EmptyState from '@/components/shared/EmptyState'
import PageErrorState from '@/components/shared/PageErrorState'
import { PeriodSettlingBar, PeriodSettlingContent } from '@/components/shared/PeriodSettling'
import RefreshFailedNotice from '@/components/shared/RefreshFailedNotice'
import { blockingError, refreshFailed, retryFailed } from '@/lib/queryStatus'
import { formatCurrency, formatDate } from '@/lib/formatters'
import { getFYFromDate, getTodayKey } from '@/lib/dateUtils'
import { summarizeRecurringCommitments } from '@/lib/recurringCalculations'
import { Button, PageContainer, PageHeader, StickyToolbar } from '@/components/ui'
import { useDashboardMetrics } from '@/hooks/useDashboardMetrics'
import { RECURRING_COMMITMENTS_PARAMS } from '@/hooks/api/recurringCommitmentsParams'
import { useRecurringTransactions } from '@/hooks/api/useAnalyticsV2'

// Dashboard is an eager route, so anything it imports statically is
// modulepreloaded on every entry, including the anonymous Home page. The chart
// components are what pull the chart kit in; loading them on demand keeps it
// off the first-load path. Each fallback matches its component's footprint.
const MonthlyFlowChart = lazy(() => import('@/components/analytics/MonthlyFlowChart'))
const FinancialHealthScore = lazy(() => import('@/components/analytics/FinancialHealthScore'))
// The recap's Explain button pulls in the chat adapters, the watch tiles
// MetricCard and Sparkline, and safe to spend its balance projection chart, so
// these load on demand as well.
const SafeToSpendCard = lazy(() => import('@/components/analytics/SafeToSpendCard'))
const WeeklyRecapCard = lazy(() => import('@/components/analytics/WeeklyRecapCard'))
const WatchTiles = lazy(() => import('@/components/analytics/WatchTiles'))

const SAFE_TO_SPEND_FALLBACK = <PanelSkeleton blocks={2} blockClassName="h-16" />

function DashboardEmpty({ hasHistory, onViewAll, toolbar }: Readonly<{
  hasHistory: boolean
  onViewAll: () => void
  toolbar: ReactNode
}>) {
  const empty = hasHistory ? {
    icon: CalendarRange,
    title: 'No transactions in this period',
    description: 'Pick another period above, or open your full history.',
    actionLabel: 'View all history',
    onAction: onViewAll,
  } : {
    icon: Upload,
    title: 'No transactions yet',
    description: 'Upload a bank statement to unlock your spending breakdowns, insights, and health score.',
    actionLabel: 'Upload Data',
    actionHref: ROUTES.UPLOAD,
  }
  return (
    <PageContainer>
      <PageHeader title="Dashboard" subtitle="Monitor cash flow, financial health, and account activity." />
      {hasHistory && toolbar}
      {/* Safe to spend is about today, so an empty period still shows it. */}
      {hasHistory && (
        <Suspense fallback={SAFE_TO_SPEND_FALLBACK}>
          <SafeToSpendCard />
        </Suspense>
      )}
      <EmptyState {...empty} variant="card" />
    </PageContainer>
  )
}

export default function DashboardPage() {
  const {
    viewMode, setViewMode,
    currentYear, setCurrentYear,
    currentMonth, setCurrentMonth,
    currentFY, setCurrentFY,
    fiscalYearStartMonth,
    dataDateRange, dateRange,
    isSummaryLoading, hasTransactionsInRange, isError, refreshFailed: metricsRefreshFailed, retry,
    ageOfMoney, daysOfBuffering,
    isSettling,
    incomeBreakdown, cashbacksTotal,
    incomeChartData,
    expenseChartData,
    monthlyFlow,
    partialMonthLabel,
    momChanges,
    investmentTransfers,
    hasInvestmentMappings,
  } = useDashboardMetrics({ includeQuickInsights: true })

  // Fixed Commitments from active recurring.
  //
  // Commitments only, confirmed OR detected. Requiring is_confirmed read 0 until
  // rows are confirmed on the Subscriptions page, so a ledger full of real rent
  // reported no fixed costs. Habit rows (the daily lunch) are excluded because
  // they repeat without being owed. The shared params object keeps this on the
  // same cache entry as every other "active commitments" reader.
  const recurringQuery = useRecurringTransactions(RECURRING_COMMITMENTS_PARAMS)
  const recurringItems = useMemo(() => recurringQuery.data ?? [], [recurringQuery.data])
  const fixedCommitments = useMemo(
    () => recurringItems.filter((r) => r.type === 'Expense'),
    [recurringItems],
  )
  const today = getTodayKey()
  const commitmentSummary = useMemo(
    () => summarizeRecurringCommitments(fixedCommitments, today),
    [fixedCommitments, today],
  )

  const incomeBreakdownTotal = useMemo(
    () => Object.values(incomeBreakdown ?? {}).reduce((a, b) => a + b, 0),
    [incomeBreakdown],
  )

  // One snapshot gates the page: the rollups and `/api/dashboard-metrics/pulse`
  // (Age of Money, Days of Buffering, the investment-transfer split) settle
  // together, so nothing fills in after first paint.
  const pageError = isError || blockingError([recurringQuery])
  const pageLoading = !pageError && (isSummaryLoading || recurringQuery.isLoading)
  const showRefreshNotice = metricsRefreshFailed || refreshFailed([recurringQuery])
  const retryDashboard = () => {
    retry()
    void retryFailed([recurringQuery])
  }
  const focusCurrentFY = () => {
    setCurrentFY(getFYFromDate(getTodayKey(), fiscalYearStartMonth))
    setViewMode('fy')
  }

  const timeToolbar = (
    <StickyToolbar label="Time range">
      <AnalyticsTimeFilter
        viewMode={viewMode} onViewModeChange={setViewMode}
        currentYear={currentYear} currentMonth={currentMonth} currentFY={currentFY}
        onYearChange={setCurrentYear} onMonthChange={setCurrentMonth} onFYChange={setCurrentFY}
        minDate={dataDateRange.minDate} maxDate={dataDateRange.maxDate}
        fiscalYearStartMonth={fiscalYearStartMonth}
      />
      <PeriodSettlingBar active={isSettling} />
    </StickyToolbar>
  )

  if (pageLoading) return <PageSkeleton />

  if (pageError) {
    return (
      <PageErrorState
        title="Dashboard"
        subtitle="Monitor cash flow, financial health, and account activity."
        onRetry={retryDashboard}
      />
    )
  }

  // First-run: no transactions at all. Show a single full-page prompt to upload
  // instead of a grid of empty widgets.
  if (!hasTransactionsInRange) {
    return (
      <DashboardEmpty
        hasHistory={Boolean(dataDateRange.maxDate)}
        onViewAll={() => setViewMode('all_time')}
        toolbar={timeToolbar}
      />
    )
  }

  return (
    <PageContainer>
      <PageHeader
        title="Dashboard"
        subtitle="Monitor cash flow, financial health, and account activity."
      />

      {timeToolbar}

      {showRefreshNotice && <RefreshFailedNotice onRetry={retryDashboard} />}

      {/* Today to payday, the last full week and this month so far: none follows
          the time range, so they sit outside the settling wrapper and never dim. */}
      <Suspense fallback={SAFE_TO_SPEND_FALLBACK}>
        <SafeToSpendCard />
      </Suspense>
      <Suspense fallback={<PanelSkeleton blockClassName="h-28" blocks={2} />}>
        <WeeklyRecapCard />
      </Suspense>
      <Suspense fallback={<CardGridSkeleton count={2} cols="grid-cols-2 lg:grid-cols-4" />}>
        <WatchTiles />
      </Suspense>

      <PeriodSettlingContent settling={isSettling}>
        <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-b border-[var(--hairline-1)] pb-4">
          <p className="text-xs leading-5 text-muted-foreground">
            {dataDateRange.maxDate && <>Latest transaction: <time dateTime={dataDateRange.maxDate}>{formatDate(dataDateRange.maxDate)}</time>. </>}
            Monthly comparisons use complete months.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              icon={<CalendarRange className="size-3.5" />}
              onClick={focusCurrentFY}
            >
              Focus current FY
            </Button>
            <Link to={ROUTES.INCOME_EXPENSE_FLOW} className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
              Follow the money <ArrowUpRight className="size-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>

        <Suspense fallback={<ChartSkeleton />}>
          <MonthlyFlowChart data={monthlyFlow} partialMonthLabel={partialMonthLabel} />
        </Suspense>

        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Financial pulse</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              The selected period's money flow, liquidity, and recurring load. Computation
              aids from your recorded data, not financial advice.
            </p>
          </div>
          <QuickInsights
            dateRange={dateRange}
            ageOfMoney={ageOfMoney}
            daysOfBuffering={daysOfBuffering}
            fixedCommitmentsMonthly={commitmentSummary.monthlyExpense}
            fixedCount={commitmentSummary.count}
            momChanges={momChanges}
          />
          {commitmentSummary.needsReview.count > 0 && (
            <aside aria-label="Recurring estimates needing review" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-app-orange/20 bg-app-orange/5 px-4 py-3">
              <p className="min-w-0 text-xs leading-5 text-muted-foreground">
                Fixed costs include {formatCurrency(commitmentSummary.needsReview.monthlyExpense)}/month
                {' '}from {commitmentSummary.needsReview.count} older, unconfirmed detections.
                {' '}{formatCurrency(commitmentSummary.current.monthlyExpense)}/month is recent or confirmed.
              </p>
              <Link to={ROUTES.SUBSCRIPTIONS} className="inline-flex min-h-11 shrink-0 items-center gap-1 text-xs font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                Review recurring items <ArrowUpRight className="size-3.5" aria-hidden="true" />
              </Link>
            </aside>
          )}
        </section>

        {/* Spending first, then the income that funds it. */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          <SourcePanel kind="expense" data={expenseChartData} />
          <SourcePanel kind="income" data={incomeChartData} total={incomeBreakdownTotal}>
            {/* Same figure and label as the band's "Net Cashback Earned"
                card: cashback rows minus cashback shared on. It used to
                read "Cashbacks Earned" over the whole non-taxable list,
                product refunds and reimbursements included. */}
            {cashbacksTotal > 0 && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-app-teal">Net Cashback Earned</span>
                <span className="text-app-teal font-medium">{formatCurrency(cashbacksTotal)}</span>
              </div>
            )}
          </SourcePanel>
        </div>

        <InvestmentFlowSummary flows={investmentTransfers} hasMappings={hasInvestmentMappings} />
      </PeriodSettlingContent>

      {/* Same shape as FinancialHealthScore's own loading state. */}
      <Suspense fallback={<PanelSkeleton />}>
        <FinancialHealthScore />
      </Suspense>

      <nav aria-label="Planning shortcuts" className="flex flex-wrap gap-x-6 gap-y-1 border-t border-[var(--hairline-1)] pt-3">
        {[
          { to: ROUTES.TAX_PLANNING, label: 'Salary & RSU planning' },
          { to: ROUTES.BUDGETS, label: 'Set a budget' },
          { to: ROUTES.GOALS, label: 'Track a goal' },
        ].map(({ to, label }) => (
          <Link key={to} to={to} className="inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
            {label} <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </Link>
        ))}
      </nav>

      <div className="ledger-ruler" aria-hidden="true" />
    </PageContainer>
  )
}
