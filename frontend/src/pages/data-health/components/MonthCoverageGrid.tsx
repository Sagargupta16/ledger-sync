import { useMemo } from 'react'

import { motion } from 'motion/react'

import { fadeUpItem, staggerFast } from '@/constants/animations'
import { cn } from '@/lib/cn'
import { formatMonthKey } from '@/lib/dateUtils'
import type { AccountBalanceHealth } from '@/services/api/balanceChecks'

import { buildAccountCoverage, type CoverageState } from '../monthCoverage'
import { cellTitle, coverageSummary } from '../monthCoverageText'

interface MonthCoverageGridProps {
  readonly health: AccountBalanceHealth
  /** The summary's IST day, so "this month" matches the server. */
  readonly asOf: string
}

const CELL_CLASS: Record<CoverageState, string> = {
  rows: 'bg-app-indigo/70',
  gap: 'border border-dashed border-warning bg-warning/15',
  outside: 'bg-[var(--overlay-3)]',
  future: 'bg-transparent',
}

/** Year label column, then twelve months that shrink to the phone's width. */
const ROW_GRID = 'grid grid-cols-[2rem_repeat(12,minmax(0,1fr))] gap-[3px] sm:gap-1'

const LEGEND = [
  { label: 'Rows', swatch: CELL_CLASS.rows },
  { label: 'No rows in between', swatch: CELL_CLASS.gap },
] as const

/**
 * One row per calendar year, one cell per month: filled where the account has
 * rows, dashed where a month between its first and last row has none, and a
 * dot where a balance check falls (green matched, red off). The caption names
 * the empty months in words, since a phone cannot hover a cell.
 */
export default function MonthCoverageGrid({ health, asOf }: MonthCoverageGridProps) {
  const coverage = useMemo(() => buildAccountCoverage(health, asOf), [health, asOf])
  const initials = useMemo(
    () =>
      Array.from({ length: 12 }, (_, index) => {
        const month = String(index + 1).padStart(2, '0')
        return { month, initial: formatMonthKey(`2024-${month}`, { month: 'narrow' }) }
      }),
    [],
  )
  if (coverage.years.length === 0) return null
  const summary = coverageSummary(coverage)

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-foreground">Months covered</h3>
      {/* Visual only: the caption below says the same in words. */}
      <div aria-hidden className="max-w-md space-y-1">
        <div className={cn(ROW_GRID, 'text-[10px] text-text-quaternary')}>
          <span />
          {initials.map(({ month, initial }) => (
            <span key={month} className="text-center">
              {initial}
            </span>
          ))}
        </div>
        <motion.div
          variants={staggerFast}
          initial="hidden"
          animate="visible"
          className="space-y-[3px] sm:space-y-1"
        >
          {coverage.years.map((year) => (
            <motion.div key={year.year} variants={fadeUpItem} className={ROW_GRID}>
              <span className="self-center text-[10px] tabular-nums text-text-tertiary">
                {year.year}
              </span>
              {year.cells.map((cell) => (
                <span
                  key={cell.month}
                  title={cellTitle(cell)}
                  className={cn('relative aspect-square rounded-[3px]', CELL_CLASS[cell.state])}
                >
                  {cell.check && (
                    <span
                      className={cn(
                        'absolute inset-0 m-auto size-1.5 rounded-full ring-2 ring-background',
                        cell.check === 'mismatch' ? 'bg-app-red' : 'bg-app-green',
                      )}
                    />
                  )}
                </span>
              ))}
            </motion.div>
          ))}
        </motion.div>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-text-tertiary" aria-hidden>
        {LEGEND.map((item) => (
          <li key={item.label} className="flex items-center gap-1.5">
            <span className={cn('size-2.5 rounded-[3px]', item.swatch)} />
            {item.label}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-app-green" />
          Check matched
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-app-red" />
          Check off
        </li>
      </ul>
      <p className="text-xs leading-5 text-text-tertiary">{summary}</p>
    </div>
  )
}
