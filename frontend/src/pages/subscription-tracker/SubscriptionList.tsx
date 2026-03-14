import { motion, AnimatePresence } from 'framer-motion'
import { CreditCard, CheckCircle2, AlertTriangle, UserPlus } from 'lucide-react'
import type { RecurringTransaction } from '@/hooks/api/useAnalyticsV2'
import { SCROLL_FADE_UP } from '@/constants/animations'
import EmptyState from '@/components/shared/EmptyState'
import type { ManualSubscription, SortKey } from './types'
import { SortButton } from './SortButton'
import { SubscriptionCard } from './SubscriptionCard'
import { ManualSubscriptionCard } from './ManualSubscriptionCard'
import { ManualSubscriptionForm } from './ManualSubscriptionForm'

interface SubscriptionListProps {
  isLoading: boolean
  hasAnySubs: boolean
  sortBy: SortKey
  setSortBy: (key: SortKey) => void
  sortedConfirmed: RecurringTransaction[]
  sortedUnconfirmed: RecurringTransaction[]
  sortedManual: ManualSubscription[]
  editingManualId: string | null
  setEditingManualId: (id: string | null) => void
  setShowCreateForm: (show: boolean) => void
  handleToggleConfirm: (id: string) => void
  handleEditManual: (id: string, data: Omit<ManualSubscription, 'id'>) => void
  handleDeleteManual: (id: string) => void
}

export function SubscriptionList({
  isLoading,
  hasAnySubs,
  sortBy,
  setSortBy,
  sortedConfirmed,
  sortedUnconfirmed,
  sortedManual,
  editingManualId,
  setEditingManualId,
  setShowCreateForm,
  handleToggleConfirm,
  handleEditManual,
  handleDeleteManual,
}: Readonly<SubscriptionListProps>) {
  return (
    <motion.div className="glass p-6 rounded-xl border border-border" {...SCROLL_FADE_UP}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h2 className="text-lg font-semibold text-white">All Subscriptions</h2>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-text-tertiary mr-1">Sort by:</span>
          <SortButton label="Amount" sortKey="amount" currentSort={sortBy} onSort={setSortBy} />
          <SortButton label="Name" sortKey="name" currentSort={sortBy} onSort={setSortBy} />
          <SortButton label="Last Seen" sortKey="last_occurrence" currentSort={sortBy} onSort={setSortBy} />
          <SortButton label="Annual Cost" sortKey="annual_cost" currentSort={sortBy} onSort={setSortBy} />
        </div>
      </div>

      {isLoading && (
        <div className="space-y-4">
          {Array.from({ length: 5 }, (_, i) => `skeleton-${i}`).map((id) => (
            <div
              key={id}
              className="h-32 rounded-xl bg-white/5 animate-pulse"
            />
          ))}
        </div>
      )}
      {!isLoading && !hasAnySubs && (
        <EmptyState
          icon={CreditCard}
          title="No recurring expenses found"
          description="Once recurring expense patterns are detected from your transactions, they will appear here. You can also add subscriptions manually."
          variant="card"
        />
      )}
      {!isLoading && hasAnySubs && (
        <div className="space-y-4">
          {/* Section: Confirmed active subscriptions */}
          {sortedConfirmed.length > 0 && (
            <>
              <div className="flex items-center gap-2 pt-1">
                <CheckCircle2 className="w-4 h-4 text-ios-green" />
                <span className="text-sm font-medium text-ios-green">
                  Confirmed ({sortedConfirmed.length})
                </span>
              </div>
              {sortedConfirmed.map((sub, i) => (
                <motion.div
                  key={`confirmed-${sub.id}`}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.04 }}
                >
                  <SubscriptionCard
                    sub={sub}
                    isConfirmed
                    onToggleConfirm={() => handleToggleConfirm(String(sub.id))}
                  />
                </motion.div>
              ))}
            </>
          )}

          {/* Section: Manual subscriptions */}
          {sortedManual.length > 0 && (
            <>
              <div className="flex items-center gap-2 pt-3">
                <UserPlus className="w-4 h-4 text-ios-purple" />
                <span className="text-sm font-medium text-ios-purple">
                  Manual ({sortedManual.length})
                </span>
              </div>
              {sortedManual.map((sub) => (
                <div key={sub.id}>
                  {editingManualId === sub.id ? (
                    <AnimatePresence>
                      <ManualSubscriptionForm
                        initial={sub}
                        isEdit
                        onSave={(data) => handleEditManual(sub.id, data)}
                        onCancel={() => setEditingManualId(null)}
                      />
                    </AnimatePresence>
                  ) : (
                    <ManualSubscriptionCard
                      sub={sub}
                      onEdit={() => { setEditingManualId(sub.id); setShowCreateForm(false) }}
                      onDelete={() => handleDeleteManual(sub.id)}
                    />
                  )}
                </div>
              ))}
            </>
          )}

          {/* Section: Unconfirmed detected subscriptions */}
          {sortedUnconfirmed.length > 0 && (
            <>
              <div className="flex items-center gap-2 pt-3">
                <AlertTriangle className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">
                  Detected ({sortedUnconfirmed.length})
                </span>
              </div>
              {sortedUnconfirmed.map((sub, i) => (
                <motion.div
                  key={`detected-${sub.id}`}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.04 }}
                >
                  <SubscriptionCard
                    sub={sub}
                    isConfirmed={false}
                    onToggleConfirm={() => handleToggleConfirm(String(sub.id))}
                  />
                </motion.div>
              ))}
            </>
          )}
        </div>
      )}
    </motion.div>
  )
}
