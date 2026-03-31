import { motion } from 'framer-motion'
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Tooltip,
} from 'recharts'
import {
  Shield,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Info,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { memo, useMemo, useState } from 'react'
import { useTransactions } from '@/hooks/api/useTransactions'
import { usePreferences } from '@/hooks/api/usePreferences'
import { useInvestmentAccountStore } from '@/store/investmentAccountStore'
import { ChartContainer, chartTooltipProps } from '@/components/ui'
import type { Transaction } from '@/types'
import {
  type FinHealthTier,
  type Pillar,
  type HealthMetric,
  PILLAR_META,
  PILLAR_ORDER,
  tierFromScore,
  computeMonthlyData,
  computeAnalysis,
  calculateMetrics,
  getOverallStatus,
  getSummary,
  getTierColor,
  getPillarScore,
} from './health/healthScoreUtils'
import CFPScoreView from './health/CFPScoreView'

// ─── JSX UI Helpers (kept here because they return React elements) ──────────

function getTierIcon(tier: FinHealthTier) {
  switch (tier) {
    case 'healthy': return <CheckCircle className="w-4 h-4 text-ios-green" />
    case 'coping': return <Info className="w-4 h-4 text-ios-orange" />
    case 'vulnerable': return <AlertTriangle className="w-4 h-4 text-ios-red" />
  }
}

function getPillarTrendIcon(score: number) {
  if (score >= 70) return <TrendingUp className="w-3.5 h-3.5 text-ios-green" />
  if (score >= 40) return <Info className="w-3.5 h-3.5 text-ios-orange" />
  return <TrendingDown className="w-3.5 h-3.5 text-ios-red" />
}

// ─── Sub-component Props Interfaces ─────────────────────────────────────────

interface ScoreHeaderProps {
  readonly status: ReturnType<typeof getOverallStatus>
  readonly monthsAnalyzed: number
  readonly overallScore: number
}

interface RadarVisualizationProps {
  readonly metrics: HealthMetric[]
}

interface PillarHeaderProps {
  readonly pillar: Pillar
  readonly score: number
  readonly metrics: HealthMetric[]
}

interface MetricRowProps {
  readonly metric: HealthMetric
  readonly showDetails: boolean
}

interface DetailsToggleProps {
  readonly showDetails: boolean
  readonly onToggle: () => void
}

// ─── Sub-components (module-scope, React.memo) ──────────────────────────────

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
      <h3 className="text-lg font-semibold mb-2">Financial Health Score</h3>
      <p className="text-muted-foreground">Need more transaction data to calculate health score.</p>
    </div>
  )
})

const ScoreHeader = memo(function ScoreHeader({
  status,
  monthsAnalyzed,
  overallScore,
}: ScoreHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        <div className={`p-3 rounded-xl ${status.bgColor}/20`}>
          <Shield className={`w-6 h-6 ${status.color}`} />
        </div>
        <div>
          <h3 className="text-lg font-semibold">FinHealth Score</h3>
          <p className="text-sm text-muted-foreground">Based on last {monthsAnalyzed} months</p>
        </div>
      </div>
      <div className="text-right">
        <p className={`text-2xl sm:text-3xl font-bold ${status.color}`}>{Math.round(overallScore)}</p>
        <p className={`text-sm font-medium ${status.color}`}>{status.label}</p>
      </div>
    </div>
  )
})

/** Short labels for the radar chart axes */
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

const RadarVisualization = memo(function RadarVisualization({
  metrics,
}: RadarVisualizationProps) {
  const radarData = metrics.map((m) => ({
    dimension: METRIC_SHORT_LABELS[m.name] ?? m.name,
    score: m.score,
    fullMark: 100,
  }))

  return (
    <div className="mb-4">
      <ChartContainer height={300}>
        <RadarChart data={radarData}>
          <PolarGrid
            stroke="rgba(255,255,255,0.06)"
            strokeDasharray="3 3"
          />
          <PolarAngleAxis
            dataKey="dimension"
            tick={{ fill: '#71717a', fontSize: 11 }}
          />
          <PolarRadiusAxis
            angle={30}
            domain={[0, 100]}
            tick={{ fill: '#52525b', fontSize: 9 }}
            axisLine={false}
          />
          <Radar
            name="Health Score"
            dataKey="score"
            stroke="#4a9eff"
            fill="#4a9eff"
            fillOpacity={0.15}
            strokeWidth={2}
            dot={{ r: 4, fill: '#4a9eff', strokeWidth: 0 }}
            animationDuration={800}
            animationEasing="ease-out"
          />
          <Tooltip {...chartTooltipProps} />
        </RadarChart>
      </ChartContainer>
    </div>
  )
})

const PillarHeader = memo(function PillarHeader({
  pillar,
  score,
  metrics,
}: PillarHeaderProps) {
  const meta = PILLAR_META[pillar]
  const Icon = meta.icon
  const tier = tierFromScore(score)
  const pillarMetrics = metrics.filter((m) => m.pillar === pillar)

  if (pillarMetrics.length === 0) return null

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {meta.label}
        </span>
        {getPillarTrendIcon(score)}
      </div>
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${getTierColor(tier)}`} />
        <span className="text-xs text-muted-foreground">{Math.round(score)}/100</span>
      </div>
    </div>
  )
})

const MetricRow = memo(function MetricRow({
  metric,
  showDetails,
}: MetricRowProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          {getTierIcon(metric.status)}
          <span>{metric.name}</span>
        </div>
        <span className="text-muted-foreground">{metric.description}</span>
      </div>
      <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
        <div
          className={`h-full ${getTierColor(metric.status)} rounded-full transition-colors`}
          style={{ width: `${metric.score}%` }}
        />
      </div>
      {showDetails && metric.details && (
        <div className="pl-6 pt-1 text-xs text-muted-foreground space-y-0.5">
          {metric.details.map((detail) => (
            <p key={detail}>{'\u2022'} {detail}</p>
          ))}
        </div>
      )}
    </div>
  )
})

const DetailsToggle = memo(function DetailsToggle({
  showDetails,
  onToggle,
}: DetailsToggleProps) {
  return (
    <button
      onClick={onToggle}
      className="w-full mt-4 pt-4 border-t border-border flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-white transition-colors"
    >
      {showDetails ? (
        <>
          <ChevronUp className="w-4 h-4" />
          Hide Details
        </>
      ) : (
        <>
          <ChevronDown className="w-4 h-4" />
          Show Details
        </>
      )}
    </button>
  )
})

// ─── Main Component ─────────────────────────────────────────────────────────

interface FinancialHealthScoreProps {
  transactions?: Transaction[]
}

export default function FinancialHealthScore({ transactions: propTransactions }: Readonly<FinancialHealthScoreProps>) {
  const { data: fetchedTransactions = [], isLoading: isFetching } = useTransactions()
  const { data: preferences } = usePreferences()
  const transactions = propTransactions ?? fetchedTransactions
  const isLoading = !propTransactions && isFetching
  const [showDetails, setShowDetails] = useState(false)
  const [scoreView, setScoreView] = useState<'fhn' | 'cfp'>('fhn')
  const isInvestmentAccount = useInvestmentAccountStore((state) => state.isInvestmentAccount)

  const savingsGoalPercent = preferences?.savings_goal_percent ?? 20

  // Parse fixed_expense_categories from preferences for more accurate essential classification
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

  const analysisData = useMemo(() => {
    if (!transactions.length) return null
    const result = computeMonthlyData(transactions, isInvestmentAccount, userFixedCategories.size > 0 ? userFixedCategories : undefined)
    if (!result) return null
    return computeAnalysis(result.months, result.monthlyData)
  }, [transactions, isInvestmentAccount, userFixedCategories])

  if (isLoading) return <LoadingSkeleton />
  if (!analysisData) return <EmptyState />

  const metrics = calculateMetrics(analysisData, savingsGoalPercent)
  if (metrics.length === 0) return <EmptyState />

  const overallScore = metrics.reduce((sum, m) => sum + (m.score * m.weight) / 100, 0)
  const status = getOverallStatus(overallScore)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl border border-border p-6 shadow-xl"
    >
      <ScoreHeader
        status={status}
        monthsAnalyzed={analysisData.monthsAnalyzed}
        overallScore={scoreView === 'fhn' ? overallScore : 0}
      />

      {/* View Toggle */}
      <div className="flex gap-1 p-1 rounded-lg bg-muted/20 mb-5">
        <button
          onClick={() => setScoreView('fhn')}
          className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${scoreView === 'fhn' ? 'bg-white/10 text-white' : 'text-muted-foreground hover:text-white'}`}
        >
          FinHealth Score
        </button>
        <button
          onClick={() => setScoreView('cfp')}
          className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${scoreView === 'cfp' ? 'bg-white/10 text-white' : 'text-muted-foreground hover:text-white'}`}
        >
          CFP Ratios
        </button>
      </div>

      {scoreView === 'cfp' ? (
        <CFPScoreView analysisData={analysisData} />
      ) : (
        <>
          <RadarVisualization metrics={metrics} />

          {/* Summary */}
          <p className="text-sm text-center text-muted-foreground mb-6 px-4">
            {getSummary(overallScore)}
          </p>

          {/* Metrics grouped by pillar */}
          <div className="space-y-5">
            {PILLAR_ORDER.map((pillar) => {
              const pillarMetrics = metrics.filter((m) => m.pillar === pillar)
              if (pillarMetrics.length === 0) return null
              const pillarScore = getPillarScore(metrics, pillar)

              return (
                <div key={pillar} className="space-y-2">
                  <PillarHeader pillar={pillar} score={pillarScore} metrics={metrics} />
                  {pillarMetrics.map((metric) => (
                    <MetricRow key={metric.name} metric={metric} showDetails={showDetails} />
                  ))}
                </div>
              )
            })}
          </div>

          <DetailsToggle showDetails={showDetails} onToggle={() => setShowDetails(!showDetails)} />

          {/* Attribution */}
          <p className="text-caption text-center text-muted-foreground/50 mt-3">
            Based on Financial Health Network's FinHealth Score framework
          </p>
        </>
      )}
    </motion.div>
  )
}
