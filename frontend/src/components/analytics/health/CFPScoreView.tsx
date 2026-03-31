import { memo, useMemo } from 'react'
import { rawColors } from '@/constants/colors'
import { computeCFPScore, type CFPRatio } from '@/lib/financialHealthCalculator'
import type { AnalysisResult } from './healthScoreUtils'

function getStatusColor(status: 'good' | 'warning' | 'poor'): string {
  if (status === 'good') return rawColors.ios.green
  if (status === 'warning') return rawColors.ios.orange
  return rawColors.ios.red
}

function RatioCard({ ratio }: Readonly<{ ratio: CFPRatio }>) {
  const color = getStatusColor(ratio.status)
  return (
    <div className="p-3 rounded-xl border border-border bg-white/[0.02]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-white">{ratio.name}</span>
        <span className="text-sm font-bold" style={{ color }}>{ratio.formattedValue}</span>
      </div>
      <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden mb-2">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${ratio.score}%`, backgroundColor: color }}
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-tertiary">{ratio.description}</span>
        <span className="text-xs text-text-quaternary">Target: {ratio.target}</span>
      </div>
    </div>
  )
}

interface CFPScoreViewProps {
  analysisData: AnalysisResult
}

const CFPScoreView = memo(function CFPScoreView({ analysisData }: Readonly<CFPScoreViewProps>) {
  const { ratios, compositeScore } = useMemo(() => {
    const totalMonths = analysisData.monthsAnalyzed
    const totalIncome = analysisData.avgMonthlyIncome * totalMonths
    const totalExpenses = analysisData.avgMonthlyExpense * totalMonths
    const essentialRatio = analysisData.essentialToIncomeRatio / 100
    const avgMonthlyEssential = analysisData.avgMonthlyExpense * essentialRatio

    return computeCFPScore({
      totalIncome,
      totalExpenses,
      avgMonthlyIncome: analysisData.avgMonthlyIncome,
      avgMonthlyExpense: analysisData.avgMonthlyExpense,
      avgMonthlyEssentialExpense: avgMonthlyEssential,
      avgMonthlyDebt: analysisData.avgMonthlyDebt,
      cumulativeNetSavings: analysisData.cumulativeNetSavings,
      netInvestments: analysisData.totalInvestmentInflow - analysisData.totalInvestmentOutflow,
      totalDebtOutstanding: analysisData.avgMonthlyDebt * totalMonths,
    })
  }, [analysisData])

  const scoreColor = compositeScore >= 60 ? rawColors.ios.green
    : compositeScore >= 40 ? rawColors.ios.orange
    : rawColors.ios.red

  return (
    <div className="space-y-4">
      {/* Composite Score */}
      <div className="flex items-center justify-center gap-4 py-3">
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-bold text-white"
          style={{ backgroundColor: `${scoreColor}20`, boxShadow: `0 4px 24px ${scoreColor}30` }}
        >
          {compositeScore}
        </div>
        <div>
          <p className="text-sm font-medium" style={{ color: scoreColor }}>
            {compositeScore >= 60 ? 'Healthy' : compositeScore >= 40 ? 'Needs Attention' : 'At Risk'}
          </p>
          <p className="text-xs text-text-tertiary">CFP Composite Score (0-100)</p>
          <p className="text-xs text-text-quaternary mt-0.5">Weighted across 6 standard ratios</p>
        </div>
      </div>

      {/* Ratio Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {ratios.map((ratio) => (
          <RatioCard key={ratio.name} ratio={ratio} />
        ))}
      </div>

      <p className="text-caption text-center text-muted-foreground/50">
        Based on CFP Board / FPSB India financial planning standards
      </p>
    </div>
  )
})

export default CFPScoreView
