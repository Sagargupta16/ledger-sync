import { memo, useMemo } from 'react'

import { ChevronDown, Shield } from 'lucide-react'

import { useTransactions } from '@/hooks/api/useTransactions'
import { usePreferences } from '@/hooks/api/usePreferences'
import { useAccountBalances } from '@/hooks/api/useAnalytics'
import { useInvestmentAccountStore } from '@/store/investmentAccountStore'
import { useAccountClassifications } from '@/hooks/api/useAccountClassifications'
import StandardRadarChart from '@/components/analytics/StandardRadarChart'
import { rawColors } from '@/constants/colors'
import { useCountUp } from '@/hooks/useCountUp'
import type { Transaction } from '@/types'
import { resolveAccountCategory } from '@/pages/net-worth/netWorthUtils'
import { computeCFPScore } from '@/lib/financialHealthCalculator'
import ErrorState from '@/components/shared/ErrorState'

import type { HealthMetric } from './health/healthScoreUtils'
import {
  computeMonthlyData,
  computeAnalysis,
  calculateMetrics,
  getOverallStatus,
  getSummary,
} from './health/healthScoreUtils'
import { computeBalancePosition } from './health/healthScoreBalances'
import CFPScoreView from './health/CFPScoreView'

// ─── Sub-components ────────────────────────────────────────────────────────

const LoadingSkeleton = memo(function LoadingSkeleton() {
  return (
    <div className="glass rounded-2xl border border-border p-6 animate-pulse">
      <div className="h-8 bg-muted rounded w-1/3 mb-4" />
      <div className="h-32 bg-muted rounded" />
    </div>
  )
})

const EmptyState = memo(function EmptyState() {
  return (
    <div className="glass rounded-2xl border border-border p-6">
      <h3 className="text-lg font-semibold mb-2">Financial Health</h3>
      <p className="text-muted-foreground">Need more transaction data to calculate health score.</p>
    </div>
  )
})

const METRIC_SHORT_LABELS: Record<string, string> = {
  'Spend Less Than Income': 'Savings Rate',
  'Essential Expense Ratio': 'Expense Control',
  'Emergency Fund': 'Emergency Fund',
  'Investment Regularity': 'Investing',
  'Debt-to-Income': 'Debt Ratio',
  'Debt Trend': 'Debt Trend',
  'Savings Consistency': 'Consistency',
  'Income Stability': 'Income Stability',
}

function ScoreHeader({ title, score, subtitle, color }: Readonly<{
  title: string
  score: number
  subtitle: string
  color: string
}>) {
  const animatedScore = useCountUp(score)
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <div className={`p-2 rounded-lg ${{ 'text-app-green': 'bg-app-green/10', 'text-app-orange': 'bg-app-orange/10', 'text-app-red': 'bg-app-red/10' }[color] ?? 'bg-app-blue/10'}`}>
          <Shield className={`w-4 h-4 ${color}`} />
        </div>
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <p className={`text-xl font-bold tabular-nums ${color}`}>{Math.round(animatedScore)}</p>
    </div>
  )
}

function RadarVisualization({ metrics, chartColor }: Readonly<{ metrics: Array<{ dimension: string; score: number; fullMark: number }>; chartColor: string }>) {
  return (
    <div className="mb-2">
      <StandardRadarChart
        data={metrics}
        dataKey="score"
        categoryKey="dimension"
        color={chartColor}
        name="Score"
        labelFontSize={9}
      />
    </div>
  )
}

const TIER_COLORS: Record<string, string> = {
  healthy: rawColors.app.green,
  coping: rawColors.app.orange,
  vulnerable: rawColors.app.red,
}

function HealthMetricCard({ metric }: Readonly<{ metric: HealthMetric }>) {
  const color = TIER_COLORS[metric.status] ?? rawColors.app.red

  return (
    <div className="rounded-lg border border-border bg-[var(--overlay-1)] p-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-foreground truncate">{metric.name}</span>
        <span className="text-xs font-bold tabular-nums" style={{ color }}>{Math.round(metric.score)}</span>
      </div>
      <div className="h-1 bg-muted/30 rounded-full overflow-hidden mb-1.5">
        <div
          className="h-full rounded-full"
          style={{ backgroundColor: color, width: `${metric.score}%` }}
        />
      </div>
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-text-tertiary truncate">{metric.description}</p>
        <p className="text-[10px] text-text-quaternary shrink-0 ml-2">Target: {metric.target}</p>
      </div>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────

interface FinancialHealthScoreProps {
  transactions?: Transaction[]
}

export default function FinancialHealthScore({ transactions: propTransactions }: Readonly<FinancialHealthScoreProps>) {
  const transactionsQuery = useTransactions()
  const preferencesQuery = usePreferences()
  const balancesQuery = useAccountBalances()
  const classificationsQuery = useAccountClassifications()
  const fetchedTransactions = transactionsQuery.data ?? []
  const preferences = preferencesQuery.data
  const balanceData = balancesQuery.data
  const classifications = classificationsQuery.data
  const transactions = propTransactions ?? fetchedTransactions
  const isLoading =
    (!propTransactions && transactionsQuery.isLoading) ||
    preferencesQuery.isLoading ||
    balancesQuery.isLoading ||
    classificationsQuery.isLoading
  const isError =
    (!propTransactions && transactionsQuery.isError) ||
    preferencesQuery.isError ||
    balancesQuery.isError ||
    classificationsQuery.isError
  const isInvestmentAccount = useInvestmentAccountStore((state) => state.isInvestmentAccount)
  const savingsGoalPercent = preferences?.savings_goal_percent ?? 20

  const userFixedCategories = useMemo<Set<string>>(() => {
    const raw = preferences?.fixed_expense_categories
    if (!raw) return new Set()
    let arr: string[]
    if (Array.isArray(raw)) {
      arr = raw
    } else {
      try {
        const parsed = JSON.parse(raw)
        arr = Array.isArray(parsed) ? parsed : []
      } catch {
        arr = []
      }
    }
    return new Set(arr.map((c) => c.toLowerCase()))
  }, [preferences?.fixed_expense_categories])

  const investmentMappings = useMemo(
    () => preferences?.investment_account_mappings ?? {},
    [preferences?.investment_account_mappings],
  )

  // Real balance position (liquid vs investment vs liabilities) from actual
  // account balances -- the correct basis for emergency-fund / liquidity /
  // solvency. Null until balances load, in which case scorers fall back to the
  // cumulative-flow proxy.
  const balancePosition = useMemo(() => {
    const accounts = balanceData?.accounts
    if (!accounts || Object.keys(accounts).length === 0) return null
    const classMap = classifications ?? {}
    return computeBalancePosition(accounts, (name) =>
      resolveAccountCategory(name, classMap, investmentMappings),
    )
  }, [balanceData?.accounts, classifications, investmentMappings])

  const analysisData = useMemo(() => {
    if (!transactions.length) return null
    const result = computeMonthlyData(transactions, isInvestmentAccount, userFixedCategories.size > 0 ? userFixedCategories : undefined)
    if (!result) return null
    return computeAnalysis(result.months, result.monthlyData, balancePosition)
  }, [transactions, isInvestmentAccount, userFixedCategories, balancePosition])

  const cfpCompositeScore = useMemo(() => {
    if (!analysisData) return 0
    const totalMonths = analysisData.monthsAnalyzed
    const essentialRatio = analysisData.essentialToIncomeRatio / 100
    return computeCFPScore({
      totalIncome: analysisData.avgMonthlyIncome * totalMonths,
      totalExpenses: analysisData.avgMonthlyExpense * totalMonths,
      avgMonthlyIncome: analysisData.avgMonthlyIncome,
      avgMonthlyExpense: analysisData.avgMonthlyExpense,
      avgMonthlyEssentialExpense: analysisData.avgMonthlyExpense * essentialRatio,
      avgMonthlyDebt: analysisData.avgMonthlyDebt,
      cumulativeNetSavings: analysisData.cumulativeNetSavings,
      netInvestments: analysisData.totalInvestmentInflow - analysisData.totalInvestmentOutflow,
      totalDebtOutstanding: analysisData.avgMonthlyDebt * totalMonths,
      balances: analysisData.balances,
    }).compositeScore
  }, [analysisData])

  if (isLoading) return <LoadingSkeleton />
  if (isError) {
    const retryHealth = () => {
      if (!propTransactions) void transactionsQuery.refetch()
      void preferencesQuery.refetch()
      void balancesQuery.refetch()
      void classificationsQuery.refetch()
    }
    return (
      <ErrorState
        title="Financial health unavailable"
        message="We could not load every balance and preference needed for an accurate score."
        onRetry={retryHealth}
        errorType="network"
        variant="card"
      />
    )
  }
  if (!analysisData) return <EmptyState />

  const metrics = calculateMetrics(analysisData, savingsGoalPercent)
  if (metrics.length === 0) return <EmptyState />

  const overallScore = metrics.reduce((sum, m) => sum + (m.score * m.weight) / 100, 0)
  const fhnStatus = getOverallStatus(overallScore)
  const cfpStatus = getOverallStatus(cfpCompositeScore)

  const fhnRadarData = metrics.map((m) => ({
    dimension: METRIC_SHORT_LABELS[m.name] ?? m.name,
    score: m.score,
    fullMark: 100,
  }))

  return (
    <details className="group ledger-panel overflow-hidden">
      <summary className="ledger-control flex min-h-12 cursor-pointer list-none items-center gap-3 border-0 px-4 py-3 sm:px-5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-app-blue/10">
          <Shield className="size-4 text-app-blue" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">Financial health details</span>
          <span className="block text-xs text-muted-foreground">
            Score breakdowns and planning ratios for the last {analysisData.monthsAnalyzed} months
          </span>
        </span>
        <span className="hidden items-center gap-2 sm:flex">
          <span className={`ledger-figure text-sm font-semibold ${fhnStatus.color}`}>
            FinHealth {Math.round(overallScore)}
          </span>
          <span className={`ledger-figure text-sm font-semibold ${cfpStatus.color}`}>
            CFP {Math.round(cfpCompositeScore)}
          </span>
        </span>
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="grid grid-cols-1 gap-6 border-t border-[var(--hairline-1)] p-4 sm:p-5 lg:grid-cols-2">
        <section className="min-w-0 lg:border-r lg:border-[var(--hairline-1)] lg:pr-6">
          <ScoreHeader
            title="FinHealth Score"
            score={overallScore}
            subtitle={`Last ${analysisData.monthsAnalyzed} months`}
            color={fhnStatus.color}
          />
          <RadarVisualization metrics={fhnRadarData} chartColor={rawColors.app.blue} />
          <p className="text-[11px] text-center text-muted-foreground mb-3">{getSummary(overallScore)}</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {metrics.map((m) => <HealthMetricCard key={m.name} metric={m} />)}
          </div>
          <p className="text-[10px] text-center text-muted-foreground/50 mt-3">Financial Health Network framework</p>
        </section>

        <section className="min-w-0">
          <ScoreHeader
            title="CFP Ratios"
            score={cfpCompositeScore}
            subtitle={`Last ${analysisData.monthsAnalyzed} months`}
            color={cfpStatus.color}
          />
          <CFPScoreView analysisData={analysisData} />
        </section>
      </div>
    </details>
  )
}
