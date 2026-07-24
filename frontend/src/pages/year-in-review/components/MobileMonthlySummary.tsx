import { formatCurrencyCompact } from '@/lib/formatters'
import { getIntensityLevel, getMonthlyMax, getMonthlyValue } from '../heatmapUtils'
import { MONTHS_SHORT, heatmapColors, type HeatmapMode } from '../types'

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
        const val = getMonthlyValue(mode, monthlyExpense, monthlyIncome, i)
        const level = getIntensityLevel(Math.abs(val), maxVal)
        return (
          <button
            key={m}
            type="button"
            onClick={() => onSelectMonth(i)}
            aria-pressed={selectedMonth === i}
            aria-label={`${m}: ${formatCurrencyCompact(Math.abs(val))}. Show monthly details`}
            className="min-h-16 rounded-xl p-3 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary aria-pressed:ring-2 aria-pressed:ring-primary"
            style={{ backgroundColor: heatmapColors[mode][level] }}
          >
            <div className="mb-1 text-xs text-muted-foreground">{m}</div>
            <div className="text-sm font-semibold text-foreground">
              {formatCurrencyCompact(Math.abs(val))}
            </div>
          </button>
        )
      })}
    </div>
  )
}
