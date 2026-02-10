import { PageHeader } from '@/components/ui'
import {
  SpendingVelocityGauge,
  IncomeStabilityIndex,
  SavingsMilestonesTimeline,
  CategoryCorrelationAnalysis,
  AccountActivityScore,
  MonthlyFinancialReportCard,
} from '@/components/analytics'

export default function InsightsPage() {
  return (
    <div className="p-8 space-y-8">
      <PageHeader
        title="Financial Insights"
        subtitle="Advanced analytics computed from your transaction history"
      />
      <SpendingVelocityGauge />
      <IncomeStabilityIndex />
      <SavingsMilestonesTimeline />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CategoryCorrelationAnalysis />
        <AccountActivityScore />
      </div>
      <MonthlyFinancialReportCard />
    </div>
  )
}
