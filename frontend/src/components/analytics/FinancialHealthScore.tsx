import { motion } from 'framer-motion'
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Tooltip,
} from 'recharts'
import { Shield } from 'lucide-react'
import { memo, useMemo } from 'react'
import { useTransactions } from '@/hooks/api/useTransactions'
import { usePreferences } from '@/hooks/api/usePreferences'
import { useInvestmentAccountStore } from '@/store/investmentAccountStore'
import { ChartContainer, chartTooltipProps } from '@/components/ui'
import { rawColors } from '@/constants/colors'
import type { Transaction } from '@/types'
import type { HealthMetric } from './health/healthScoreUtils'
import {
  computeMonthlyData,
  computeAnalysis,
  calculateMetrics,
  getOverallStatus,
  getSummary,
} from './health/healthScoreUtils'
import CFPScoreView from './health/CFPScoreView'
import { computeCFPScore } from '@/lib/financialHealthCalculator'

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
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <div className={`p-2 rounded-lg ${color === 'text-ios-green' ? 'bg-ios-green/10' : color === 'text-ios-orange' ? 'bg-ios-orange/10' : 'bg-ios-red/10'}`}>
          <Shield className={`w-4 h-4 ${color}`} />
        </div>
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <p className={`text-xl font-bold ${color}`}>{Math.round(score)}</p>
    </div>
  )
}

function RadarVisualization({ metrics, chartColor }: Readonly<{ metrics: Array<{ dimension: string; score: number; fullMark: number }>; chartColor: string }>) {
  return (
    <div className="mb-2">
      <ChartContainer height={200}>
        <RadarChart data={metrics}>
          <PolarGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
          <PolarAngleAxis dataKey="dimension" tick={{ fill: '#71717a', fontSize: 9 }} />
          <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
          <Radar name="Score" dataKey="score" stroke={chartColor} fill={chartColor}
            fillOpacity={0.15} strokeWidth={2} dot={{ r: 2, fill: chartColor, strokeWidth: 0 }}
            animationDuration={800} animationEasing="ease-out" />
          <Tooltip {...chartTooltipProps} />
        </RadarChart>
      </ChartContainer>
    </div>
  )
}

function MetricCard({ metric }: Readonly<{ metric: HealthMetric }>) {
  const color = metric.status === 'healthy' ? rawColors.ios.green
    : metric.status === 'coping' ? rawColors.ios.orange
    : rawColors.ios.red

  return (
    <div className="p-2.5 rounded-lg border border-border bg-white/[0.02]">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-white truncate">{metric.name}</span>
        <span className="text-xs font-bold" style={{ color }}>{Math.round(metric.score)}</span>
      </div>
      <div className="h-1 bg-muted/30 rounded-full overflow-hidden mb-1.5">
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${metric.score}%`, backgroundColor: color }} />
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
  const { data: fetchedTransactions = [], isLoading: isFetching } = useTransactions()
  const { data: preferences } = usePreferences()
  const transactions = propTransactions ?? fetchedTransactions
  const isLoading = !propTransactions && isFetching
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

  const analysisData = useMemo(() => {
    if (!transactions.length) return null
    const result = computeMonthlyData(transactions, isInvestmentAccount, userFixedCategories.size > 0 ? userFixedCategories : undefined)
    if (!result) return null
    return computeAnalysis(result.months, result.monthlyData)
  }, [transactions, isInvestmentAccount, userFixedCategories])

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
    }).compositeScore
  }, [analysisData])

  if (isLoading) return <LoadingSkeleton />
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
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="grid grid-cols-1 lg:grid-cols-2 gap-6"
    >
      {/* FinHealth Score */}
      <div className="glass rounded-2xl border border-border p-5 shadow-xl">
        <ScoreHeader
          title="FinHealth Score"
          score={overallScore}
          subtitle={`Last ${analysisData.monthsAnalyzed} months`}
          color={fhnStatus.color}
        />
        <RadarVisualization metrics={fhnRadarData} chartColor="#4a9eff" />
        <p className="text-[11px] text-center text-muted-foreground mb-3">{getSummary(overallScore)}</p>
        <div className="grid grid-cols-2 gap-2">
          {metrics.map((m) => <MetricCard key={m.name} metric={m} />)}
        </div>
        <p className="text-[10px] text-center text-muted-foreground/50 mt-3">Financial Health Network framework</p>
      </div>

      {/* CFP Ratios */}
      <div className="glass rounded-2xl border border-border p-5 shadow-xl">
        <ScoreHeader
          title="CFP Ratios"
          score={cfpCompositeScore}
          subtitle={`Last ${analysisData.monthsAnalyzed} months`}
          color={cfpStatus.color}
        />
        <CFPScoreView analysisData={analysisData} />
      </div>
    </motion.div>
  )
}
