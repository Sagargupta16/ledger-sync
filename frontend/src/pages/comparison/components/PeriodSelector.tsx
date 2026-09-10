import { useId } from 'react'

import { Calendar } from 'lucide-react'
import type { CompareMode } from '../types'
import { formatMonthLabel } from '../utils'

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
  'ledger-control w-full min-h-11 rounded-md border px-3 py-2.5 text-sm text-foreground tabular-nums cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-app-blue'

export function PeriodSelector({
  mode, label, monthOptions, yearOptions, fyOptions,
  month, year, fy, onMonth, onYear, onFy,
}: Readonly<PeriodSelectorProps>) {
  const selectId = useId()

  return (
    <div className="flex w-full min-w-0 flex-col items-stretch gap-2">
      <div className="flex items-center gap-1.5">
        <Calendar className="size-3.5 text-app-blue" aria-hidden="true" />
        <label htmlFor={selectId} className="text-xs font-medium text-muted-foreground">{label}</label>
      </div>
      {mode === 'month' && (
        <select id={selectId} className={selectClass} value={month} onChange={(e) => onMonth(e.target.value)}>
          {monthOptions.map((m) => (
            <option key={m} value={m}>{formatMonthLabel(m)}</option>
          ))}
        </select>
      )}
      {mode === 'year' && (
        <select id={selectId} className={selectClass} value={year} onChange={(e) => onYear(Number(e.target.value))}>
          {yearOptions.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      )}
      {mode === 'fy' && (
        <select id={selectId} className={selectClass} value={fy} onChange={(e) => onFy(e.target.value)}>
          {fyOptions.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      )}
    </div>
  )
}
