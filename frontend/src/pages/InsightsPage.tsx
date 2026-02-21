import { motion } from 'framer-motion'
import { PageHeader } from '@/components/ui'
import { staggerContainer, fadeUpItem, SCROLL_FADE_UP } from '@/constants/animations'
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
    <motion.div
      className="p-4 md:p-6 lg:p-8 space-y-6 md:space-y-8"
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
        <SpendingVelocityGauge />
      </motion.div>
      <motion.div variants={fadeUpItem}>
        <IncomeStabilityIndex />
      </motion.div>
      <motion.div {...SCROLL_FADE_UP}>
        <SavingsMilestonesTimeline />
      </motion.div>
      <motion.div
        className="grid grid-cols-1 lg:grid-cols-2 gap-6"
        {...SCROLL_FADE_UP}
      >
        <CategoryCorrelationAnalysis />
        <AccountActivityScore />
      </motion.div>
      <motion.div {...SCROLL_FADE_UP}>
        <MonthlyFinancialReportCard />
      </motion.div>
    </motion.div>
  )
}
