import { motion } from 'motion/react'

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
      className="ledger-panel min-w-0 p-4 sm:p-6"
    >
      <p className="ledger-meta mb-2 text-app-blue">Your weekly rhythm</p>
      <h2 className="text-xl font-semibold tracking-tight">Spending by Day of Week</h2>
      <p className="mb-5 mt-1 text-sm text-muted-foreground">Average daily spending and income, Sunday through Saturday.</p>
      <DayOfWeekChart grid={grid} />
    </motion.section>
  )
}
