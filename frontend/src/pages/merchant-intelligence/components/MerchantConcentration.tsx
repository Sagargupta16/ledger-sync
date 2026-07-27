import { motion } from 'motion/react'

import { ProgressBar } from '@/components/shared'
import { Money } from '@/components/ui'
import { rawColors } from '@/constants/colors'
import { formatPercent } from '@/lib/formatters'

import { toLabelKind } from '../merchantUtils'
import type { MerchantRow, MerchantStats } from '../types'

interface MerchantConcentrationProps {
  readonly rows: readonly MerchantRow[]
  readonly stats: MerchantStats
  readonly threshold: number
}

/** How many leaders to list beside the Pareto chart. */
const LEADER_COUNT = 6

/**
 * The "vital few" leaderboard that sits under the Pareto chart.
 *
 * The chart answers how concentrated spending is; this answers who the
 * concentration actually is, with each payee's share drawn against the largest
 * one so the ranking is readable without hovering a chart.
 */
export default function MerchantConcentration({
  rows,
  stats,
  threshold,
}: MerchantConcentrationProps) {
  const leaders = [...rows]
    .sort((a, b) => b.total_spent - a.total_spent)
    .slice(0, LEADER_COUNT)

  if (leaders.length === 0) return null

  const maxSpend = leaders[0].total_spent

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl border border-border p-4 md:p-6"
    >
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-foreground">Who the concentration is</h2>
        <p className="text-xs text-text-tertiary">
          {stats.vitalFewCount} of {stats.merchantCount} payees reach{' '}
          {formatPercent(stats.vitalFewShare)} of tracked spend. The {threshold}% line is where the
          long tail starts.
        </p>
      </div>

      <ol className="m-0 list-none space-y-3 p-0">
        {leaders.map((row, index) => {
          const share =
            stats.trackedSpend > 0 ? (row.total_spent / stats.trackedSpend) * 100 : 0
          const isNote = toLabelKind(row.label_kind) === 'descriptor'
          return (
            <li key={`${row.merchant}-${row.label_kind ?? 'unclassified'}`}>
              <div className="flex min-w-0 items-baseline justify-between gap-3">
                <p className="min-w-0 truncate text-sm text-foreground">
                  <span className="mr-1.5 tabular-nums text-text-tertiary">{index + 1}.</span>
                  {row.merchant}
                  {isNote && <span className="ml-1.5 text-[11px] text-text-tertiary">(note)</span>}
                </p>
                <Money value={row.total_spent} width="sm" />
              </div>
              <div className="mt-1 flex items-center gap-2.5">
                {/* Wrapper, not `flex-1` on ProgressBar itself: it renders its
                    own `w-full` track, and stacking flex-basis on that class
                    would be a Tailwind width conflict. */}
                <div className="min-w-0 flex-1">
                  <ProgressBar
                    value={row.total_spent}
                    max={maxSpend}
                    color={
                      index < stats.vitalFewCount ? rawColors.app.orange : rawColors.text.tertiary
                    }
                    height={6}
                    ariaLabel={`${row.merchant} share of tracked spend`}
                  />
                </div>
                <span className="w-14 shrink-0 text-right text-[11px] tabular-nums text-text-tertiary">
                  {formatPercent(share)}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-text-tertiary">
                {row.transaction_count} payments across {row.months_active ?? 1} months
              </p>
            </li>
          )
        })}
      </ol>
    </motion.div>
  )
}
