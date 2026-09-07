import { useMemo } from 'react'
import { motion } from 'motion/react'
import { PiggyBank } from 'lucide-react'
import type { FinancialGoal } from '@/hooks/api/useAnalyticsV2'
import { formatCurrencyCompact } from '@/lib/formatters'
import { rawColors } from '@/constants/colors'
import { goalTypeColor } from '../constants'

export default function SavingsPoolSummary({
  netSavings,
  totalAllocated,
  goals,
  effectiveAmounts,
}: Readonly<{
  netSavings: number
  totalAllocated: number
  goals: FinancialGoal[]
  effectiveAmounts: Record<number, number>
}>) {
  const unallocated = netSavings - totalAllocated
  const overAllocated = unallocated < 0

  // Build colored segments for the allocation bar. The bar's full width is the
  // LARGER of net-savings vs allocated, so:
  //   - under-allocated: goal segments + an explicit "Unallocated" tail
  //   - over-allocated:  segments normalize to totalAllocated (fill 100%, no clipping)
  // This keeps every segment proportional and honest in both directions.
  const { segments, barTotal } = useMemo(() => {
    const denom = Math.max(netSavings, totalAllocated)
    if (denom <= 0) return { segments: [], barTotal: 0 }
    const segs = goals
      .filter((g) => (effectiveAmounts[g.id] ?? 0) > 0)
      .map((g) => {
        const amount = effectiveAmounts[g.id] ?? 0
        return {
          id: g.id,
          name: g.name,
          amount,
          pct: (amount / denom) * 100,
          color: goalTypeColor(g.goal_type),
        }
      })
    return { segments: segs, barTotal: denom }
  }, [goals, effectiveAmounts, netSavings, totalAllocated])

  const unallocatedPct = barTotal > 0 && unallocated > 0 ? (unallocated / barTotal) * 100 : 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="ledger-panel p-4 sm:p-5"
    >
      <div className="flex items-center gap-3 mb-4">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-md"
          style={{ backgroundColor: `${rawColors.app.purple}20` }}
        >
          <PiggyBank className="w-5 h-5" style={{ color: rawColors.app.purple }} />
        </div>
        <h3 className="text-base font-semibold text-foreground">Savings Pool</h3>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-4">
        <div className="min-w-0">
          <p className="mb-1 text-xs leading-4 text-text-tertiary">Total Net Savings</p>
          <p className="ledger-figure whitespace-nowrap text-xs font-bold text-foreground min-[360px]:text-base sm:text-xl">
            {formatCurrencyCompact(netSavings)}
          </p>
        </div>
        <div className="min-w-0">
          <p className="mb-1 text-xs leading-4 text-text-tertiary">Total Allocated</p>
          <p
            className="ledger-figure whitespace-nowrap text-xs font-bold min-[360px]:text-base sm:text-xl"
            style={{ color: rawColors.app.blue }}
          >
            {formatCurrencyCompact(totalAllocated)}
          </p>
        </div>
        <div className="min-w-0">
          <p className="mb-1 text-xs leading-4 text-text-tertiary">Unallocated</p>
          <p
            className="ledger-figure whitespace-nowrap text-xs font-bold min-[360px]:text-base sm:text-xl"
            style={{ color: unallocated >= 0 ? rawColors.app.green : rawColors.app.red }}
          >
            {formatCurrencyCompact(unallocated)}
          </p>
        </div>
      </div>

      {/* Allocation bar */}
      {barTotal > 0 && (
        <div>
          <div className="w-full h-3 bg-[var(--overlay-2)] rounded-full overflow-hidden flex">
            {segments.map((seg) => (
              <div
                key={seg.id}
                className="h-full overflow-hidden first:rounded-l-full last:rounded-r-full"
                style={{ width: `${seg.pct}%` }}
                title={`${seg.name}: ${formatCurrencyCompact(seg.amount)}`}
              >
                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                  className="h-full w-full origin-left"
                  style={{ backgroundColor: seg.color }}
                />
              </div>
            ))}
            {unallocatedPct > 0 && (
              <div
                className="h-full overflow-hidden first:rounded-l-full last:rounded-r-full"
                style={{ width: `${unallocatedPct}%` }}
                title={`Unallocated: ${formatCurrencyCompact(unallocated)}`}
              >
                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                  className="h-full w-full origin-left bg-[var(--overlay-5)]"
                />
              </div>
            )}
          </div>
          {overAllocated && (
            <p className="mt-2 text-xs" style={{ color: rawColors.app.red }}>
              Over-allocated by {formatCurrencyCompact(Math.abs(unallocated))} -- segments scaled to total allocated
            </p>
          )}
          {/* Legend */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
            {segments.map((seg) => (
              <div key={seg.id} className="flex items-center gap-1.5 text-xs text-text-secondary">
                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: seg.color }} />
                {seg.name} ({seg.pct.toFixed(0)}%)
              </div>
            ))}
            {unallocated > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
                <span className="w-2.5 h-2.5 rounded-full inline-block bg-[var(--overlay-5)]" />
                Unallocated ({unallocatedPct.toFixed(0)}%)
              </div>
            )}
          </div>
        </div>
      )}
    </motion.div>
  )
}
