import { lazy, Suspense, useMemo } from 'react'

import { Wallet, CreditCard, Upload, ArrowUpRight, CalendarRange } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import InvestmentFlowSummary from '@/components/analytics/InvestmentFlowSummary'

import PieLegend from '@/components/shared/PieLegend'
import { capPieSlices } from '@/components/ui/pieSlices'
import { ROUTES } from '@/constants'
import QuickInsights from '@/components/shared/QuickInsights'
import LoadingSkeleton, {
  CardGridSkeleton,
  ChartSkeleton,
  PageSkeleton,
  PanelSkeleton,
} from '@/components/shared/LoadingSkeleton'
import AnalyticsTimeFilter from '@/components/shared/AnalyticsTimeFilter'
import EmptyState from '@/components/shared/EmptyState'
import PageErrorState from '@/components/shared/PageErrorState'
import { PeriodSettlingBar, PeriodSettlingContent } from '@/components/shared/PeriodSettling'
import { formatCurrency, formatCurrencyShort, formatDate } from '@/lib/formatters'
import { getCurrentFY, getTodayKey } from '@/lib/dateUtils'
import { summarizeRecurringCommitments } from '@/lib/recurringCalculations'
import { Button, PageContainer, PageHeader, StickyToolbar } from '@/components/ui'
import { useDashboardMetrics } from '@/hooks/useDashboardMetrics'
import { RECURRING_COMMITMENTS_PARAMS } from '@/hooks/api/recurringCommitmentsParams'
import { useRecurringTransactions } from '@/hooks/api/useAnalyticsV2'

// Dashboard is an eager route, so anything it imports statically is
// modulepreloaded on every entry, including the anonymous Home page. The chart
// components are what pull the chart kit in; loading them on demand keeps it
// off the first-load path. Each fallback matches its component's footprint.
const StandardPieChart = lazy(() => import('@/components/analytics/StandardPieChart'))
const MonthlyFlowChart = lazy(() => import('@/components/analytics/MonthlyFlowChart'))
const FinancialHealthScore = lazy(() => import('@/components/analytics/FinancialHealthScore'))
// The recap's Explain button pulls in the chat adapters, the watch tiles
// MetricCard and Sparkline, and safe to spend its balance projection chart, so
// these load on demand as well.
const SafeToSpendCard = lazy(() => import('@/components/analytics/SafeToSpendCard'))
const WeeklyRecapCard = lazy(() => import('@/components/analytics/WeeklyRecapCard'))
const WatchTiles = lazy(() => import('@/components/analytics/WatchTiles'))

const PIE_FALLBACK = <LoadingSkeleton className="h-[180px] w-full" />
const SAFE_TO_SPEND_FALLBACK = <PanelSkeleton blocks={2} blockClassName="h-16" />

function DashboardEmpty({ hasHistory, onViewAll }: Readonly<{
  hasHistory: boolean
  onViewAll: () => void
}>) {
  const empty = hasHistory ? {
    icon: CalendarRange,
    title: 'No transactions in this period',
    description: 'Your history is available. Choose the full history to continue exploring.',
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
  const navigate = useNavigate()

  const {
    viewMode, setViewMode,
    currentYear, setCurrentYear,
    currentMonth, setCurrentMonth,
    currentFY, setCurrentFY,
    fiscalYearStartMonth,
    dataDateRange, dateRange,
    isSummaryLoading, hasTransactionsInRange, isError, retry,
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
  // Commitments only, confirmed OR detected. Requiring is_confirmed read 0 --
  // nothing in the product sets that flag, so a ledger full of real rent
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

  const incomeTotal = useMemo(() => incomeChartData.reduce((sum, d) => sum + d.value, 0), [incomeChartData])
  const expenseTotal = useMemo(() => expenseChartData.reduce((sum, d) => sum + d.value, 0), [expenseChartData])

  // The legend is built from the SAME capped array the pie renders, not a
  // hand-mirrored slice count -- that drifted the moment the pie's default cap
  // changed (7 rows listed against 6 wedges, row 7 wearing a color the pie never
  // painted). One row per wedge, including the folded "Other" rollup, so the
  // rows also add up to the Total below.
  const incomeSlices = useMemo(() => capPieSlices(incomeChartData), [incomeChartData])
  const expenseSlices = useMemo(() => capPieSlices(expenseChartData), [expenseChartData])

  // One snapshot gates the page: the rollups and `/api/dashboard-metrics/pulse`
  // (Age of Money, Days of Buffering, the investment-transfer split) settle
  // together, so nothing fills in after first paint.
  const pageLoading = isSummaryLoading || recurringQuery.isLoading
  const pageError = isError || recurringQuery.isError
  const retryDashboard = () => {
    retry()
    void recurringQuery.refetch()
  }
  const focusCurrentFY = () => {
    setCurrentFY(getCurrentFY(fiscalYearStartMonth))
    setViewMode('fy')
  }

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
      <DashboardEmpty hasHistory={Boolean(dataDateRange.maxDate)} onViewAll={() => setViewMode('all_time')} />
    )
  }

  return (
    <PageContainer>
      <PageHeader
        title="Dashboard"
        subtitle="Monitor cash flow, financial health, and account activity."
      />

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
          {/* Expense Sources */}
          <section className="dashboard-source ledger-panel p-4 sm:p-5">
            <h2 className="mb-5 flex items-center gap-2.5 text-base font-semibold">
              <span className="flex size-7 items-center justify-center text-app-red">
                <CreditCard className="size-3.5 text-app-red" />
              </span>
              <span>Expense Sources</span>
            </h2>
            {expenseChartData.length > 0 ? (
              <div className="dashboard-source-body">
                <Suspense fallback={PIE_FALLBACK}>
                  <StandardPieChart
                    data={expenseChartData}
                    height={180}
                    showLegend={false}
                    ariaLabel="Expense sources pie chart"
                    centerValue={formatCurrencyShort(expenseTotal)}
                    centerLabel="Total"
                    onSliceClick={(name) => {
                      void navigate(`${ROUTES.SPENDING_ANALYSIS}?category=${encodeURIComponent(name)}`)
                    }}
                  />
                </Suspense>
                <div className="space-y-1">
                  <PieLegend
                    slices={expenseSlices}
                    focusRingClass="focus-visible:ring-app-red/40"
                    onSelect={(name) => {
                      void navigate(`${ROUTES.SPENDING_ANALYSIS}?category=${encodeURIComponent(name)}`)
                    }}
                  />
                  <div className="pt-2 mt-2 border-t border-border">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Total</span>
                      <span className="text-sm font-bold text-app-red">{formatCurrency(expenseTotal)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState icon={CreditCard} title="No expense data available" description="Upload transactions to see your expense breakdown." actionLabel="Upload Data" actionHref="/upload" variant="compact" />
            )}
          </section>
          {/* Income Sources */}
          <section className="dashboard-source ledger-panel p-4 sm:p-5">
            <h2 className="mb-5 flex items-center gap-2.5 text-base font-semibold">
              <span className="flex size-7 items-center justify-center text-app-green">
                <Wallet className="size-3.5 text-app-green" />
              </span>
              <span>Income Sources</span>
            </h2>
            {incomeChartData.length > 0 ? (
              <div className="dashboard-source-body">
                <Suspense fallback={PIE_FALLBACK}>
                  <StandardPieChart
                    data={incomeChartData}
                    height={180}
                    showLegend={false}
                    ariaLabel="Income sources pie chart"
                    centerValue={formatCurrencyShort(incomeTotal)}
                    centerLabel="Total"
                    // `void navigate(...)`: react-router types it `void |
                    // Promise<void>`, and these props expect a void return. Same
                    // convention as CommandPalette and ProfileModal.
                    onSliceClick={(name) => {
                      void navigate(`${ROUTES.INCOME_ANALYSIS}?category=${encodeURIComponent(name)}`)
                    }}
                  />
                </Suspense>
                <div className="space-y-1">
                  <PieLegend
                    slices={incomeSlices}
                    focusRingClass="focus-visible:ring-app-green/40"
                    onSelect={(name) => {
                      void navigate(`${ROUTES.INCOME_ANALYSIS}?category=${encodeURIComponent(name)}`)
                    }}
                  />
                  {incomeBreakdown && (
                    <div className="pt-2 mt-2 border-t border-border space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Total</span>
                        <span className="text-sm font-bold text-app-green">{formatCurrency(Object.values(incomeBreakdown).reduce((a, b) => a + b, 0))}</span>
                      </div>
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
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <EmptyState icon={Wallet} title="No income data available" description="Configure income categories in Settings." actionLabel="Go to Settings" actionHref="/settings" variant="compact" />
            )}
          </section>

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
