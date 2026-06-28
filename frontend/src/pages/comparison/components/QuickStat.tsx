import { formatCurrencyShort } from '@/lib/formatters'
import { pctChange } from '../utils'
import { ChangeIcon } from './ChangeIcon'

interface QuickStatProps {
  label: string
  valueA: number
  valueB: number
  labelA: string
  labelB: string
  isCurrency?: boolean
}

export function QuickStat({
  label, valueA, valueB, labelA, labelB, isCurrency,
}: Readonly<QuickStatProps>) {
  const fmt = (v: number) => (isCurrency ? formatCurrencyShort(v) : String(Math.round(v)))

  // Signed delta vs Period A. These stats (counts, daily spend) have no
  // universal "good" direction, so the badge stays neutral -- it only names
  // magnitude + direction, not a win/loss.
  const change = pctChange(valueB, valueA)
  const absDelta = valueB - valueA
  const isFlat = Math.abs(change) < 1
  const deltaText = isCurrency
    ? `${absDelta > 0 ? '+' : absDelta < 0 ? '-' : ''}${formatCurrencyShort(Math.abs(absDelta))}`
    : `${absDelta > 0 ? '+' : ''}${Math.round(absDelta)}`

  return (
    <div className="p-4 rounded-xl bg-white/5">
      <p className="text-xs text-muted-foreground mb-2">{label}</p>
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{labelA}</p>
          <p className="text-base font-semibold">{fmt(valueA)}</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-muted-foreground">{labelB}</p>
          <p className="text-base font-semibold">{fmt(valueB)}</p>
        </div>
      </div>
      <div className={`mt-2 flex items-center gap-1 text-xs font-medium ${isFlat ? 'text-muted-foreground' : 'text-text-secondary'}`}>
        <ChangeIcon change={change} size="w-3 h-3" />
        <span className="tabular-nums">{deltaText}</span>
        {!isFlat && (
          <span className="text-text-tertiary">
            ({change > 0 ? '+' : ''}{change.toFixed(0)}%)
          </span>
        )}
      </div>
    </div>
  )
}
