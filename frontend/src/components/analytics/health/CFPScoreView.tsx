import { memo, useMemo } from 'react'
import { colors, rawColors } from '@/constants/colors'
import StandardRadarChart from '@/components/analytics/StandardRadarChart'
import { computeCFPScore, type CFPRatio } from '@/lib/financialHealthCalculator'
import { useIsMobile } from '@/hooks/useIsMobile'
import { cfpInputsFromAnalysis } from './healthScoreAnalysis'
import type { AnalysisResult } from './healthScoreUtils'
import HealthIndicator from './HealthIndicator'

function getStatusColor(status: 'good' | 'warning' | 'poor'): string {
  if (status === 'good') return colors.app.green
  if (status === 'warning') return colors.app.orange
  return colors.app.red
}

function RatioCard({ ratio }: Readonly<{ ratio: CFPRatio }>) {
  const color = getStatusColor(ratio.status)
  return (
    <HealthIndicator
      name={ratio.name}
      score={ratio.score}
      value={ratio.formattedValue}
      description={ratio.description}
      target={ratio.target}
      color={color}
    />
  )
}

interface CFPScoreViewProps {
  analysisData: AnalysisResult
}

const CFPScoreView = memo(function CFPScoreView({ analysisData }: Readonly<CFPScoreViewProps>) {
  const isMobile = useIsMobile()
  // One mapping, shared with the composite-score call site, so the CFP savings
  // rate is the analysis' pooled rate rather than a rate rebuilt from averages.
  const { ratios } = useMemo(
    () => computeCFPScore(cfpInputsFromAnalysis(analysisData)),
    [analysisData],
  )

  const radarData = ratios.map((r) => ({
    dimension: r.name.replace(' Ratio', '').replace(' Rate', ''),
    score: r.score,
    fullMark: 100,
  }))

  return (
    <div className="@container/cfp">
      {/* Radar chart */}
      <div className="-mx-2 mb-3 sm:mx-0">
        <StandardRadarChart
          data={radarData}
          dataKey="score"
          categoryKey="dimension"
          color={rawColors.app.teal}
          name="CFP Score"
          height={isMobile ? 200 : 224}
          labelFontSize={isMobile ? 10 : 11}
          showRadiusTicks
          dotRadius={3}
        />
      </div>

      <p className="mb-4 min-h-10 text-pretty text-xs leading-5 text-muted-foreground">
        Each bar shows a score out of 100. The current ratio and its target are listed below.
      </p>

      {/* Ratio Cards */}
      <div className="grid grid-cols-1 gap-x-5 @min-[23rem]/cfp:grid-cols-2">
        {ratios.map((ratio) => (
          <RatioCard key={ratio.name} ratio={ratio} />
        ))}
      </div>

      <p className="mt-3 text-[11px] leading-5 text-text-tertiary">
        Based on CFP Board / FPSB India financial planning standards
      </p>
    </div>
  )
})

export default CFPScoreView
