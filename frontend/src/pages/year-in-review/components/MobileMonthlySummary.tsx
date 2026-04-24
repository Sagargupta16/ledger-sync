import { formatCurrencyCompact } from '@/lib/formatters'
import { getIntensityLevel, getMonthlyMax, getMonthlyValue } from '../heatmapUtils'
import { MONTHS_SHORT, heatmapColors, type HeatmapMode } from '../types'

interface Props {
  mode: HeatmapMode
  monthlyExpense: number[]
  monthlyIncome: number[]
}

export default function MobileMonthlySummary({
  mode,
  monthlyExpense,
  monthlyIncome,
}: Readonly<Props>) {
  const maxVal = getMonthlyMax(mode, monthlyExpense, monthlyIncome)
  return (
    <div className="md:hidden grid grid-cols-3 gap-2">
      {MONTHS_SHORT.map((m, i) => {
        const val = getMonthlyValue(mode, monthlyExpense, monthlyIncome, i)
        const level = getIntensityLevel(Math.abs(val), maxVal)
        return (
          <div
            key={m}
            className="p-3 rounded-xl text-center transition-colors"
            style={{ backgroundColor: heatmapColors[mode][level] }}
          >
            <div className="text-xs text-muted-foreground mb-1">{m}</div>
            <div className="text-sm font-semibold text-white">
              {formatCurrencyCompact(Math.abs(val))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
