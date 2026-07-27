import { formatCurrencyCompact } from '@/lib/formatters'
import {
  getHeatmapSwatch,
  getMonthlyMax,
  getMonthlyValue,
  heatmapValueNoun,
} from '../heatmapUtils'
import { MONTHS_SHORT, type HeatmapMode } from '../types'

interface Props {
  mode: HeatmapMode
  monthlyExpense: number[]
  monthlyIncome: number[]
  selectedMonth: number | null
  onSelectMonth: (monthIndex: number) => void
}

export default function MobileMonthlySummary({
  mode,
  monthlyExpense,
  monthlyIncome,
  selectedMonth,
  onSelectMonth,
}: Readonly<Props>) {
  const maxVal = getMonthlyMax(mode, monthlyExpense, monthlyIncome)
  return (
    <div className="grid grid-cols-3 gap-2 lg:hidden">
      {MONTHS_SHORT.map((m, i) => {
        // Signed value: the tile's hue comes from the sign, its intensity from
        // the magnitude, and the label names the direction.
        const val = getMonthlyValue(mode, monthlyExpense, monthlyIncome, i)
        const { color } = getHeatmapSwatch(mode, val, maxVal)
        const amount = formatCurrencyCompact(Math.abs(val))
        // Signed on screen so a deficit month is not read as a surplus one.
        const displayAmount = val < 0 ? formatCurrencyCompact(val) : amount
        return (
          <button
            key={m}
            type="button"
            onClick={() => onSelectMonth(i)}
            aria-pressed={selectedMonth === i}
            aria-label={`${m}: ${amount} ${heatmapValueNoun(mode, val)}. Show monthly details`}
            className="min-h-16 rounded-xl p-3 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary aria-pressed:ring-2 aria-pressed:ring-primary"
            style={{ backgroundColor: color }}
          >
            <div className="mb-1 text-xs text-muted-foreground">{m}</div>
            <div className="text-sm font-semibold text-foreground">{displayAmount}</div>
          </button>
        )
      })}
    </div>
  )
}
