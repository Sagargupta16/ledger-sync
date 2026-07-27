import {
  TrendingUp,
  Calendar,
  Target,
  CheckCircle,
  Clock,
} from 'lucide-react'
import { formatCurrencyCompact } from '@/lib/formatters'
import { rawColors } from '@/constants/colors'
import { formatMonthYear } from '../helpers'
import type { GoalProjection } from '../types'

export default function GoalProjections({
  goal,
  projection,
  avgMonthlySavings,
}: Readonly<{
  goal: { target_date: string | null }
  projection: GoalProjection
  avgMonthlySavings: number | null
}>) {
  return (
    <div className="mt-4 space-y-1.5">
      {avgMonthlySavings != null && avgMonthlySavings > 0 && projection.projectedDate && (
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <TrendingUp className="w-3.5 h-3.5 flex-shrink-0" style={{ color: rawColors.app.blue }} />
          <span>
            At {formatCurrencyCompact(avgMonthlySavings)}/mo savings{' '}
            {projection.status === 'achieved' ? (
              <span className="font-medium" style={{ color: rawColors.app.green }}>
                -- Goal achieved!
              </span>
            ) : (
              <>
                &#8594; {formatMonthYear(projection.projectedDate)}
              </>
            )}
          </span>
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-text-secondary">
        <Calendar className="w-3.5 h-3.5 flex-shrink-0" style={{ color: rawColors.app.teal }} />
        <span>
          Target: {goal.target_date ? new Date(goal.target_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'No deadline'}
          {/*
            monthsRemaining is a WHOLE-month count, so a deadline days away is 0
            and no per-month figure is quoted for it (there isn't one). Say which
            near-term state it is instead of falling silent.
          */}
          {projection.deadlineState === 'scheduled' && (
            <span className="text-text-tertiary">
              {' '}({projection.monthsRemaining} {projection.monthsRemaining === 1 ? 'month' : 'months'} left)
            </span>
          )}
          {projection.deadlineState === 'due_soon' && (
            <span className="text-text-tertiary"> (due within a month)</span>
          )}
          {projection.deadlineState === 'past_due' && (
            <span style={{ color: rawColors.app.red }}> (past due)</span>
          )}
        </span>
      </div>

      {projection.requiredMonthlySavings != null && projection.requiredMonthlySavings > 0 && (
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <Target className="w-3.5 h-3.5 flex-shrink-0" style={{ color: rawColors.app.orange }} />
          <span>
            Needs {formatCurrencyCompact(projection.requiredMonthlySavings)}/mo to reach target on time
          </span>
        </div>
      )}

      {/* Status Badge */}
      <div className="flex items-center gap-2 text-xs">
        {projection.status === 'achieved' ? (
          <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: rawColors.app.green }} />
        ) : (
          <Clock className="w-3.5 h-3.5 flex-shrink-0" style={{ color: projection.statusColor }} />
        )}
        <span className="font-medium" style={{ color: projection.statusColor }}>
          {projection.statusLabel}
        </span>
        {projection.monthsDelta != null && projection.status !== 'achieved' && projection.status !== 'no_data' && (
          <span className="text-text-tertiary">
            {projection.monthsDelta > 0
              ? `-- ${Math.round(projection.monthsDelta)} months ahead`
              : `-- ${Math.round(Math.abs(projection.monthsDelta))} months behind`}
          </span>
        )}
      </div>
    </div>
  )
}
