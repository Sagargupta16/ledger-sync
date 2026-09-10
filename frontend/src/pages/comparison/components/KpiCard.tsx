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
    <div className="min-w-0">
      <p className="ledger-meta mb-2" style={{ color }}>{title}</p>
      <p className="mb-1 text-xs text-muted-foreground">{labelB}</p>
      <div className="mb-3 min-w-0">
        <span
          className="block break-words font-mono text-2xl font-semibold tracking-tight tabular-nums text-foreground"
          title={fmtVal(valueB)}
        >
          {fmtVal(valueB)}
        </span>
      </div>
      <div className="mb-3 text-xs leading-relaxed text-muted-foreground">
        <span>{labelA}:</span> <span className="font-mono tabular-nums">{fmtVal(valueA)}</span>
      </div>
      <div className={`flex items-center gap-1 font-mono text-sm font-medium tabular-nums ${changeColorClass}`}>
        {changeIndicator}
        <span>
          {change > 0 ? '+' : ''}{change.toFixed(1)}{isPercent ? ' pts' : '%'}
        </span>
      </div>
    </div>
  )
}
