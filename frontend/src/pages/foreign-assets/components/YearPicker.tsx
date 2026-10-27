import { useId } from 'react'

import { assessmentYearLabel } from '../foreignAssetsLabels'

interface YearPickerProps {
  years: number[]
  year: number | null
  currentYear: number
  onChange: (year: number) => void
}

/** Calendar-year window for Schedule FA, labelled with the return it belongs to. */
export default function YearPicker({ years, year, currentYear, onChange }: Readonly<YearPickerProps>) {
  const id = useId()
  return (
    <div className="flex min-w-0 items-center gap-2">
      <label htmlFor={id} className="shrink-0 text-xs font-medium text-muted-foreground">
        Calendar year
      </label>
      <select
        id={id}
        value={year ?? ''}
        onChange={(event) => onChange(Number(event.target.value))}
        className="ledger-control min-h-11 min-w-0 rounded-lg border border-border px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none lg:pointer-fine:min-h-9"
      >
        {years.map((option) => (
          <option key={option} value={option}>
            {`${option} (${assessmentYearLabel(option)}${option === currentYear ? ', in progress' : ''})`}
          </option>
        ))}
      </select>
    </div>
  )
}
