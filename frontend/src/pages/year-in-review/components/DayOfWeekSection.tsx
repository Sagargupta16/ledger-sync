import { motion } from 'framer-motion'

import type { DayCell } from './DayOfWeekChart'
import DayOfWeekChart from './DayOfWeekChart'

interface DayOfWeekSectionProps {
  readonly grid: DayCell[]
}

export default function DayOfWeekSection({
  grid,
}: DayOfWeekSectionProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="glass rounded-2xl border border-border p-4 sm:p-6"
    >
      <h2 className="mb-4 text-lg font-semibold">Spending by Day of Week</h2>
      <DayOfWeekChart grid={grid} />
    </motion.section>
  )
}
