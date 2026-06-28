import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { PiggyBank } from 'lucide-react'
import type { FinancialGoal } from '@/hooks/api/useAnalyticsV2'
import { formatCurrencyCompact } from '@/lib/formatters'
import { rawColors } from '@/constants/colors'
import { GOAL_TYPE_COLORS } from '../constants'

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
          color: GOAL_TYPE_COLORS[g.goal_type],
        }
      })
    return { segments: segs, barTotal: denom }
  }, [goals, effectiveAmounts, netSavings, totalAllocated])

  const unallocatedPct = barTotal > 0 && unallocated > 0 ? (unallocated / barTotal) * 100 : 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl border border-border p-4 md:p-6"
    >
      <div className="flex items-center gap-3 mb-4">
        <div
          className="flex items-center justify-center w-9 h-9 rounded-xl"
          style={{ backgroundColor: `${rawColors.app.purple}20` }}
        >
          <PiggyBank className="w-5 h-5" style={{ color: rawColors.app.purple }} />
        </div>
        <h3 className="text-lg font-semibold text-foreground">Savings Pool</h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <div>
          <p className="text-xs text-text-tertiary mb-1">Total Net Savings</p>
          <p className="text-xl font-bold text-foreground">{formatCurrencyCompact(netSavings)}</p>
        </div>
        <div>
          <p className="text-xs text-text-tertiary mb-1">Total Allocated</p>
          <p className="text-xl font-bold" style={{ color: rawColors.app.blue }}>
            {formatCurrencyCompact(totalAllocated)}
          </p>
        </div>
        <div>
          <p className="text-xs text-text-tertiary mb-1">Unallocated</p>
          <p
            className="text-xl font-bold"
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
              <motion.div
                key={seg.id}
                initial={{ width: 0 }}
                animate={{ width: `${seg.pct}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className="h-full first:rounded-l-full last:rounded-r-full"
                style={{ backgroundColor: seg.color }}
                title={`${seg.name}: ${formatCurrencyCompact(seg.amount)}`}
              />
            ))}
            {unallocatedPct > 0 && (
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${unallocatedPct}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className="h-full first:rounded-l-full last:rounded-r-full bg-[var(--overlay-5)]"
                title={`Unallocated: ${formatCurrencyCompact(unallocated)}`}
              />
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
