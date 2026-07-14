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
      className="glass rounded-lg border border-border p-6"
    >
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl" style={{ backgroundColor: `${color}22` }}>
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        <div>
          <p className="text-kpi-label text-muted-foreground">{label}</p>
          <p className="text-kpi-value font-bold" style={{ color }}>{value}</p>
        </div>
      </div>
      {footer && <div className="mt-3">{footer}</div>}
    </motion.div>
  )
}
