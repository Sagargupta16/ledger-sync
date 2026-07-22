import { memo, useMemo } from 'react'
import { motion } from 'framer-motion'
import { rawColors } from '@/constants/colors'
import { fadeUpItem, staggerContainer } from '@/constants/animations'
import StandardRadarChart from '@/components/analytics/StandardRadarChart'
import { computeCFPScore, type CFPRatio } from '@/lib/financialHealthCalculator'
import type { AnalysisResult } from './healthScoreUtils'

function getStatusColor(status: 'good' | 'warning' | 'poor'): string {
  if (status === 'good') return rawColors.app.green
  if (status === 'warning') return rawColors.app.orange
  return rawColors.app.red
}

function RatioCard({ ratio }: Readonly<{ ratio: CFPRatio }>) {
  const color = getStatusColor(ratio.status)
  return (
    <motion.div
      variants={fadeUpItem}
      whileHover={{ y: -2 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className="p-3 rounded-xl border border-border bg-[var(--overlay-1)]"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-foreground">{ratio.name}</span>
        <span className="text-sm font-bold tabular-nums" style={{ color }}>{ratio.formattedValue}</span>
      </div>
      <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden mb-2">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${ratio.score}%` }}
          transition={{ duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] }}
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-tertiary">{ratio.description}</span>
        <span className="text-xs text-text-quaternary">Target: {ratio.target}</span>
      </div>
    </motion.div>
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
      balances: analysisData.balances,
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
        <StandardRadarChart
          data={radarData}
          dataKey="score"
          categoryKey="dimension"
          color={rawColors.app.teal}
          name="CFP Score"
          height={240}
          showRadiusTicks
          dotRadius={3}
        />
      </div>

      {/* Ratio Cards */}
      <motion.div
        className="grid grid-cols-1 sm:grid-cols-2 gap-3"
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        {ratios.map((ratio) => (
          <RatioCard key={ratio.name} ratio={ratio} />
        ))}
      </motion.div>

      <p className="text-[10px] text-center text-muted-foreground/50">
        Based on CFP Board / FPSB India financial planning standards
      </p>
    </div>
  )
})

export default CFPScoreView
