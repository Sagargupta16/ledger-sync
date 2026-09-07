import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react'
import { formatCurrency } from '@/lib/formatters'
import { pctChange } from '../utils'

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
  title, valueA, valueB, labelA, labelB, color, invertChange, isPercent,
}: Readonly<KpiCardProps>) {
  const change = isPercent ? valueB - valueA : pctChange(valueB, valueA)
  const isPositive = change >= 0
  // Treat a sub-1 swing as flat: neutral icon AND neutral text, so a "0.9%"
  // change never reads as a green win / red loss it isn't.
  const isFlat = Math.abs(change) < 1
  const isGood = invertChange ? !isPositive : isPositive
  let changeColorClass = 'text-muted-foreground'
  if (!isFlat) {
    changeColorClass = isGood ? 'text-app-green' : 'text-app-red'
  }
  const fmtVal = (v: number) => (isPercent ? `${v.toFixed(1)}%` : formatCurrency(v))

  const changeIndicator = (() => {
    if (isFlat) return <Minus className="w-3.5 h-3.5 text-muted-foreground" />
    if (isPositive) return <ArrowUpRight className="w-3.5 h-3.5" />
    return <ArrowDownRight className="w-3.5 h-3.5" />
  })()

  return (
    <div className="ledger-panel min-w-0 p-4 sm:p-6">
      <p className="text-kpi-label text-muted-foreground mb-1">{title}</p>
      <div className="mb-3 min-w-0">
        <span
          className="block truncate text-kpi-value font-bold"
          style={{ color }}
          title={fmtVal(valueB)}
        >
          <span className="sr-only">{labelB}: </span>
          {fmtVal(valueB)}
        </span>
      </div>
      <div className="mb-2 truncate text-kpi-label text-muted-foreground" title={`${labelA}: ${fmtVal(valueA)}`}>
        <span className="opacity-60">{labelA}:</span> {fmtVal(valueA)}
      </div>
      <div className={`flex items-center gap-1 text-sm font-medium ${changeColorClass}`}>
        {changeIndicator}
        <span>
          {change > 0 ? '+' : ''}{change.toFixed(1)}{isPercent ? ' pts' : '%'}
        </span>
      </div>
    </div>
  )
}
