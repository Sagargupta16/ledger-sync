import { motion } from 'framer-motion'
import { Shield, Milestone, TrendingUp } from 'lucide-react'
import { PageHeader } from '@/components/ui'
import { staggerContainer, fadeUpItem, SCROLL_FADE_UP } from '@/constants/animations'
import {
  IncomeStabilityIndex,
  SavingsMilestonesTimeline,
  LifestyleCreepDetection,
} from '@/components/analytics'

// Three focused widgets that each drive a specific decision:
//   - IncomeStabilityIndex  -> "how predictable is my cash flow?"
//   - LifestyleCreepDetection -> "is my spending quietly growing faster than income?"
//   - SavingsMilestonesTimeline -> "what big milestones have I hit / am I nearing?"
// Retired in the 2.7.1 cleanup: SpendingVelocityGauge (gauges are wrong for
// continuous metrics), PeerComparisonBenchmarks (static / invented peer data),
// CategoryCorrelationAnalysis (correlations with no actionable next step),
// AccountActivityScore (paired with the correlation widget - niche),
// ExpenseElasticityChart (duplicated the lifestyle-creep signal with less
// clarity), and MonthlyFinancialReportCard (duplicated Year-in-Review).

function SectionHeader({ icon: Icon, title }: Readonly<{ icon: typeof Shield; title: string }>) {
  return (
    <div className="flex items-center gap-2 mb-1">
      <Icon className="w-4 h-4 text-muted-foreground" />
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
    </div>
  )
}

export default function InsightsPage() {
  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6 md:space-y-8">
        <PageHeader
          title="Financial Insights"
          subtitle="Pattern detection across your transaction history"
        />
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="space-y-6 md:space-y-8"
        >
          <motion.div variants={fadeUpItem}>
            <SectionHeader icon={Shield} title="Income Stability" />
            <IncomeStabilityIndex />
          </motion.div>

          <motion.div {...SCROLL_FADE_UP}>
            <SectionHeader icon={TrendingUp} title="Lifestyle Creep" />
            <LifestyleCreepDetection />
          </motion.div>

          <motion.div {...SCROLL_FADE_UP}>
            <SectionHeader icon={Milestone} title="Savings Milestones" />
            <SavingsMilestonesTimeline />
          </motion.div>
        </motion.div>
      </div>
    </div>
  )
}
