import { motion } from 'framer-motion'
import { Target, TrendingUp } from 'lucide-react'

import EmptyState from '@/components/shared/EmptyState'
import { rawColors } from '@/constants/colors'
import { formatCurrency } from '@/lib/formatters'

import type { MilestoneETA } from '../netWorthProjection'

interface TargetProjectionsTableProps {
  readonly etas: readonly MilestoneETA[]
  readonly monthlyGrowth: number
  readonly currentNetWorth: number
}

function formatETA(monthsAway: number): string {
  if (monthsAway < 1) return 'this month'
  if (monthsAway < 12) return `${Math.round(monthsAway)}mo`
  const years = Math.floor(monthsAway / 12)
  const rem = Math.round(monthsAway - years * 12)
  return rem > 0 ? `${years}y ${rem}mo` : `${years}y`
}

export default function TargetProjectionsTable({
  etas,
  monthlyGrowth,
  currentNetWorth,
}: TargetProjectionsTableProps) {
  if (monthlyGrowth <= 0) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="Not enough growth to project"
        description={
          monthlyGrowth < 0
            ? 'Your recent monthly trend is negative. Future milestones need positive growth to compute an ETA.'
            : 'Need at least 2 months of positive growth to project milestone ETAs.'
        }
        variant="compact"
      />
    )
  }

  if (etas.length === 0) {
    return (
      <EmptyState
        icon={Target}
        title="All tracked milestones reached"
        description="You've hit every default milestone. Nothing left to project."
        variant="compact"
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-6 text-sm flex-wrap">
        <span className="text-muted-foreground">
          Current net worth:{' '}
          <span className="text-white font-semibold">{formatCurrency(currentNetWorth)}</span>
        </span>
        <span className="text-muted-foreground">
          Avg monthly growth:{' '}
          <span className="text-app-green font-semibold">
            +{formatCurrency(Math.round(monthlyGrowth))}
          </span>
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-4 text-sm font-semibold text-muted-foreground">Target</th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-muted-foreground">Amount</th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-muted-foreground">Gap</th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-muted-foreground">ETA</th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-muted-foreground">By</th>
            </tr>
          </thead>
          <tbody>
            {etas.slice(0, 6).map((m, i) => (
              <motion.tr
                key={m.value}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="border-b border-border hover:bg-white/5 transition-colors"
              >
                <td className="py-3 px-4 font-semibold text-white flex items-center gap-2">
                  <Target className="w-4 h-4" style={{ color: rawColors.app.blue }} aria-hidden />
                  {m.label}
                </td>
                <td className="py-3 px-4 text-right text-muted-foreground">
                  {formatCurrency(m.value)}
                </td>
                <td className="py-3 px-4 text-right text-muted-foreground">
                  {formatCurrency(m.value - currentNetWorth)}
                </td>
                <td className="py-3 px-4 text-right font-semibold text-app-blue">
                  {formatETA(m.monthsAway)}
                </td>
                <td className="py-3 px-4 text-right text-muted-foreground text-sm">
                  {new Date(m.etaDate).toLocaleDateString('en-US', {
                    month: 'short',
                    year: 'numeric',
                  })}
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        ETAs assume your average monthly growth of the last 12 months continues. A bad month, windfall,
        or market swing will shift these dates.
      </p>
    </div>
  )
}
