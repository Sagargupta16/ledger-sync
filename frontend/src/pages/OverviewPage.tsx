import { useMemo } from 'react'

import { useNavigate } from 'react-router-dom'
import { TrendingUp, TrendingDown, Wallet, PiggyBank, Target, AlertTriangle } from 'lucide-react'

import { ROUTES } from '@/constants'
import { PageContainer, PageHeader } from '@/components/ui'
import MetricCard from '@/components/shared/MetricCard'
import ProgressBar from '@/components/shared/ProgressBar'
import EmptyState from '@/components/shared/EmptyState'
import PageErrorState from '@/components/shared/PageErrorState'
import { PageSkeleton } from '@/components/shared/LoadingSkeleton'
import { rawColors } from '@/constants/colors'
import { formatCurrency, formatPercent } from '@/lib/formatters'
import { useDashboardMetrics } from '@/hooks/useDashboardMetrics'
import { useBudgets, useGoals } from '@/hooks/api/useAnalyticsV2'

/**
 * Overview -- the single "whole picture" page (IA audit item F).
 *
 * Composes EXISTING data (dashboard metrics + budgets + goals hooks; no new
 * backend) into one scannable screen so a user can answer "how am I doing?"
 * without tabbing across Cash Flow + Net Worth + Budgets + Goals. Every block
 * deep-links to its detail page for drill-down. Dashboard stays the
 * configurable widget board; Overview is the fixed at-a-glance summary.
 */
export default function OverviewPage() {
  const navigate = useNavigate()
  const {
    filteredTotals, isLoading, isError, retry,
    incomeChartData, expenseChartData,
    momChanges,
  } = useDashboardMetrics()

  const budgetsQuery = useBudgets({ active_only: true })
  const goalsQuery = useGoals()
  const budgets = useMemo(() => budgetsQuery.data ?? [], [budgetsQuery.data])
  const goals = useMemo(() => goalsQuery.data ?? [], [goalsQuery.data])

  const income = Number(filteredTotals?.total_income ?? 0)
  const expenses = Math.abs(Number(filteredTotals?.total_expenses ?? 0))
  const net = income - expenses
  const savingsRate = income > 0 ? (net / income) * 100 : 0

  const atRiskBudgets = useMemo(
    () => budgets
      .filter((b) => b.usage_pct >= b.alert_threshold)
      .sort((a, b) => b.usage_pct - a.usage_pct)
      .slice(0, 4),
    [budgets],
  )

  const activeGoals = useMemo(
    () => goals.filter((g) => !g.is_achieved).sort((a, b) => b.progress_pct - a.progress_pct).slice(0, 4),
    [goals],
  )

  const topIncome = useMemo(() => incomeChartData.slice(0, 3), [incomeChartData])
  const topExpense = useMemo(() => expenseChartData.slice(0, 3), [expenseChartData])

  if (isLoading || budgetsQuery.isLoading || goalsQuery.isLoading) return <PageSkeleton />

  if (isError || budgetsQuery.isError || goalsQuery.isError) {
    const retryOverview = () => {
      retry()
      void budgetsQuery.refetch()
      void goalsQuery.refetch()
    }
    return (
      <PageErrorState
        title="Overview"
        subtitle="Your complete financial picture"
        onRetry={retryOverview}
      />
    )
  }

  const hasData = income > 0 || expenses > 0
  if (!hasData) {
    return (
      <PageContainer>
        <PageHeader title="Overview" subtitle="Your complete financial picture" />
        <EmptyState
          icon={Wallet}
          title="No data yet"
          description="Upload a bank statement to see your complete financial picture here."
          actionLabel="Upload Data"
          actionHref={ROUTES.UPLOAD}
        />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader title="Overview" subtitle="Your complete financial picture" />

      {/* Headline KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
        <MetricCard
          title="Income" value={formatCurrency(income)} icon={TrendingUp} color="green"
          change={momChanges?.income} changeLabel="vs last month"
          onClick={() => navigate(ROUTES.INCOME_ANALYSIS)}
        />
        <MetricCard
          title="Spending" value={formatCurrency(expenses)} icon={TrendingDown} color="red"
          change={momChanges?.expense} changeLabel="vs last month" invertChange
          onClick={() => navigate(ROUTES.SPENDING_ANALYSIS)}
        />
        <MetricCard
          title="Net Saved" value={formatCurrency(net)} icon={PiggyBank}
          color={net >= 0 ? 'purple' : 'red'}
          subtitle={`${formatPercent(savingsRate)} savings rate`}
          onClick={() => navigate(ROUTES.INCOME_EXPENSE_FLOW)}
        />
        <MetricCard
          title="Net Worth" value="View" icon={Wallet} color="blue"
          subtitle="Assets less liabilities"
          onClick={() => navigate(ROUTES.NET_WORTH)}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Where money goes / comes from */}
        <div className="p-6 glass rounded-2xl border border-border">
          <h2 className="text-lg font-semibold mb-4">This Period</h2>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-medium text-app-green mb-2">Top Income</h3>
              <ul className="space-y-1.5">
                {topIncome.length > 0 ? topIncome.map((d) => (
                  <li key={d.name} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-muted-foreground" title={d.name}>{d.name}</span>
                    <span className="shrink-0 tabular-nums font-medium">{formatCurrency(d.value)}</span>
                  </li>
                )) : <li className="text-sm text-text-tertiary">No income data</li>}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-medium text-app-red mb-2">Top Spending</h3>
              <ul className="space-y-1.5">
                {topExpense.length > 0 ? topExpense.map((d) => (
                  <li key={d.name} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-muted-foreground" title={d.name}>{d.name}</span>
                    <span className="shrink-0 tabular-nums font-medium">{formatCurrency(d.value)}</span>
                  </li>
                )) : <li className="text-sm text-text-tertiary">No expense data</li>}
              </ul>
            </div>
          </div>
        </div>

        {/* Budgets at risk */}
        <button
          type="button"
          onClick={() => navigate(ROUTES.BUDGETS)}
          aria-label="Open budget details"
          className="p-6 glass rounded-2xl border border-border text-left transition-colors hover:bg-[var(--overlay-2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-app-orange/40"
        >
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-app-orange" />
            Budgets at Risk
          </h2>
          {atRiskBudgets.length > 0 ? (
            <div className="space-y-3">
              {atRiskBudgets.map((b) => (
                <div key={b.category}>
                  <div className="flex items-center justify-between gap-2 text-sm mb-1">
                    <span className="truncate" title={b.category}>{b.category}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{formatPercent(b.usage_pct)}</span>
                  </div>
                  <ProgressBar
                    value={b.usage_pct} max={100}
                    color={b.usage_pct >= 100 ? rawColors.app.red : rawColors.app.orange}
                    ariaLabel={`${b.category} budget ${formatPercent(b.usage_pct)} used`}
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-tertiary">All budgets are on track.</p>
          )}
        </button>
      </div>

      {/* Goals progress */}
      <button
        type="button"
        onClick={() => navigate(ROUTES.GOALS)}
        aria-label="Open financial goals"
        className="w-full p-6 glass rounded-2xl border border-border text-left transition-colors hover:bg-[var(--overlay-2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-app-purple/40"
      >
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Target className="w-5 h-5 text-app-purple" />
          Goals Progress
        </h2>
        {activeGoals.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {activeGoals.map((g) => (
              <div key={g.name}>
                <div className="flex items-center justify-between gap-2 text-sm mb-1">
                  <span className="truncate" title={g.name}>{g.name}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatCurrency(g.current_amount)} / {formatCurrency(g.target_amount)}
                  </span>
                </div>
                <ProgressBar
                  value={g.progress_pct} max={100} color={rawColors.app.purple}
                  ariaLabel={`${g.name} ${formatPercent(g.progress_pct)} complete`}
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-tertiary">No active goals -- set one to start tracking.</p>
        )}
      </button>
    </PageContainer>
  )
}
