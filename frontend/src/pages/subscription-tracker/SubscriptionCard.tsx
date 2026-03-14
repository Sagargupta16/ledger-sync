import { CreditCard, Calendar, RefreshCw } from 'lucide-react'
import type { RecurringTransaction } from '@/hooks/api/useAnalyticsV2'
import { formatCurrency } from '@/lib/formatters'
import { rawColors } from '@/constants/colors'
import {
  toMonthlyAmount,
  getAnnualFactor,
  getSubscriptionStatus,
  formatDate,
  capitalize,
} from './helpers'
import { ConfirmBadge, StatusBadge, ConfidenceIndicator } from './StatusBadges'

interface SubscriptionCardProps {
  sub: RecurringTransaction
  isConfirmed: boolean
  onToggleConfirm: () => void
}

export function SubscriptionCard({
  sub,
  isConfirmed,
  onToggleConfirm,
}: Readonly<SubscriptionCardProps>) {
  const monthlyAmount = toMonthlyAmount(sub.expected_amount, sub.frequency)
  const annualCost = Math.abs(sub.expected_amount) * getAnnualFactor(sub.frequency)
  const status = getSubscriptionStatus(sub.last_occurrence, sub.frequency)

  return (
    <div
      className={`glass rounded-xl border p-5 hover:border-white/20 hover:bg-white/[0.04] transition-colors duration-200 ${
        isConfirmed ? 'border-ios-green/20' : 'border-border'
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        {/* Left side: name, category, account */}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-start gap-3">
            <div
              className="p-2.5 rounded-xl flex-shrink-0"
              style={{
                backgroundColor: `${rawColors.ios.purple}1a`,
                boxShadow: `0 4px 12px ${rawColors.ios.purple}20`,
              }}
            >
              <CreditCard className="w-5 h-5 text-ios-purple" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-white truncate">{sub.name}</h3>
                <ConfirmBadge isConfirmed={isConfirmed} onToggle={onToggleConfirm} />
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <span className="text-xs text-muted-foreground bg-white/5 px-2 py-0.5 rounded-md">
                  {sub.category}
                </span>
                {sub.subcategory && (
                  <span className="text-xs text-text-tertiary">
                    / {sub.subcategory}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground pl-[52px]">
            <span>Account: {sub.account}</span>
            <span>Frequency: {capitalize(sub.frequency)}</span>
            <span>Occurrences: {sub.occurrences}</span>
          </div>
        </div>

        {/* Right side: amounts and status */}
        <div className="flex flex-col items-end gap-2 shrink-0 sm:text-right">
          <div>
            <p className="text-lg font-bold text-ios-red">{formatCurrency(Math.abs(sub.expected_amount))}</p>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(monthlyAmount)}/mo &middot; {formatCurrency(annualCost)}/yr
            </p>
          </div>
          <StatusBadge status={status} />
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-tertiary">Confidence:</span>
            <ConfidenceIndicator confidence={sub.confidence} />
          </div>
        </div>
      </div>

      {/* Footer row: last occurrence, next expected */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 mt-3 pt-3 border-t border-white/5 text-xs text-text-tertiary pl-[52px]">
        <span className="flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          Last: {formatDate(sub.last_occurrence)}
        </span>
        {sub.next_expected && (
          <span className="flex items-center gap-1">
            <RefreshCw className="w-3 h-3" />
            Next: {formatDate(sub.next_expected)}
          </span>
        )}
        {sub.expected_day != null && (
          <span>Expected day: {sub.expected_day}</span>
        )}
        {sub.times_missed > 0 && (
          <span className="text-ios-yellow">Missed: {sub.times_missed}x</span>
        )}
      </div>
    </div>
  )
}
