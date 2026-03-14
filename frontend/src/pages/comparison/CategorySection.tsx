import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { rawColors } from '@/constants/colors'
import type { PeriodSummary, CategoryDelta } from './types'
import { CategoryDeltaRow } from './CategoryDeltaRow'

interface CategorySectionProps {
  icon: ReactNode
  title: string
  deltas: CategoryDelta[]
  periodA: PeriodSummary
  periodB: PeriodSummary
  invertChange?: boolean
  delay: number
}

export function CategorySection({
  icon, title, deltas, periodA, periodB, invertChange, delay,
}: Readonly<CategorySectionProps>) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="glass rounded-2xl border border-border p-6 shadow-xl"
    >
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-lg font-semibold">{title}</h2>
        </div>
        <span className="text-xs text-text-tertiary">{deltas.length} categories</span>
      </div>
      {deltas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No {title.toLowerCase().replace(' categories', '')} data for selected periods.
        </p>
      ) : (
        <div className="space-y-3 max-h-[300px] md:h-[400px] lg:h-[520px] overflow-y-auto pr-1">
          {deltas.map((d, i) => (
            <CategoryDeltaRow
              key={d.category}
              delta={d}
              labelA={periodA.label}
              labelB={periodB.label}
              maxValue={Math.max(deltas[0].periodA, deltas[0].periodB, 1)}
              colorA={rawColors.ios.blue}
              colorB={rawColors.ios.indigo}
              invertChange={invertChange}
              index={i}
            />
          ))}
        </div>
      )}
    </motion.div>
  )
}
