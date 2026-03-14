import { Calendar } from 'lucide-react'
import type { CompareMode } from './types'
import { formatMonthLabel } from './utils'

interface PeriodSelectorProps {
  mode: CompareMode
  label: string
  monthOptions: string[]
  yearOptions: number[]
  fyOptions: string[]
  month: string
  year: number
  fy: string
  onMonth: (m: string) => void
  onYear: (y: number) => void
  onFy: (f: string) => void
}

const selectClass =
  'px-3 py-2 rounded-lg bg-[rgba(44,44,46,0.6)] backdrop-blur-xl border border-border text-sm text-white cursor-pointer hover:bg-[rgba(58,58,60,0.6)] transition-colors'

export function PeriodSelector({
  mode, label, monthOptions, yearOptions, fyOptions,
  month, year, fy, onMonth, onYear, onFy,
}: Readonly<PeriodSelectorProps>) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex items-center gap-1.5">
        <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
      </div>
      {mode === 'month' && (
        <select className={selectClass} value={month} onChange={(e) => onMonth(e.target.value)}>
          {monthOptions.map((m) => (
            <option key={m} value={m}>{formatMonthLabel(m)}</option>
          ))}
        </select>
      )}
      {mode === 'year' && (
        <select className={selectClass} value={year} onChange={(e) => onYear(Number(e.target.value))}>
          {yearOptions.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      )}
      {mode === 'fy' && (
        <select className={selectClass} value={fy} onChange={(e) => onFy(e.target.value)}>
          {fyOptions.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      )}
    </div>
  )
}
