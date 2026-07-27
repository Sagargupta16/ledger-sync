import { CalendarClock, CalendarRange, Database, FileClock } from 'lucide-react'
import { motion } from 'motion/react'

import MetricCard from '@/components/shared/MetricCard'
import { staggerFast, fadeUpItem } from '@/constants/animations'
import { formatMonthKey } from '@/lib/dateUtils'
import { formatDate, getActiveLocale } from '@/lib/formatters'

import type { CoverageSummary, FreshnessAssessment } from '../types'

interface HealthMetricGridProps {
  readonly freshness: FreshnessAssessment
  readonly coverage: CoverageSummary | null
  readonly transactionCount: number
  readonly lastImportFileName: string | null
}

/** "Apr 22" -- keeps the range readable inside a two-column phone card. */
const SHORT_MONTH: Intl.DateTimeFormatOptions = { month: 'short', year: '2-digit' }

function formatCount(n: number): string {
  return n.toLocaleString(getActiveLocale())
}

function gapLabel(gapDays: number): string {
  if (gapDays === 0) return 'Current'
  return gapDays === 1 ? '1 day' : `${gapDays} days`
}

/**
 * The four numbers that decide whether to trust the rest of the app. Two
 * columns on phones per the mobile-first grid rule, four across from `lg`.
 */
export default function HealthMetricGrid({
  freshness,
  coverage,
  transactionCount,
  lastImportFileName,
}: HealthMetricGridProps) {
  const gapColor = freshness.gapDays === 0 ? 'green' : 'orange'
  const daysSince = freshness.daysSinceImport

  return (
    <motion.div
      variants={staggerFast}
      initial="hidden"
      animate="visible"
      className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4"
    >
      <motion.div variants={fadeUpItem}>
        <MetricCard
          title="Unimported days"
          value={gapLabel(freshness.gapDays)}
          icon={CalendarClock}
          color={gapColor}
          subtitle={
            freshness.latestDate
              ? `Newest row ${formatDate(freshness.latestDate)}`
              : 'No transactions yet'
          }
          titleInfo="Calendar days between your newest transaction and today."
        />
      </motion.div>
      <motion.div variants={fadeUpItem}>
        <MetricCard
          title="Last import"
          value={daysSince === null ? 'Never' : gapLabel(daysSince)}
          icon={FileClock}
          color={daysSince === null ? 'red' : 'blue'}
          subtitle={lastImportFileName ?? 'No file on record'}
          titleInfo="Days since an upload last changed your ledger."
        />
      </motion.div>
      <motion.div variants={fadeUpItem}>
        <MetricCard
          title="Transactions stored"
          value={formatCount(transactionCount)}
          icon={Database}
          color="teal"
          subtitle={coverage ? `${formatCount(coverage.coveredDays)} days covered` : 'Empty ledger'}
        />
      </motion.div>
      <motion.div variants={fadeUpItem}>
        <MetricCard
          title="Date range"
          value={
            coverage
              ? `${formatMonthKey(coverage.earliestDate, SHORT_MONTH)} to ${formatMonthKey(coverage.latestDate, SHORT_MONTH)}`
              : '--'
          }
          icon={CalendarRange}
          color="indigo"
          subtitle={
            coverage
              ? `${formatDate(coverage.earliestDate)} to ${formatDate(coverage.latestDate)}`
              : 'No data'
          }
          titleInfo="First and last month present in the ledger."
        />
      </motion.div>
    </motion.div>
  )
}
