import { memo, useMemo } from 'react'
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Tooltip,
} from 'recharts'
import { rawColors } from '@/constants/colors'
import { ChartContainer, chartTooltipProps } from '@/components/ui'
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
  const { ratios } = useMemo(() => {
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

  const radarData = ratios.map((r) => ({
    dimension: r.name.replace(' Ratio', '').replace(' Rate', ''),
    score: r.score,
    fullMark: 100,
  }))

  return (
    <div className="space-y-4">
      {/* Radar chart */}
      <div className="mb-2">
        <ChartContainer height={240}>
          <RadarChart data={radarData}>
            <PolarGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
            <PolarAngleAxis dataKey="dimension" tick={{ fill: '#71717a', fontSize: 10 }} />
            <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#52525b', fontSize: 9 }} axisLine={false} />
            <Radar name="CFP Score" dataKey="score" stroke={rawColors.ios.teal} fill={rawColors.ios.teal}
              fillOpacity={0.15} strokeWidth={2} dot={{ r: 3, fill: rawColors.ios.teal, strokeWidth: 0 }}
              animationDuration={800} animationEasing="ease-out" />
            <Tooltip {...chartTooltipProps} />
          </RadarChart>
        </ChartContainer>
      </div>

      {/* Ratio Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {ratios.map((ratio) => (
          <RatioCard key={ratio.name} ratio={ratio} />
        ))}
      </div>

      <p className="text-[10px] text-center text-muted-foreground/50">
        Based on CFP Board / FPSB India financial planning standards
      </p>
    </div>
  )
})

export default CFPScoreView
