import { useMemo } from 'react'

import { motion } from 'framer-motion'
import { RefreshCw, AlertCircle, CheckCircle, Calendar, DollarSign } from 'lucide-react'

import { useRecurringTransactions } from '@/hooks/api/useAnalyticsV2'
import { formatCurrency, formatDate } from '@/lib/formatters'

import { adaptApiRecurring } from './recurringUtils'

export default function RecurringTransactions() {
  // Source of truth is the backend recurring_transactions rollup (confidence-
  // scored detection on upload); we adapt expense patterns to the display
  // shape instead of re-detecting over the full ledger client-side.
  const { data: apiRecurring = [], isLoading } = useRecurringTransactions()

  const recurringTransactions = useMemo(() => adaptApiRecurring(apiRecurring), [apiRecurring])

  // Calculate totals
  const monthlyCommitment = useMemo(() => {
    return recurringTransactions
      .filter((r) => r.isActive)
      .reduce((sum, r) => {
        if (r.frequency === 'monthly') return sum + r.avgAmount
        if (r.frequency === 'quarterly') return sum + r.avgAmount / 3
        return sum + r.avgAmount / 12
      }, 0)
  }, [recurringTransactions])

  const activeCount = recurringTransactions.filter((r) => r.isActive).length

  if (isLoading) {
    return (
      <div className="glass rounded-2xl border border-border p-6 animate-pulse">
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
      className="glass rounded-2xl border border-border p-6"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-app-teal/20 rounded-xl">
            <RefreshCw className="w-6 h-6 text-app-teal" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Recurring Transactions</h3>
            <p className="text-sm text-muted-foreground">
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
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {recurringTransactions.map((item, index) => (
            <div
              key={`${item.pattern}-${index}`}
              className={`p-4 rounded-xl border transition-colors ${
                item.isActive
                  ? 'bg-background/30 border-border hover:border-border-strong'
                  : 'bg-background/10 border-border opacity-60'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
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
                <div className="text-right">
                  <p className="font-semibold text-app-red">{formatCurrency(item.avgAmount)}</p>
                  <p className="text-xs text-muted-foreground">Total: {formatCurrency(item.totalSpent)}</p>
                </div>
              </div>
              {item.isActive && (
                <div className="mt-2 pt-2 border-t border-border flex items-center justify-between text-xs">
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
        <div className="mt-4 p-4 rounded-xl bg-app-teal/10 border border-app-teal/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-app-teal" />
              <span className="font-medium">Monthly Fixed Costs</span>
            </div>
            <span className="text-xl font-bold text-app-teal">{formatCurrency(monthlyCommitment)}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Based on {activeCount} active recurring expenses
          </p>
        </div>
      )}
    </motion.div>
  )
}
