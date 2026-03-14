import { CreditCard, Calendar, Pencil, Trash2 } from 'lucide-react'
import { formatCurrency } from '@/lib/formatters'
import { rawColors } from '@/constants/colors'
import type { ManualSubscription } from './types'
import { toMonthlyAmount, getAnnualFactor, formatDate, capitalize } from './helpers'
import { ManualBadge } from './StatusBadges'

interface ManualSubscriptionCardProps {
  sub: ManualSubscription
  onEdit: () => void
  onDelete: () => void
}

export function ManualSubscriptionCard({
  sub,
  onEdit,
  onDelete,
}: Readonly<ManualSubscriptionCardProps>) {
  const monthlyAmount = toMonthlyAmount(sub.amount, sub.frequency)
  const annualCost = Math.abs(sub.amount) * getAnnualFactor(sub.frequency)

  return (
    <div className="glass rounded-xl border border-ios-purple/20 p-5 hover:border-ios-purple/30 hover:bg-white/[0.04] transition-colors duration-200">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        {/* Left side */}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-start gap-3">
            <div
              className="p-2.5 rounded-xl flex-shrink-0"
              style={{
                backgroundColor: `${rawColors.ios.teal}1a`,
                boxShadow: `0 4px 12px ${rawColors.ios.teal}20`,
              }}
            >
              <CreditCard className="w-5 h-5 text-ios-teal" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-white truncate">{sub.name}</h3>
                <ManualBadge />
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                {sub.category && (
                  <span className="text-xs text-muted-foreground bg-white/5 px-2 py-0.5 rounded-md">
                    {sub.category}
                  </span>
                )}
                <span className="text-xs text-text-tertiary">
                  Frequency: {capitalize(sub.frequency)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right side */}
        <div className="flex flex-col items-end gap-2 shrink-0 sm:text-right">
          <div>
            <p className="text-lg font-bold text-ios-red">{formatCurrency(Math.abs(sub.amount))}</p>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(monthlyAmount)}/mo &middot; {formatCurrency(annualCost)}/yr
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onEdit}
              title="Edit subscription"
              className="p-1.5 rounded-lg text-text-tertiary hover:text-white hover:bg-white/10 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onDelete}
              title="Delete subscription"
              className="p-1.5 rounded-lg text-text-tertiary hover:text-ios-red hover:bg-red-500/10 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Footer row: next due */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 mt-3 pt-3 border-t border-white/5 text-xs text-text-tertiary pl-[52px]">
        {sub.next_due && (
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            Next due: {formatDate(sub.next_due)}
          </span>
        )}
      </div>
    </div>
  )
}
