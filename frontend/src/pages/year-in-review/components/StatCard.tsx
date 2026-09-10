import type { ReactNode } from 'react'

import { motion } from 'motion/react'
import { FADE_UP } from '@/constants/animations'

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
      {...FADE_UP}
      className="min-w-0"
    >
      <div className="mb-2 flex items-center gap-2">
        <Icon className="size-4 shrink-0" style={{ color }} />
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
      </div>
      <p className="break-words font-mono text-2xl font-semibold tracking-tight tabular-nums text-foreground">
        {value}
      </p>
      {footer && <div className="mt-3">{footer}</div>}
    </motion.div>
  )
}
