import { InstrumentProjections } from '@/components/analytics'
import { PageContainer, PageHeader } from '@/components/ui'

import { ChartStatsFooter } from './components/ChartStatsFooter'
import { GrowthChart } from './components/GrowthChart'
import { OverviewCards } from './components/OverviewCards'
import { ProjectionParameters } from './components/ProjectionParameters'
import { ProjectionResults } from './components/ProjectionResults'
import { ReturnsAnalysisSection } from './components/ReturnsAnalysisSection'
import { useMutualFundProjection } from './useMutualFundProjection'

export default function MutualFundProjectionPage() {
  const m = useMutualFundProjection()

  return (
    <PageContainer className="md:space-y-6">
      <PageHeader
        title="Projections"
        subtitle="SIP returns and instrument maturity projections"
      />

      <OverviewCards
        isLoading={m.isLoading}
        currentBalance={m.currentBalance}
        primaryAccountName={m.primaryAccount?.name ?? null}
        detectedMonthlySIP={m.detectedMonthlySIP}
        transactionCount={m.sipTransfers.length}
        totalHistoricalInvested={m.totalHistoricalInvested}
        realizedGains={m.realizedGains}
        realizedGainsPercent={m.realizedGainsPercent}
        gainsBgClass={m.gainsBgClass}
        gainsIconClass={m.gainsIconClass}
        gainsTextClass={m.gainsTextClass}
        gainsSignPrefix={m.gainsSignPrefix}
      />

      <ProjectionParameters
        sipInputValue={m.sipInputValue}
        expectedReturn={m.expectedReturn}
        projectionYears={m.projectionYears}
        sipGrowthRate={m.sipGrowthRate}
        showAutoDetectedHint={m.showAutoDetectedHint}
        sipGrowthLabel={m.sipGrowthLabel}
        onMonthlySIPChange={m.setMonthlySIP}
        onUserModifiedSIP={() => m.setUserModifiedSIP(true)}
        onExpectedReturnChange={m.setExpectedReturn}
        onProjectionYearsChange={m.setProjectionYears}
        onSipGrowthRateChange={m.setSipGrowthRate}
      >
        <ReturnsAnalysisSection
          currentValueInput={m.currentValueInput}
          currentBalance={m.currentBalance}
          onCurrentValueChange={m.setCurrentValueInput}
          overrideGainsPercent={m.overrideGainsPercent}
          overrideGains={m.overrideGains}
          totalHistoricalInvested={m.totalHistoricalInvested}
          xirrPercent={m.xirrPercent}
          investmentDurationYears={m.investmentDurationYears}
          effectiveCurrentValue={m.effectiveCurrentValue}
          currentValueLabel={m.currentValueLabel}
          effectiveValueLabel={m.effectiveValueLabel}
          totalReturnColorClass={m.totalReturnColorClass}
          totalReturnSignPrefix={m.totalReturnSignPrefix}
          xirrColorClass={m.xirrColorClass}
          xirrSignPrefix={m.xirrSignPrefix}
        />
      </ProjectionParameters>

      <ProjectionResults
        invested={m.projection.invested}
        value={m.projection.value}
        returns={m.projection.returns}
        projectionYears={m.projectionYears}
        activeMonthlySIP={m.activeMonthlySIP}
      />

      <GrowthChart
        chartData={m.chartData}
        projectionYears={m.projectionYears}
        onProjectionYearsChange={m.setProjectionYears}
      />

      <ChartStatsFooter
        isLoading={m.isLoading}
        totalHistoricalInvested={m.totalHistoricalInvested}
        currentBalance={m.currentBalance}
        projectedInvested={m.projection.invested}
        projectedValue={m.projection.value}
      />

      <InstrumentProjections />
    </PageContainer>
  )
}
