import { motion } from 'framer-motion'
import { Gauge, Shield, Milestone, GitCompareArrows, FileBarChart, Users, TrendingUp, Zap } from 'lucide-react'
import { PageHeader } from '@/components/ui'
import { staggerContainer, fadeUpItem, SCROLL_FADE_UP } from '@/constants/animations'
import {
  SpendingVelocityGauge,
  IncomeStabilityIndex,
  SavingsMilestonesTimeline,
  CategoryCorrelationAnalysis,
  AccountActivityScore,
  MonthlyFinancialReportCard,
  PeerComparisonBenchmarks,
  LifestyleCreepDetection,
  ExpenseElasticityChart,
} from '@/components/analytics'

function SectionHeader({ icon: Icon, title }: Readonly<{ icon: typeof Gauge; title: string }>) {
  return (
    <div className="flex items-center gap-2 mb-1">
      <Icon className="w-4 h-4 text-muted-foreground" />
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
    </div>
  )
}

export default function InsightsPage() {
  return (
    <motion.div
      className="p-4 md:p-6 lg:p-8 space-y-8"
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
    >
      <motion.div variants={fadeUpItem}>
        <PageHeader
          title="Financial Insights"
          subtitle="Advanced analytics computed from your transaction history"
        />
      </motion.div>
      <motion.div variants={fadeUpItem}>
        <SectionHeader icon={Gauge} title="Spending Velocity" />
        <SpendingVelocityGauge />
      </motion.div>
      <motion.div variants={fadeUpItem}>
        <SectionHeader icon={Shield} title="Income Stability" />
        <IncomeStabilityIndex />
      </motion.div>
      <motion.div {...SCROLL_FADE_UP}>
        <SectionHeader icon={Users} title="How You Compare" />
        <PeerComparisonBenchmarks />
      </motion.div>
      <motion.div {...SCROLL_FADE_UP}>
        <SectionHeader icon={TrendingUp} title="Lifestyle Creep" />
        <LifestyleCreepDetection />
      </motion.div>
      <motion.div {...SCROLL_FADE_UP}>
        <SectionHeader icon={Zap} title="Expense Elasticity" />
        <ExpenseElasticityChart />
      </motion.div>
      <motion.div {...SCROLL_FADE_UP}>
        <SectionHeader icon={Milestone} title="Savings Milestones" />
        <SavingsMilestonesTimeline />
      </motion.div>
      <motion.div {...SCROLL_FADE_UP} className="space-y-1">
        <SectionHeader icon={GitCompareArrows} title="Correlations & Activity" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <CategoryCorrelationAnalysis />
          <AccountActivityScore />
        </div>
      </motion.div>
      <motion.div {...SCROLL_FADE_UP}>
        <SectionHeader icon={FileBarChart} title="Monthly Report" />
        <MonthlyFinancialReportCard />
      </motion.div>
    </motion.div>
  )
}
