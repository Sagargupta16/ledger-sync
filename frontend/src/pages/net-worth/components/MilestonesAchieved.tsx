import { motion } from 'framer-motion'
import { Award, CheckCircle2 } from 'lucide-react'

import EmptyState from '@/components/shared/EmptyState'
import { rawColors } from '@/constants/colors'
import { formatCurrency } from '@/lib/formatters'

import type { MilestoneAchieved } from '../netWorthProjection'

interface MilestonesAchievedProps {
  readonly milestones: readonly MilestoneAchieved[]
}

/** Readable "2y 3m" from an integer day count. */
function formatDuration(days: number): string {
  if (days < 30) return `${days}d`
  const months = Math.floor(days / 30.44)
  if (months < 12) return `${months}mo`
  const years = Math.floor(months / 12)
  const remMonths = months - years * 12
  return remMonths > 0 ? `${years}y ${remMonths}mo` : `${years}y`
}

export default function MilestonesAchieved({ milestones }: MilestonesAchievedProps) {
  if (milestones.length === 0) {
    return (
      <EmptyState
        icon={Award}
        title="No milestones reached yet"
        description="Your first net-worth milestone (₹1L) will appear here once you cross it."
        variant="compact"
      />
    )
  }

  return (
    <div className="relative">
      {/* Vertical trail */}
      <div
        className="absolute left-[15px] top-2 bottom-2 w-0.5"
        style={{ background: `linear-gradient(to bottom, ${rawColors.app.green}60, ${rawColors.app.green}10)` }}
      />
      <ul className="space-y-4">
        {milestones.map((m, i) => (
          <motion.li
            key={m.value}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04 }}
            className="relative flex items-start gap-4 pl-10"
          >
            <CheckCircle2
              className="absolute left-0 top-0.5 w-8 h-8 rounded-full bg-app-green/10 p-1"
              style={{ color: rawColors.app.green }}
              aria-hidden
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <span className="font-semibold text-white">
                  {m.label}
                  <span className="ml-2 text-xs text-muted-foreground font-normal">
                    ({formatCurrency(m.value)})
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(m.achievedOn).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                  {i > 0 && (
                    <>
                      <span className="mx-1.5 opacity-60">·</span>
                      <span>+{formatDuration(m.daysFromStart - milestones[i - 1].daysFromStart)} from prior</span>
                    </>
                  )}
                </span>
              </div>
            </div>
          </motion.li>
        ))}
      </ul>
    </div>
  )
}
