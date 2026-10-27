import { memo, useMemo } from 'react'

import { motion } from 'motion/react'
import { ChevronDown, Shield } from 'lucide-react'

import StandardRadarChart from '@/components/analytics/StandardRadarChart'
import { colors, rawColors } from '@/constants/colors'
import { useAnimatedInteger } from '@/hooks/useAnimatedValue'
import { useIsMobile } from '@/hooks/useIsMobile'
import type { Transaction } from '@/types'
import { computeCFPScore } from '@/lib/financialHealthCalculator'
import ErrorState from '@/components/shared/ErrorState'
import { PanelSkeleton } from '@/components/shared/LoadingSkeleton'
import { analysisPeriodLabel, type EarningStart } from '@/lib/finance/analysisPeriod'

import type { HealthMetric } from './health/healthScoreUtils'
import {
  cfpInputsFromAnalysis,
  calculateMetrics,
  getOverallStatus,
  getSummary,
} from './health/healthScoreUtils'
import CFPScoreView from './health/CFPScoreView'
import HealthIndicator from './health/HealthIndicator'
import { useLedgerHealth, useServerHealth, type HealthSource } from './useFinancialHealthSource'

// ─── Sub-components ────────────────────────────────────────────────────────

const HealthScoreEmpty = memo(function HealthScoreEmpty() {
  return (
    <div className="ledger-panel p-4 sm:p-5">
      <h3 className="mb-2 text-base font-semibold">Financial Health</h3>
      <p className="text-muted-foreground">Current health needs 3 completed months in the earnings window and 10 recorded transactions.</p>
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
  // Frames go into the motion.span text, so the header renders once per score.
  const animatedScore = useAnimatedInteger(score)
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{subtitle}</p>
        <p className={`mt-1 text-xs font-medium ${color}`}>{status}</p>
      </div>
      <p className={`ledger-figure font-mono text-3xl font-semibold leading-none tabular-nums ${color}`}>
        <motion.span>{animatedScore}</motion.span>
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
        height={isMobile ? 200 : 224}
        showRadiusTicks
        ariaLabel={`Radar chart of the FinHealth score in each of ${metrics.length} dimensions, each out of 100`}
      />
    </div>
  )
}

const EARNING_START_LABELS: Record<EarningStart['source'], string> = {
  saved: 'Saved employment start',
  inferred: 'Inferred employment start',
  unknown: 'Employment start unconfirmed',
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
  /**
   * Analyse this ledger in the browser. Without it -- the Dashboard -- the
   * analysis comes from `/api/dashboard-metrics/health`, so the page never
   * downloads the whole ledger.
   */
  transactions?: Transaction[]
}

export default function FinancialHealthScore({ transactions }: Readonly<FinancialHealthScoreProps>) {
  return transactions ? <LedgerHealthScore transactions={transactions} /> : <ServerHealthScore />
}

function ServerHealthScore() {
  return <HealthScorePanel source={useServerHealth()} />
}

function LedgerHealthScore({ transactions }: Readonly<{ transactions: Transaction[] }>) {
  return <HealthScorePanel source={useLedgerHealth(transactions)} />
}

function HealthScorePanel({ source }: Readonly<{ source: HealthSource }>) {
  const { currentHealth, savingsGoalPercent, isLoading, isError, retry } = source
  const analysisData = currentHealth?.analysis

  const cfpCompositeScore = useMemo(() => {
    if (!analysisData) return 0
    return computeCFPScore(cfpInputsFromAnalysis(analysisData)).compositeScore
  }, [analysisData])

  if (isLoading) return <PanelSkeleton />
  if (isError) {
    return (
      <ErrorState
        title="Financial health unavailable"
        message="We could not load every balance and preference needed for an accurate score."
        onRetry={retry}
        errorType="network"
        variant="card"
      />
    )
  }
  if (!currentHealth) return <HealthScoreEmpty />
  const { analysis, period, earningStart } = currentHealth

  const metrics = calculateMetrics(analysis, savingsGoalPercent)
  if (metrics.length === 0) return <HealthScoreEmpty />

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
            Current health · trailing 24 completed months, bounded by employment start
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
      <div className="border-t border-[var(--hairline-1)] px-4 py-3 text-xs leading-5 text-muted-foreground sm:px-5">
        <p>Cashflow: {analysisPeriodLabel(period)}</p>
        <p>
          {EARNING_START_LABELS[earningStart.source]}
          {earningStart.date ? `: ${earningStart.date}. ` : '. '}
          Zero-income months after employment are included.
        </p>
        <p>{analysis.balances ? 'Lifetime balances from all recorded accounts' : 'Lifetime balances estimated from all recorded flows'}; expenses and income use the recent window. Income stability uses its last 12 months.</p>
        <p>Both scores are computation aids from your recorded data, not financial advice.</p>
      </div>
      <div className="grid grid-cols-1 gap-6 border-t border-[var(--hairline-1)] p-4 sm:p-5 lg:grid-cols-2">
        <section className="@container/finhealth min-w-0 lg:border-r lg:border-[var(--hairline-1)] lg:pr-6">
          <ScoreHeader
            title="FinHealth Score"
            score={overallScore}
            subtitle="Recent cashflow · lifetime assets"
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
            subtitle="Recent cashflow · lifetime assets"
            status={cfpStatus.label}
            color={cfpStatus.color}
          />
          <CFPScoreView analysisData={analysis} />
        </section>
      </div>
    </details>
  )
}
