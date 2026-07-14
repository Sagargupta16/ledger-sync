import { useMemo } from 'react'

import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Wallet, CreditCard, Upload } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import StandardPieChart from '@/components/analytics/StandardPieChart'

import { ROUTES } from '@/constants'
import { SCROLL_FADE_UP } from '@/constants/animations'
import QuickInsights from '@/components/shared/QuickInsights'
import { PageSkeleton } from '@/components/shared/LoadingSkeleton'
import AnalyticsTimeFilter from '@/components/shared/AnalyticsTimeFilter'
import EmptyState from '@/components/shared/EmptyState'
import { FinancialHealthScore } from '@/components/analytics'
import { formatCurrency, formatCurrencyShort } from '@/lib/formatters'
import { PageContainer, PageHeader } from '@/components/ui'
import { useDashboardMetrics } from '@/hooks/useDashboardMetrics'
import { useAccountBalances } from '@/hooks/api/useAnalytics'
import { computeAgeOfMoney, computeDaysOfBuffering } from '@/lib/ageOfMoneyCalculator'
import { usePreferences } from '@/hooks/api/usePreferences'
import { useRecurringTransactions } from '@/hooks/api/useAnalyticsV2'
import { accountClassificationsService } from '@/services/api/accountClassifications'
import { toMonthlyAmount } from '@/pages/subscription-tracker/helpers'

/** Account types whose balances count as spendable for runway math. */
const LIQUID_CLASSIFICATIONS = new Set(['Cash', 'Bank Accounts', 'Other Wallets'])

export default function DashboardPage() {
  const navigate = useNavigate()
  usePreferences()

  const {
    viewMode, setViewMode,
    currentYear, setCurrentYear,
    currentMonth, setCurrentMonth,
    currentFY, setCurrentFY,
    fiscalYearStartMonth,
    dataDateRange, dateRange,
    filteredTransactions, isLoading,
    incomeBreakdown, cashbacksTotal,
    incomeChartData, incomeColorStyles,
    expenseChartData, expenseColorStyles,
    momChanges,
  } = useDashboardMetrics()

  // Fixed Commitments from active recurring
  const { data: recurringItems = [] } = useRecurringTransactions({ active_only: true, min_confidence: 0 })
  const fixedCommitmentsMonthly = useMemo(() => {
    const confirmed = recurringItems.filter((r) => r.is_confirmed && r.type === 'Expense')
    return confirmed.reduce((sum, r) => sum + toMonthlyAmount(r.expected_amount, r.frequency), 0)
  }, [recurringItems])
  const fixedCount = useMemo(
    () => recurringItems.filter((r) => r.is_confirmed && r.type === 'Expense').length,
    [recurringItems],
  )

  // Age of Money & Days of Buffering
  const ageOfMoney = useMemo(
    () => filteredTransactions?.length ? computeAgeOfMoney(filteredTransactions) : null,
    [filteredTransactions],
  )
  // Days of Buffering runs on LIQUID balances only (cash / bank / wallets).
  // Feeding lifetime income-minus-expense here counted investments (PPF, MF,
  // stocks) as spendable and inflated the runway (~754 days vs the real
  // cash position on audit data). Balances come from account_balances and
  // are filtered by the user's account classifications.
  const { data: balanceData } = useAccountBalances()
  const { data: accountClassifications } = useQuery({
    queryKey: ['account-classifications'],
    queryFn: () => accountClassificationsService.getAllClassifications(),
    staleTime: Infinity,
  })
  const daysOfBuffering = useMemo(() => {
    if (!filteredTransactions?.length || !balanceData?.accounts || !accountClassifications) {
      return null
    }
    let liquidBalance = 0
    for (const [name, acc] of Object.entries(balanceData.accounts)) {
      const cls = accountClassifications[name]
      // Unclassified accounts are excluded rather than guessed -- counting an
      // unlabeled brokerage as cash would silently re-inflate the runway.
      if (cls && LIQUID_CLASSIFICATIONS.has(cls)) {
        const bal = Number(acc.balance)
        if (Number.isFinite(bal)) liquidBalance += bal
      }
    }
    return computeDaysOfBuffering(liquidBalance, filteredTransactions)
  }, [filteredTransactions, balanceData, accountClassifications])

  const incomeTotal = useMemo(() => incomeChartData.reduce((sum, d) => sum + d.value, 0), [incomeChartData])
  const expenseTotal = useMemo(() => expenseChartData.reduce((sum, d) => sum + d.value, 0), [expenseChartData])

  // The pie folds to the largest 7 slices + an "Other" wedge (maxSlices=8).
  // Mirror that in the legend: show the top 7 rows, then a "+N more" line so the
  // visible rows reconcile with the all-categories Total below.
  const LEGEND_CAP = 7
  const incomeLegend = useMemo(() => incomeChartData.slice(0, LEGEND_CAP), [incomeChartData])
  const expenseLegend = useMemo(() => expenseChartData.slice(0, LEGEND_CAP), [expenseChartData])
  const incomeHiddenCount = Math.max(0, incomeChartData.length - LEGEND_CAP)
  const expenseHiddenCount = Math.max(0, expenseChartData.length - LEGEND_CAP)

  if (isLoading) return <PageSkeleton />

  // First-run: no transactions at all. Show a single full-page prompt to upload
  // instead of a grid of empty widgets.
  if (!filteredTransactions?.length) {
    return (
      <PageContainer>
        <PageHeader title="Dashboard" subtitle="Monitor cash flow, financial health, and account activity." />
        <EmptyState
          icon={Upload}
          title="No transactions yet"
          description="Upload a bank statement to unlock your spending breakdowns, insights, and health score."
          actionLabel="Upload Data"
          actionHref={ROUTES.UPLOAD}
          variant="card"
        />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader
        title="Dashboard"
        subtitle="Monitor cash flow, financial health, and account activity."
        action={
          <AnalyticsTimeFilter
            viewMode={viewMode} onViewModeChange={setViewMode}
            currentYear={currentYear} currentMonth={currentMonth} currentFY={currentFY}
            onYearChange={setCurrentYear} onMonthChange={setCurrentMonth} onFYChange={setCurrentFY}
            minDate={dataDateRange.minDate} maxDate={dataDateRange.maxDate}
            fiscalYearStartMonth={fiscalYearStartMonth}
          />
        }
      />

      <motion.section className="space-y-3" {...SCROLL_FADE_UP}>
        <div>
          <h2 className="text-sm font-semibold text-foreground">Ledger snapshot</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Key movements and operating signals for the selected period.
          </p>
        </div>
        <QuickInsights
          dateRange={dateRange}
          ageOfMoney={ageOfMoney}
          daysOfBuffering={daysOfBuffering}
          fixedCommitmentsMonthly={fixedCommitmentsMonthly}
          fixedCount={fixedCount}
          momChanges={momChanges}
        />
      </motion.section>

      {/* Financial Health Score */}
      <FinancialHealthScore transactions={filteredTransactions} />

      {/* Income Sources & Expense Sources */}
      <motion.div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6" {...SCROLL_FADE_UP}>
        {/* Income Sources */}
        <section className="ledger-panel p-4 sm:p-5">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-app-green/10">
              <Wallet className="size-3.5 text-app-green" />
            </span>
            Income Sources
          </h2>
          {incomeChartData.length > 0 ? (
            <div className="space-y-4">
              <StandardPieChart
                data={incomeChartData}
                height={180}
                showLegend={false}
                ariaLabel="Income sources pie chart"
                centerValue={formatCurrencyShort(incomeTotal)}
                centerLabel="Total"
                onSliceClick={(name) =>
                  navigate(`${ROUTES.INCOME_ANALYSIS}?category=${encodeURIComponent(name)}`)
                }
              />
              <div className="space-y-1">
                {incomeLegend.map((item, i) => (
                  <button
                    key={item.name}
                    type="button"
                    onClick={() => navigate(`${ROUTES.INCOME_ANALYSIS}?category=${encodeURIComponent(item.name)}`)}
                    className="w-full flex items-center justify-between gap-2 py-1 px-1 -mx-1 rounded-md hover:bg-[var(--overlay-2)] transition-colors text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-app-green/40"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="w-3 h-3 rounded-full shrink-0" style={incomeColorStyles[i]} />
                      <span className="text-sm truncate" title={item.name}>{item.name}</span>
                    </span>
                    <span className="text-sm font-medium shrink-0">{formatCurrency(item.value)}</span>
                  </button>
                ))}
                {incomeHiddenCount > 0 && (
                  <p className="text-xs text-text-tertiary px-1">+{incomeHiddenCount} more in Other</p>
                )}
                {incomeBreakdown && (
                  <div className="pt-2 mt-2 border-t border-border space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Total</span>
                      <span className="text-sm font-bold text-app-green">{formatCurrency(Object.values(incomeBreakdown).reduce((a, b) => a + b, 0))}</span>
                    </div>
                    {cashbacksTotal > 0 && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-app-teal">Cashbacks Earned</span>
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

        {/* Expense Sources */}
        <section className="ledger-panel p-4 sm:p-5">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-app-red/10">
              <CreditCard className="size-3.5 text-app-red" />
            </span>
            Expense Sources
          </h2>
          {expenseChartData.length > 0 ? (
            <div className="space-y-4">
              <StandardPieChart
                data={expenseChartData}
                height={180}
                showLegend={false}
                ariaLabel="Expense sources pie chart"
                centerValue={formatCurrencyShort(expenseTotal)}
                centerLabel="Total"
                onSliceClick={(name) =>
                  navigate(`${ROUTES.SPENDING_ANALYSIS}?category=${encodeURIComponent(name)}`)
                }
              />
              <div className="space-y-1">
                {expenseLegend.map((item, i) => (
                  <button
                    key={item.name}
                    type="button"
                    onClick={() => navigate(`${ROUTES.SPENDING_ANALYSIS}?category=${encodeURIComponent(item.name)}`)}
                    className="w-full flex items-center justify-between gap-2 py-1 px-1 -mx-1 rounded-md hover:bg-[var(--overlay-2)] transition-colors text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-app-red/40"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="w-3 h-3 rounded-full shrink-0" style={expenseColorStyles[i]} />
                      <span className="text-sm truncate" title={item.name}>{item.name}</span>
                    </span>
                    <span className="text-sm font-medium shrink-0">{formatCurrency(item.value)}</span>
                  </button>
                ))}
                {expenseHiddenCount > 0 && (
                  <p className="text-xs text-text-tertiary px-1">+{expenseHiddenCount} more in Other</p>
                )}
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
      </motion.div>

      <div className="ledger-ruler" aria-hidden="true" />
    </PageContainer>
  )
}
