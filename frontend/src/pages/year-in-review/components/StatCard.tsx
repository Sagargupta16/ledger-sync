import type { ReactNode } from 'react'

import { motion } from 'framer-motion'

export interface StatCardProps {
  label: string
  value: string
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  color: string
  /** Optional slot under the value -- e.g. a target ProgressBar for the savings rate. */
  footer?: ReactNode
}

export default function StatCard({ label, value, icon: Icon, color, footer }: Readonly<StatCardProps>) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass min-w-0 rounded-lg border border-border p-3 sm:p-4 md:p-5 lg:p-6"
    >
      <div className="flex min-w-0 flex-col items-start gap-2 min-[420px]:flex-row min-[420px]:items-center min-[420px]:gap-3">
        <div className="shrink-0 rounded-lg p-2 sm:rounded-xl sm:p-2.5" style={{ backgroundColor: `${color}22` }}>
          <Icon className="size-4 sm:size-5" style={{ color }} />
        </div>
        <div className="min-w-0">
          <p className="text-kpi-label text-muted-foreground">{label}</p>
          <p className="ledger-figure text-base font-bold sm:text-lg lg:text-kpi-value" style={{ color }}>
            {value}
          </p>
        </div>
      </div>
      {footer && <div className="mt-3">{footer}</div>}
    </motion.div>
  )
}
