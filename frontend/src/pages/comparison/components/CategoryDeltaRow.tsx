import { motion } from 'framer-motion'
import { formatCurrency } from '@/lib/formatters'
import type { CategoryDelta } from '../types'
import { changeBadgeClass } from '../utils'
import { ChangeIcon } from './ChangeIcon'

interface CategoryDeltaRowProps {
  delta: CategoryDelta
  labelA: string
  labelB: string
  maxValue: number
  colorA: string
  colorB: string
  invertChange?: boolean
  index: number
}

/**
 * One row per category in the deltas list.
 *
 * Renders both periods overlaid on a single horizontal bar (period A as
 * the faded ghost layer, period B as the solid layer on top) so the
 * delta reads in one eye-fixation. When B > A the solid bar extends past
 * the ghost; when B < A the ghost's tail trails past the solid (the
 * "we shrank" indicator).
 *
 * Uses ``colorB`` for both layers so the row stays metric-coded (income vs
 * expense) rather than period-coded -- ``colorA`` is unused but kept in the
 * props signature so callsites don't churn.
 */
export function CategoryDeltaRow({
  delta, labelA, labelB, maxValue, colorB, invertChange, index,
}: Readonly<CategoryDeltaRowProps>) {
  const { category, periodA, periodB, change } = delta
  const isPositive = change >= 0
  const isGood = invertChange ? !isPositive : isPositive

  const widthA = maxValue > 0 ? (periodA / maxValue) * 100 : 0
  const widthB = maxValue > 0 ? (periodB / maxValue) * 100 : 0

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.03 }}
      className="p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
    >
      {/* Header: category name + change badge */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-white truncate flex-1">{category}</span>
        <span className={`flex items-center gap-1 text-xs font-semibold ml-2 px-2 py-0.5 rounded-full ${changeBadgeClass(change, isGood)}`}>
          <ChangeIcon change={change} size="w-3 h-3" />
          {change > 0 ? '+' : ''}{change.toFixed(1)}%
        </span>
      </div>

      {/* Single overlaid bar: ghost (A) + solid (B). Period totals
          flank the bar so the eye gets values + delta from one row. */}
      <div className="flex items-center gap-2">
        <span
          className="text-caption text-text-tertiary tabular-nums w-20 truncate text-right"
          title={`${labelA}: ${formatCurrency(periodA)}`}
        >
          {formatCurrency(periodA)}
        </span>
        <div className="relative flex-1 h-3 rounded bg-white/5 overflow-hidden">
          <motion.div
            className="absolute inset-y-0 left-0 rounded"
            style={{ backgroundColor: colorB, opacity: 0.35 }}
            initial={{ width: 0 }}
            animate={{ width: `${widthA}%` }}
            transition={{ duration: 0.5, ease: 'easeOut', delay: index * 0.03 }}
            aria-hidden
          />
          <motion.div
            className="absolute inset-y-0 left-0 rounded"
            style={{ backgroundColor: colorB }}
            initial={{ width: 0 }}
            animate={{ width: `${widthB}%` }}
            transition={{ duration: 0.5, ease: 'easeOut', delay: index * 0.03 + 0.08 }}
            aria-hidden
          />
        </div>
        <span
          className="text-xs font-medium text-white tabular-nums w-20 truncate"
          title={`${labelB}: ${formatCurrency(periodB)}`}
        >
          {formatCurrency(periodB)}
        </span>
      </div>
    </motion.div>
  )
}
