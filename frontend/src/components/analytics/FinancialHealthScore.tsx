import { memo, useMemo } from 'react'

import { ChevronDown, Shield } from 'lucide-react'

import { useTransactions } from '@/hooks/api/useTransactions'
import { usePreferences } from '@/hooks/api/usePreferences'
import { useAccountBalances } from '@/hooks/api/useAnalytics'
import { useInvestmentAccountStore } from '@/store/investmentAccountStore'
import { useAccountClassifications } from '@/hooks/api/useAccountClassifications'
import StandardRadarChart from '@/components/analytics/StandardRadarChart'
import { colors, rawColors } from '@/constants/colors'
import { useCountUp } from '@/hooks/useCountUp'
import { useIsMobile } from '@/hooks/useIsMobile'
import type { Transaction } from '@/types'
import { resolveAccountCategory } from '@/pages/net-worth/netWorthUtils'
import { computeCFPScore } from '@/lib/financialHealthCalculator'
import ErrorState from '@/components/shared/ErrorState'

import type { HealthMetric } from './health/healthScoreUtils'
import {
  cfpInputsFromAnalysis,
  computeMonthlyData,
  computeAnalysis,
  calculateMetrics,
  getOverallStatus,
  getSummary,
} from './health/healthScoreUtils'
import { computeBalancePosition } from './health/healthScoreBalances'
import CFPScoreView from './health/CFPScoreView'
import HealthIndicator from './health/HealthIndicator'

// ─── Sub-components ────────────────────────────────────────────────────────

const LoadingSkeleton = memo(function LoadingSkeleton() {
  return (
    <div className="ledger-panel animate-pulse p-4 sm:p-5">
      <div className="mb-4 h-8 w-1/3 rounded bg-muted" />
      <div className="h-32 rounded bg-muted" />
    </div>
  )
})

const EmptyState = memo(function EmptyState() {
  return (
    <div className="ledger-panel p-4 sm:p-5">
      <h3 className="mb-2 text-base font-semibold">Financial Health</h3>
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

function ScoreHeader({ title, score, subtitle, status, color }: Readonly<{
  title: string
  score: number
  subtitle: string
  status: string
  color: string
}>) {
  const animatedScore = useCountUp(score)
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{subtitle}</p>
        <p className={`mt-1 text-xs font-medium ${color}`}>{status}</p>
      </div>
      <p className={`ledger-figure font-mono text-3xl font-semibold leading-none tabular-nums ${color}`}>
        {Math.round(animatedScore)}
        <span className="ml-1 text-xs font-normal text-text-tertiary">/100</span>
      </p>
    </div>
  )
}

function RadarVisualization({ metrics, chartColor }: Readonly<{ metrics: Array<{ dimension: string; score: number; fullMark: number }>; chartColor: string }>) {
  const isMobile = useIsMobile()
  return (
    <div className="-mx-2 my-3 sm:mx-0">
      <StandardRadarChart
        data={metrics}
        dataKey="score"
        categoryKey="dimension"
        color={chartColor}
        name="Score"
        labelFontSize={isMobile ? 10 : 11}
        height={isMobile ? 200 : 224}
        showRadiusTicks
      />
    </div>
  )
}

const TIER_COLORS: Record<string, string> = {
  healthy: colors.app.green,
  coping: colors.app.orange,
  vulnerable: colors.app.red,
}

function HealthMetricCard({ metric }: Readonly<{ metric: HealthMetric }>) {
  const color = TIER_COLORS[metric.status] ?? colors.app.red

  return (
    <HealthIndicator
      name={metric.name}
      score={metric.score}
      description={metric.description}
      target={metric.target}
      color={color}
    />
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
        // JSON.parse is typed `any`; keep it at `unknown` and narrow.
        const parsed: unknown = JSON.parse(raw)
        arr = Array.isArray(parsed) ? (parsed as string[]) : []
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
    return computeCFPScore(cfpInputsFromAnalysis(analysisData)).compositeScore
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
    <details open className="group/health ledger-panel overflow-hidden">
      <summary className="flex min-h-16 cursor-pointer list-none flex-wrap items-center gap-3 px-4 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] sm:px-5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-app-blue/10">
          <Shield className="size-4 text-app-blue" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1 basis-40">
          <span className="ledger-meta block text-text-secondary">Financial health</span>
          <span className="mt-1 block text-xs leading-5 text-muted-foreground">
            Score breakdowns and planning ratios for the last {analysisData.monthsAnalyzed} months
          </span>
        </span>
        <span className="order-last flex w-full flex-wrap items-center gap-x-4 gap-y-2 group-open/health:hidden sm:order-none sm:w-auto">
          <span className={`ledger-figure font-mono text-xs font-semibold tabular-nums ${fhnStatus.color}`}>
            FinHealth {Math.round(overallScore)}<span className="font-normal text-text-tertiary">/100</span>
          </span>
          <span className={`ledger-figure font-mono text-xs font-semibold tabular-nums ${cfpStatus.color}`}>
            CFP {Math.round(cfpCompositeScore)}<span className="font-normal text-text-tertiary">/100</span>
          </span>
        </span>
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-open/health:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="grid grid-cols-1 gap-6 border-t border-[var(--hairline-1)] p-4 sm:p-5 lg:grid-cols-2">
        <section className="@container/finhealth min-w-0 lg:border-r lg:border-[var(--hairline-1)] lg:pr-6">
          <ScoreHeader
            title="FinHealth Score"
            score={overallScore}
            subtitle={`Last ${analysisData.monthsAnalyzed} months`}
            status={fhnStatus.label}
            color={fhnStatus.color}
          />
          <RadarVisualization metrics={fhnRadarData} chartColor={rawColors.app.blue} />
          <p className="mb-4 min-h-10 text-pretty text-xs leading-5 text-muted-foreground">{getSummary(overallScore)}</p>
          <div className="grid grid-cols-1 gap-x-5 @min-[23rem]/finhealth:grid-cols-2">
            {metrics.map((m) => <HealthMetricCard key={m.name} metric={m} />)}
          </div>
          <p className="mt-3 text-[11px] leading-5 text-text-tertiary">Financial Health Network framework</p>
        </section>

        <section className="min-w-0">
          <ScoreHeader
            title="CFP Ratios"
            score={cfpCompositeScore}
            subtitle={`Last ${analysisData.monthsAnalyzed} months`}
            status={cfpStatus.label}
            color={cfpStatus.color}
          />
          <CFPScoreView analysisData={analysisData} />
        </section>
      </div>
    </details>
  )
}
