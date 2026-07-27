import { AlertCircle, AlertTriangle, ListFilter } from 'lucide-react'
import { motion } from 'motion/react'

import { StatCard } from '@/components/ui'
import { fadeUpItem, staggerContainer } from '@/constants/animations'
import { rawColors } from '@/constants/colors'

import { SEVERITY_STYLES } from '../constants'
import type { AnomalySummaryCounts } from '../types'

interface Props {
  summary: AnomalySummaryCounts
}

export default function AnomalySummary({ summary }: Readonly<Props>) {
  const { high, medium, total } = summary
  // Rows the backend graded as something other than high/medium. Zero today, but
  // the severity column is free text, so folding them into the bar keeps the
  // segment widths honest instead of leaving a gap that reads as missing data.
  const other = Math.max(0, total - high - medium)

  return (
    <>
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-5"
      >
        <motion.div variants={fadeUpItem}>
          <StatCard
            title="High Severity"
            value={String(high)}
            icon={<AlertTriangle className="w-5 h-5" />}
            iconColor={SEVERITY_STYLES.high.iconColor}
          />
        </motion.div>
        <motion.div variants={fadeUpItem}>
          <StatCard
            title="Medium Severity"
            value={String(medium)}
            icon={<AlertCircle className="w-5 h-5" />}
            iconColor={SEVERITY_STYLES.medium.iconColor}
          />
        </motion.div>
        {/* Replaces the old "Low Severity" tile, which was structurally pinned to
            zero -- no detector writes that grade. Total is the number the user can
            act on: it says how much is in the list they are looking at. */}
        <motion.div variants={fadeUpItem}>
          <StatCard
            title="Total Detected"
            value={String(total)}
            icon={<ListFilter className="w-5 h-5" />}
            iconColor={rawColors.chart.neutral}
          />
        </motion.div>
      </motion.div>

      {total > 0 && (
        <div
          className="flex h-1.5 w-full overflow-hidden rounded-full"
          role="img"
          aria-label={`Severity mix: ${high} high, ${medium} medium out of ${total} detected`}
        >
          {(
            [
              ['high', high, SEVERITY_STYLES.high.iconColor],
              ['medium', medium, SEVERITY_STYLES.medium.iconColor],
              ['other', other, rawColors.chart.neutral],
            ] as const
          ).map(([severity, count, fill]) => (
            <div
              key={severity}
              style={{ width: `${(count / total) * 100}%`, backgroundColor: fill }}
            />
          ))}
        </div>
      )}
    </>
  )
}
