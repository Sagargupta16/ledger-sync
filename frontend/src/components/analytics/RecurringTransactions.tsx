import { useMemo } from 'react'

import { motion } from 'motion/react'
import { RefreshCw, AlertCircle, CheckCircle, Calendar, DollarSign } from 'lucide-react'

import { useRecurringTransactions } from '@/hooks/api/useAnalyticsV2'
import { formatCurrency, formatDate } from '@/lib/formatters'

import { adaptApiRecurring, sumMonthlyCommitment } from './recurringUtils'

export default function RecurringTransactions() {
  // Source of truth is the backend recurring_transactions rollup (confidence-
  // scored detection on upload); we adapt expense patterns to the display
  // shape instead of re-detecting over the full ledger client-side.
  //
  // Commitments only: this component sums a "Monthly Fixed Costs" figure, and
  // habit rows (repeated meals, weekly groceries) are not fixed costs.
  const { data: apiRecurring = [], isLoading } = useRecurringTransactions({
    pattern_kind: 'commitment',
  })

  const recurringTransactions = useMemo(() => adaptApiRecurring(apiRecurring), [apiRecurring])

  // Calculate totals
  // Sums the adapter's `monthlyAmount`. The three-branch chain this replaced
  // divided everything that was not monthly/quarterly by 12, so a weekly or
  // daily commitment was billed as if it were annual.
  const monthlyCommitment = useMemo(
    () => sumMonthlyCommitment(recurringTransactions.filter((r) => r.isActive)),
    [recurringTransactions],
  )

  const activeCount = recurringTransactions.filter((r) => r.isActive).length

  if (isLoading) {
    return (
      <div className="ledger-panel animate-pulse p-4 sm:p-5">
        <div className="h-8 bg-muted rounded w-1/3 mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-muted rounded" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="ledger-panel p-4 sm:p-5"
    >
      <div className="mb-5 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-app-teal/15">
            <RefreshCw className="size-4 text-app-teal" />
          </div>
          <div>
            <h3 className="text-base font-semibold">Recurring transactions</h3>
            <p className="text-xs text-muted-foreground">
              {activeCount} active • {formatCurrency(monthlyCommitment)}/month commitment
            </p>
          </div>
        </div>
      </div>

      {recurringTransactions.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-muted-foreground mb-2">No recurring patterns detected yet.</p>
          <p className="text-xs text-muted-foreground">
            Recurring transactions are detected when similar amounts appear at regular intervals (monthly, quarterly, yearly).
          </p>
        </div>
      ) : (
        <div className="max-h-96 space-y-2 overflow-y-auto">
          {recurringTransactions.map((item, index) => (
            <div
              key={`${item.pattern}-${index}`}
              className={`rounded-md border p-4 ${
                item.isActive
                  ? 'border-border bg-[var(--overlay-1)]'
                  : 'bg-background/10 border-border opacity-60'
              }`}
            >
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{item.pattern}</span>
                    {item.isActive ? (
                      <CheckCircle className="w-4 h-4 text-app-green flex-shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-app-yellow flex-shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {item.frequency}
                    </span>
                    <span>{item.occurrences} occurrences</span>
                  </div>
                </div>
                <div className="sm:text-right">
                  <p className="ledger-figure font-semibold text-app-red">{formatCurrency(item.avgAmount)}</p>
                  <p className="text-xs text-muted-foreground">Total: {formatCurrency(item.totalSpent)}</p>
                </div>
              </div>
              {item.isActive && (
                <div className="mt-2 flex flex-col gap-1 border-t border-border pt-2 text-xs sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-muted-foreground">
                    Last: {formatDate(item.lastDate, { year: 'numeric', month: 'numeric', day: 'numeric' })}
                  </span>
                  <span className="text-app-teal">
                    Next expected: {formatDate(item.expectedNextDate, { year: 'numeric', month: 'numeric', day: 'numeric' })}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Monthly Summary */}
      {recurringTransactions.length > 0 && (
        <div className="mt-4 border-t border-[var(--hairline-1)] pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-app-teal" />
              <span className="font-medium">Monthly Fixed Costs</span>
            </div>
            <span className="ledger-figure text-xl font-semibold text-app-teal">{formatCurrency(monthlyCommitment)}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Based on {activeCount} active recurring expenses
          </p>
        </div>
      )}
    </motion.div>
  )
}
