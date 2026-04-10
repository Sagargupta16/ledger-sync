import { motion } from 'framer-motion'
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react'
import { formatCurrency } from '@/lib/formatters'
import { pctChange } from './utils'

interface KpiCardProps {
  title: string
  valueA: number
  valueB: number
  labelA: string
  labelB: string
  color: string
  invertChange?: boolean
  isPercent?: boolean
}

export function KpiCard({
  title, valueA, valueB, labelA, color, invertChange, isPercent,
}: Readonly<KpiCardProps>) {
  const change = isPercent ? valueB - valueA : pctChange(valueB, valueA)
  const isPositive = change >= 0
  const isGood = invertChange ? !isPositive : isPositive
  const fmtVal = (v: number) => (isPercent ? `${v.toFixed(1)}%` : formatCurrency(v))

  const changeIndicator = (() => {
    if (Math.abs(change) < 1) return <Minus className="w-3.5 h-3.5 text-muted-foreground" />
    if (isPositive) return <ArrowUpRight className="w-3.5 h-3.5" />
    return <ArrowDownRight className="w-3.5 h-3.5" />
  })()

  return (
    <motion.div
      className="glass rounded-2xl border border-border p-6"
      whileHover={{ scale: 1.01 }}
    >
      <p className="text-sm text-muted-foreground mb-1">{title}</p>
      <div className="flex items-end gap-2 mb-3">
        <span className="text-xl sm:text-2xl font-bold" style={{ color }}>{fmtVal(valueB)}</span>
      </div>
      <div className="text-xs text-muted-foreground mb-2">
        <span className="opacity-60">{labelA}:</span> {fmtVal(valueA)}
      </div>
      <div className={`flex items-center gap-1 text-sm font-medium ${isGood ? 'text-app-green' : 'text-app-red'}`}>
        {changeIndicator}
        <span>
          {change > 0 ? '+' : ''}{change.toFixed(1)}{isPercent ? ' pts' : '%'}
        </span>
      </div>
    </motion.div>
  )
}
