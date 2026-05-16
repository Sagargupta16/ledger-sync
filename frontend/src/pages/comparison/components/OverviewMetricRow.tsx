import { motion } from 'framer-motion'
import { formatCurrency } from '@/lib/formatters'
import { pctChange } from '../utils'
import { ChangeIcon } from './ChangeIcon'

interface OverviewMetricRowProps {
  label: string
  valueA: number
  valueB: number
  labelA: string
  labelB: string
  color: string
  maxValue: number
  invertChange?: boolean
  isPercent?: boolean
}

/**
 * One row per metric (Income / Expenses / Savings / Savings Rate).
 *
 * Renders the two periods overlaid on a single horizontal bar instead of
 * stacked one-above-the-other. Period A is the faded ghost layer; period B
 * is the solid layer on top. When B > A the user sees the change as the
 * solid bar's extent past where the ghost would end; when B < A the ghost's
 * tail extends past the solid bar (the "we shrank" trail). Reads in one
 * eye-fixation instead of two.
 */
export function OverviewMetricRow({
  label, valueA, valueB, labelA, labelB,
  color, maxValue, invertChange, isPercent,
}: Readonly<OverviewMetricRowProps>) {
  const change = isPercent ? valueB - valueA : pctChange(valueB, valueA)
  const isPositive = change >= 0
  const isGood = invertChange ? !isPositive : isPositive
  const fmtVal = (v: number) => (isPercent ? `${v.toFixed(1)}%` : formatCurrency(v))

  const barWidthA = maxValue > 0 ? (Math.abs(valueA) / maxValue) * 100 : 0
  const barWidthB = maxValue > 0 ? (Math.abs(valueB) / maxValue) * 100 : 0

  return (
    <div className="space-y-1.5">
      {/* Header: metric label + change badge */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-white">{label}</span>
        <div className={`flex items-center gap-1 text-xs font-medium ${isGood ? 'text-app-green' : 'text-app-red'}`}>
          <ChangeIcon change={change} size="w-3 h-3" />
          <span>{change > 0 ? '+' : ''}{change.toFixed(1)}{isPercent ? ' pts' : '%'}</span>
        </div>
      </div>
      {/* Single overlaid bar: ghost (A) + solid (B). Both anchored at the
          same left edge so the user reads the delta as the visible gap. */}
      <div className="flex items-center gap-3">
        <span
          className="text-caption text-text-tertiary tabular-nums w-24 truncate text-right"
          title={`${labelA}: ${fmtVal(valueA)}`}
        >
          {labelA} · {fmtVal(valueA)}
        </span>
        <div className="relative flex-1 h-5 rounded-md bg-white/5 overflow-hidden">
          <motion.div
            className="absolute inset-y-0 left-0 rounded-md"
            style={{ backgroundColor: color, opacity: 0.35 }}
            initial={{ width: 0 }}
            animate={{ width: `${barWidthA}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            aria-hidden
          />
          <motion.div
            className="absolute inset-y-0 left-0 rounded-md"
            style={{ backgroundColor: color }}
            initial={{ width: 0 }}
            animate={{ width: `${barWidthB}%` }}
            transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
            aria-hidden
          />
        </div>
        <span
          className="text-xs font-medium text-white tabular-nums w-24 truncate"
          title={`${labelB}: ${fmtVal(valueB)}`}
        >
          {labelB} · {fmtVal(valueB)}
        </span>
      </div>
    </div>
  )
}
