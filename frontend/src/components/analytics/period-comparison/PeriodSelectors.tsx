import { ArrowLeftRight, Calendar } from 'lucide-react'

import { Select } from '@/components/ui'
import { rawColors } from '@/constants/colors'

import { formatMonthLabel, type CompareMode, type MonthData } from './periodMetrics'

interface PeriodSelectorsProps {
  compareMode: CompareMode
  setCompareMode: (mode: CompareMode) => void
  availableMonths: MonthData[]
  availableYears: number[]
  effectiveMonth1: string | null
  effectiveMonth2: string | null
  effectiveYear1: number | null
  effectiveYear2: number | null
  setSelectedMonth1: (v: string) => void
  setSelectedMonth2: (v: string) => void
  setSelectedYear1: (v: number) => void
  setSelectedYear2: (v: number) => void
}

export function PeriodSelectors(props: Readonly<PeriodSelectorsProps>) {
  const {
    compareMode,
    setCompareMode,
    availableMonths,
    availableYears,
    effectiveMonth1,
    effectiveMonth2,
    effectiveYear1,
    effectiveYear2,
    setSelectedMonth1,
    setSelectedMonth2,
    setSelectedYear1,
    setSelectedYear2,
  } = props

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6 p-4 rounded-2xl glass-thin">
      <div className="flex bg-[var(--overlay-2)] rounded-xl p-1" role="tablist" aria-label="Compare mode">
        <button
          type="button"
          role="tab"
          aria-selected={compareMode === 'months'}
          onClick={() => setCompareMode('months')}
          className="min-h-11 rounded-lg px-4 py-2 text-sm font-medium transition-colors sm:min-h-9"
          style={{
            backgroundColor: compareMode === 'months' ? rawColors.app.blue : 'transparent',
            color: compareMode === 'months' ? rawColors.onAccent : rawColors.text.secondary,
          }}
        >
          Monthly
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={compareMode === 'years'}
          onClick={() => setCompareMode('years')}
          className="min-h-11 rounded-lg px-4 py-2 text-sm font-medium transition-colors sm:min-h-9"
          style={{
            backgroundColor: compareMode === 'years' ? rawColors.app.blue : 'transparent',
            color: compareMode === 'years' ? rawColors.onAccent : rawColors.text.secondary,
          }}
        >
          Yearly
        </button>
      </div>

      <div className="h-6 w-px bg-[var(--overlay-5)] hidden sm:block" />

      <div className="flex items-center gap-2 flex-wrap">
        <Calendar className="w-4 h-4" style={{ color: rawColors.text.tertiary }} />

        {compareMode === 'months' ? (
          <>
            <Select
              value={effectiveMonth1 ?? ''}
              onChange={(e) => setSelectedMonth1(e.target.value)}
              options={availableMonths.map((month) => ({
                value: month.month,
                label: formatMonthLabel(month.month),
              }))}
              aria-label="First month to compare"
            />
            <ArrowLeftRight className="w-4 h-4" style={{ color: rawColors.text.tertiary }} />
            <Select
              value={effectiveMonth2 ?? ''}
              onChange={(e) => setSelectedMonth2(e.target.value)}
              options={availableMonths.map((month) => ({
                value: month.month,
                label: formatMonthLabel(month.month),
              }))}
              aria-label="Second month to compare"
            />
          </>
        ) : (
          <>
            <Select
              value={effectiveYear1 ?? ''}
              onChange={(e) => setSelectedYear1(Number.parseInt(e.target.value))}
              options={availableYears.map((year) => ({
                value: String(year),
                label: String(year),
              }))}
              aria-label="First year to compare"
            />
            <ArrowLeftRight className="w-4 h-4" style={{ color: rawColors.text.tertiary }} />
            <Select
              value={effectiveYear2 ?? ''}
              onChange={(e) => setSelectedYear2(Number.parseInt(e.target.value))}
              options={availableYears.map((year) => ({
                value: String(year),
                label: String(year),
              }))}
              aria-label="Second year to compare"
            />
          </>
        )}
      </div>
    </div>
  )
}
