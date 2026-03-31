import { motion } from 'framer-motion'
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Tooltip,
} from 'recharts'
import { Shield } from 'lucide-react'
import { memo, useMemo, useState } from 'react'
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

function RadarVisualization({ metrics }: Readonly<{ metrics: HealthMetric[] }>) {
  const radarData = metrics.map((m) => ({
    dimension: METRIC_SHORT_LABELS[m.name] ?? m.name,
    score: m.score,
    fullMark: 100,
  }))

  return (
    <div className="mb-2">
      <ChartContainer height={240}>
        <RadarChart data={radarData}>
          <PolarGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
          <PolarAngleAxis dataKey="dimension" tick={{ fill: '#71717a', fontSize: 10 }} />
          <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#52525b', fontSize: 9 }} axisLine={false} />
          <Radar name="Health Score" dataKey="score" stroke="#4a9eff" fill="#4a9eff"
            fillOpacity={0.15} strokeWidth={2} dot={{ r: 3, fill: '#4a9eff', strokeWidth: 0 }}
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
    <div className="p-3 rounded-xl border border-border bg-white/[0.02]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-white">{metric.name}</span>
        <span className="text-sm font-bold" style={{ color }}>{Math.round(metric.score)}</span>
      </div>
      <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden mb-2">
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${metric.score}%`, backgroundColor: color }} />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-tertiary">{metric.description}</span>
        <span className="text-xs text-text-quaternary capitalize">{metric.status}</span>
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
  const [scoreView, setScoreView] = useState<'fhn' | 'cfp'>('fhn')
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
  const displayScore = scoreView === 'fhn' ? overallScore : cfpCompositeScore
  const status = getOverallStatus(displayScore)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl border border-border p-6 shadow-xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl ${status.bgColor}/20`}>
            <Shield className={`w-5 h-5 ${status.color}`} />
          </div>
          <div>
            <h3 className="text-base font-semibold">Financial Health</h3>
            <p className="text-xs text-muted-foreground">Last {analysisData.monthsAnalyzed} months</p>
          </div>
        </div>
        <div className="text-right">
          <p className={`text-2xl font-bold ${status.color}`}>{Math.round(displayScore)}</p>
          <p className={`text-xs font-medium ${status.color}`}>{status.label}</p>
        </div>
      </div>

      {/* View Toggle */}
      <div className="flex gap-1 p-1 rounded-lg bg-muted/20 mb-4">
        <button onClick={() => setScoreView('fhn')}
          className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${scoreView === 'fhn' ? 'bg-white/10 text-white' : 'text-muted-foreground hover:text-white'}`}>
          FinHealth Score
        </button>
        <button onClick={() => setScoreView('cfp')}
          className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${scoreView === 'cfp' ? 'bg-white/10 text-white' : 'text-muted-foreground hover:text-white'}`}>
          CFP Ratios
        </button>
      </div>

      {scoreView === 'cfp' ? (
        <CFPScoreView analysisData={analysisData} />
      ) : (
        <div className="space-y-4">
          <RadarVisualization metrics={metrics} />
          <p className="text-xs text-center text-muted-foreground">{getSummary(overallScore)}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {metrics.map((m) => <MetricCard key={m.name} metric={m} />)}
          </div>
          <p className="text-[10px] text-center text-muted-foreground/50">Based on Financial Health Network framework</p>
        </div>
      )}
    </motion.div>
  )
}
