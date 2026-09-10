import { useId } from 'react'
import { motion } from 'motion/react'
import { ArrowLeftRight, Calendar } from 'lucide-react'

import { Select } from '@/components/ui'
import { DURATION, EASING, TAP_FEEDBACK } from '@/constants/animations'
import { cn } from '@/lib/cn'
import { useMotionStore } from '@/store/motionStore'

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
  const activeId = useId()
  const reduceMotion = useMotionStore((state) => state.mode === 'reduced')
  const transition = { duration: reduceMotion ? 0 : DURATION.quick, ease: EASING.cinematic }
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
    <div className="mb-6 flex min-w-0 flex-wrap items-center gap-3 border-y border-[var(--hairline-1)] py-4">
      <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
        <Calendar aria-hidden="true" className="size-4 shrink-0 text-text-tertiary" />
        <div className="ledger-control flex min-w-0 flex-1 flex-wrap gap-1 rounded-lg border p-1" role="tablist" aria-label="Compare mode">
          {(['months', 'years'] as const).map((mode) => (
            <motion.button
              key={mode}
              type="button"
              role="tab"
              aria-selected={compareMode === mode}
              onClick={() => setCompareMode(mode)}
              className={cn(
                'relative isolate min-h-11 min-w-11 flex-auto touch-manipulation rounded-md px-3 py-1.5 text-center text-sm font-medium leading-5 whitespace-nowrap lg:pointer-fine:min-h-9',
                'focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                compareMode === mode
                  ? 'text-primary'
                  : 'text-muted-foreground hover:bg-[var(--overlay-2)] hover:text-foreground',
              )}
              whileTap={reduceMotion ? undefined : TAP_FEEDBACK}
              transition={transition}
            >
              {compareMode === mode && (
                <motion.span
                  aria-hidden="true"
                  layoutId={reduceMotion ? undefined : activeId}
                  initial={false}
                  transition={transition}
                  className="pointer-events-none absolute inset-0 rounded-md border border-primary/20 bg-primary/10"
                />
              )}
              <span className="relative">{mode === 'months' ? 'Monthly' : 'Yearly'}</span>
            </motion.button>
          ))}
        </div>
      </div>

      <div className="@container/periods w-full min-w-0 sm:w-auto sm:flex-1 sm:basis-72">
        <div className="grid min-w-0 grid-cols-1 items-center gap-2 @min-[18rem]/periods:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] [&>div]:min-w-0">
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
                className="min-w-0 px-2 text-sm tabular-nums focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              />
              <ArrowLeftRight aria-hidden="true" className="size-4 rotate-90 justify-self-center text-text-tertiary @min-[18rem]/periods:rotate-0" />
              <Select
                value={effectiveMonth2 ?? ''}
                onChange={(e) => setSelectedMonth2(e.target.value)}
                options={availableMonths.map((month) => ({
                  value: month.month,
                  label: formatMonthLabel(month.month),
                }))}
                aria-label="Second month to compare"
                className="min-w-0 px-2 text-sm tabular-nums focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
                className="min-w-0 px-2 text-sm tabular-nums focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              />
              <ArrowLeftRight aria-hidden="true" className="size-4 rotate-90 justify-self-center text-text-tertiary @min-[18rem]/periods:rotate-0" />
              <Select
                value={effectiveYear2 ?? ''}
                onChange={(e) => setSelectedYear2(Number.parseInt(e.target.value))}
                options={availableYears.map((year) => ({
                  value: String(year),
                  label: String(year),
                }))}
                aria-label="Second year to compare"
                className="min-w-0 px-2 text-sm tabular-nums focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
