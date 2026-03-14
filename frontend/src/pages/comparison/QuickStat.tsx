import { formatCurrencyShort } from '@/lib/formatters'

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
    </div>
  )
}
