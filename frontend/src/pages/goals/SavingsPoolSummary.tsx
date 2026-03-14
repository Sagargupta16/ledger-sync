import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { PiggyBank } from 'lucide-react'
import type { FinancialGoal } from '@/hooks/api/useAnalyticsV2'
import { formatCurrencyCompact } from '@/lib/formatters'
import { rawColors } from '@/constants/colors'
import { GOAL_TYPE_COLORS } from './constants'

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

  // Build colored segments for the allocation bar
  const segments = useMemo(() => {
    if (netSavings <= 0) return []
    return goals
      .filter((g) => (effectiveAmounts[g.id] ?? 0) > 0)
      .map((g) => ({
        id: g.id,
        name: g.name,
        amount: effectiveAmounts[g.id] ?? 0,
        pct: Math.min(((effectiveAmounts[g.id] ?? 0) / netSavings) * 100, 100),
        color: GOAL_TYPE_COLORS[g.goal_type],
      }))
  }, [goals, effectiveAmounts, netSavings])

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl border border-border p-6"
    >
      <div className="flex items-center gap-3 mb-4">
        <div
          className="flex items-center justify-center w-9 h-9 rounded-xl"
          style={{ backgroundColor: `${rawColors.ios.purple}20` }}
        >
          <PiggyBank className="w-5 h-5" style={{ color: rawColors.ios.purple }} />
        </div>
        <h3 className="text-lg font-semibold text-white">Savings Pool</h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <div>
          <p className="text-xs text-text-tertiary mb-1">Total Net Savings</p>
          <p className="text-xl font-bold text-white">{formatCurrencyCompact(netSavings)}</p>
        </div>
        <div>
          <p className="text-xs text-text-tertiary mb-1">Total Allocated</p>
          <p className="text-xl font-bold" style={{ color: rawColors.ios.blue }}>
            {formatCurrencyCompact(totalAllocated)}
          </p>
        </div>
        <div>
          <p className="text-xs text-text-tertiary mb-1">Unallocated</p>
          <p
            className="text-xl font-bold"
            style={{ color: unallocated >= 0 ? rawColors.ios.green : rawColors.ios.red }}
          >
            {formatCurrencyCompact(unallocated)}
          </p>
        </div>
      </div>

      {/* Allocation bar */}
      {netSavings > 0 && (
        <div>
          <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden flex">
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
          </div>
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
                <span className="w-2.5 h-2.5 rounded-full inline-block bg-white/10" />
                Unallocated ({((unallocated / netSavings) * 100).toFixed(0)}%)
              </div>
            )}
          </div>
        </div>
      )}
    </motion.div>
  )
}
