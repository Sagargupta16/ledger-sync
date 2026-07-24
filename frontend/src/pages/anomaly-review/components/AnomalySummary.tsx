import { AlertCircle, AlertTriangle, Info } from 'lucide-react'
import { motion } from 'framer-motion'

import { StatCard } from '@/components/ui'
import { fadeUpItem, staggerContainer } from '@/constants/animations'

import { SEVERITY_STYLES } from '../constants'
import type { AnomalySummaryCounts } from '../types'

interface Props {
  summary: AnomalySummaryCounts
}

export default function AnomalySummary({ summary }: Readonly<Props>) {
  const total = summary.high + summary.medium + summary.low

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
            value={String(summary.high)}
            icon={<AlertTriangle className="w-5 h-5" />}
            iconColor={SEVERITY_STYLES.high.iconColor}
          />
        </motion.div>
        <motion.div variants={fadeUpItem}>
          <StatCard
            title="Medium Severity"
            value={String(summary.medium)}
            icon={<AlertCircle className="w-5 h-5" />}
            iconColor={SEVERITY_STYLES.medium.iconColor}
          />
        </motion.div>
        <motion.div variants={fadeUpItem}>
          <StatCard
            title="Low Severity"
            value={String(summary.low)}
            icon={<Info className="w-5 h-5" />}
            iconColor={SEVERITY_STYLES.low.iconColor}
          />
        </motion.div>
      </motion.div>

      {total > 0 && (
        <div
          className="flex h-1.5 w-full overflow-hidden rounded-full"
          role="img"
          aria-label={`Severity mix: ${summary.high} high, ${summary.medium} medium, ${summary.low} low`}
        >
          {(
            [
              ['high', summary.high],
              ['medium', summary.medium],
              ['low', summary.low],
            ] as const
          ).map(([severity, count]) => (
            <div
              key={severity}
              style={{
                width: `${(count / total) * 100}%`,
                backgroundColor: SEVERITY_STYLES[severity].iconColor,
              }}
            />
          ))}
        </div>
      )}
    </>
  )
}
