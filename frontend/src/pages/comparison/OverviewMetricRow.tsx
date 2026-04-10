import { motion } from 'framer-motion'
import { formatCurrency } from '@/lib/formatters'
import { pctChange } from './utils'
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
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-white">{label}</span>
        <div className={`flex items-center gap-1 text-xs font-medium ${isGood ? 'text-app-green' : 'text-app-red'}`}>
          <ChangeIcon change={change} size="w-3 h-3" />
          <span>{change > 0 ? '+' : ''}{change.toFixed(1)}{isPercent ? ' pts' : '%'}</span>
        </div>
      </div>
      {/* Period A bar */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground w-24 truncate">{labelA}</span>
        <div className="flex-1 h-5 rounded-md bg-white/5 overflow-hidden">
          <motion.div
            className="h-full rounded-md"
            style={{ backgroundColor: color, opacity: 0.6 }}
            initial={{ width: 0 }}
            animate={{ width: `${barWidthA}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        </div>
        <span className="text-xs font-medium text-foreground tabular-nums w-24 text-right">{fmtVal(valueA)}</span>
      </div>
      {/* Period B bar */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground w-24 truncate">{labelB}</span>
        <div className="flex-1 h-5 rounded-md bg-white/5 overflow-hidden">
          <motion.div
            className="h-full rounded-md"
            style={{ backgroundColor: color }}
            initial={{ width: 0 }}
            animate={{ width: `${barWidthB}%` }}
            transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
          />
        </div>
        <span className="text-xs font-medium text-white tabular-nums w-24 text-right">{fmtVal(valueB)}</span>
      </div>
    </div>
  )
}
