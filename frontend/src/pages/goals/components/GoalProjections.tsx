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
  goal: { target_date: string }
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
          Target: {new Date(goal.target_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
          {projection.monthsRemaining > 0 && (
            <span className="text-text-tertiary"> ({Math.ceil(projection.monthsRemaining)} months left)</span>
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
