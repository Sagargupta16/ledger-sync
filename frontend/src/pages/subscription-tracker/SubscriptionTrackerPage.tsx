import { useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, PowerOff,
  ArrowDownCircle, ArrowUpCircle, TrendingUp, Hash,
  RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'
import { PageContainer, PageHeader, ConfirmDialog } from '@/components/ui'
import { formatCurrency } from '@/lib/formatters'
import EmptyState from '@/components/shared/EmptyState'
import { CardGridSkeleton } from '@/components/shared/LoadingSkeleton'
import { useDemoGuard } from '@/hooks/useDemoGuard'
import {
  useRecurringTransactions,
  useCreateRecurringTransaction,
  useUpdateRecurringTransaction,
  useDeleteRecurringTransaction,
} from '@/hooks/api/useAnalyticsV2'
import SummaryCard from '@/components/shared/SummaryCard'
import { toMonthlyAmount } from './helpers'
import { SUGGESTIONS } from './constants'
import type { Suggestion } from './types'
import { AddRecurringForm } from './components/AddRecurringForm'
import { RecurringCard } from './components/RecurringCard'

export default function SubscriptionTrackerPage() {
  const { data: items = [], isLoading } = useRecurringTransactions({ active_only: false, min_confidence: 0 })
  const createMutation = useCreateRecurringTransaction()
  const updateMutation = useUpdateRecurringTransaction()
  const deleteMutation = useDeleteRecurringTransaction()

  const [showForm, setShowForm] = useState(false)
  const [suggestion, setSuggestion] = useState<Suggestion | undefined>()
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null)

  // Only user-confirmed items (manually created ones have is_confirmed=true)
  const confirmed = useMemo(() => items.filter((i) => i.is_confirmed), [items])
  // Active items sorted by monthly-equivalent amount DESC so the biggest drains
  // (and biggest income) surface first -- implicit ranking, no extra viz.
  const active = useMemo(
    () =>
      [...confirmed]
        .filter((i) => i.is_active)
        .sort(
          (a, b) =>
            toMonthlyAmount(b.expected_amount, b.frequency) -
            toMonthlyAmount(a.expected_amount, a.frequency),
        ),
    [confirmed],
  )
  const inactive = useMemo(() => confirmed.filter((i) => !i.is_active), [confirmed])

  const summary = useMemo(() => {
    const expenses = active.filter((s) => s.type === 'Expense')
    const incomes = active.filter((s) => s.type === 'Income')
    const monthlyExpense = expenses.reduce((s, i) => s + toMonthlyAmount(i.expected_amount, i.frequency), 0)
    const monthlyIncome = incomes.reduce((s, i) => s + toMonthlyAmount(i.expected_amount, i.frequency), 0)
    // Savings from deactivated Expense items = monthly cost they WOULD be
    // charging us if the user hadn't marked them deactivated (cancelled a
    // subscription, paid off an EMI, stopped a gym, etc). Income-typed
    // inactive items don't count -- those represent lost income, not savings.
    const deactivatedExpenseSavings = inactive
      .filter((s) => s.type === 'Expense')
      .reduce((s, i) => s + toMonthlyAmount(i.expected_amount, i.frequency), 0)
    return {
      monthlyExpense,
      monthlyIncome,
      netMonthly: monthlyIncome - monthlyExpense,
      count: active.length,
      deactivatedExpenseSavings,
      deactivatedCount: inactive.filter((s) => s.type === 'Expense').length,
    }
  }, [active, inactive])

  const { guardDemoAction } = useDemoGuard()

  const handleCreate = useCallback((data: { name: string; type: string; frequency: string; amount: number; category?: string }) => {
    if (guardDemoAction('Creating recurring items')) return
    createMutation.mutate(data, {
      onSuccess: () => { toast.success(`Added ${data.name}`); setShowForm(false); setSuggestion(undefined) },
    })
  }, [createMutation, guardDemoAction])

  const handleUpdate = useCallback((id: number, patch: Record<string, unknown>) => {
    if (guardDemoAction('Editing recurring items')) return
    updateMutation.mutate({ id, ...patch }, {
      onSuccess: () => toast.success('Updated'),
    })
  }, [updateMutation, guardDemoAction])

  const handleDelete = useCallback((id: number, name: string) => {
    if (guardDemoAction('Deleting recurring items')) return
    deleteMutation.mutate(id, {
      onSuccess: () => toast.success(`Removed ${name}`),
    })
  }, [deleteMutation, guardDemoAction])

  const openWithSuggestion = (s: Suggestion) => {
    setSuggestion(s)
    setShowForm(true)
  }

  return (
    <PageContainer>
        <PageHeader
          title="Recurring"
          subtitle="Track your regular income and expenses for projected cash flow"
          action={
            <button type="button" onClick={() => { setSuggestion(undefined); setShowForm(true) }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-on-accent bg-app-blue hover:bg-app-blue/80 transition-colors">
              <Plus className="w-4 h-4" /> Add Recurring
            </button>
          }
        />

        {/* Summary Cards -- 5 columns only when the optional savings card is present,
            otherwise 4 so the row stays gapless. */}
        {isLoading ? (
          <CardGridSkeleton count={4} cols="grid-cols-1 sm:grid-cols-2 lg:grid-cols-4" />
        ) : (
          <div className={`grid grid-cols-2 gap-3 sm:gap-5 ${summary.deactivatedCount > 0 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
            <SummaryCard icon={ArrowDownCircle} label="Monthly Expense" value={formatCurrency(summary.monthlyExpense)}
              colorClass="text-app-red" bgClass="bg-app-red/20" shadowClass="shadow-app-red/30" delay={0.1} compact />
            <SummaryCard icon={ArrowUpCircle} label="Monthly Income" value={formatCurrency(summary.monthlyIncome)}
              colorClass="text-app-green" bgClass="bg-app-green/20" shadowClass="shadow-app-green/30" delay={0.2} compact />
            <SummaryCard icon={TrendingUp} label="Net Monthly"
              value={formatCurrency(summary.netMonthly)}
              colorClass={summary.netMonthly >= 0 ? 'text-app-green' : 'text-app-red'}
              bgClass={summary.netMonthly >= 0 ? 'bg-app-green/20' : 'bg-app-red/20'}
              shadowClass={summary.netMonthly >= 0 ? 'shadow-app-green/30' : 'shadow-app-red/30'} delay={0.3} compact />
            <SummaryCard icon={Hash} label="Active Recurring" value={`${summary.count}`}
              colorClass="text-app-blue" bgClass="bg-app-blue/20" shadowClass="shadow-app-blue/30" delay={0.4} compact />
            {/* Savings-from-cancellations -- only show once the user has
                deactivated at least one expense item, otherwise it's a confusing
                "-" card. */}
            {summary.deactivatedCount > 0 && (
              <SummaryCard
                icon={PowerOff}
                label={`Saved / mo (${summary.deactivatedCount} cancelled)`}
                value={formatCurrency(summary.deactivatedExpenseSavings)}
                colorClass="text-app-purple"
                bgClass="bg-app-purple/20"
                shadowClass="shadow-app-purple/30"
                delay={0.5}
                compact
              />
            )}
          </div>
        )}

        {/* Recurring income vs expense -- one 100% stacked strip showing what
            share of fixed monthly income the recurring expenses consume.
            Reuses the totals already computed; no extra fetch, no second chart. */}
        {!isLoading && active.length > 0 && summary.monthlyExpense + summary.monthlyIncome > 0 && (
          <div className="glass rounded-2xl border border-border p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">Recurring mix</span>
              {summary.monthlyIncome > 0 && (
                <span className="text-text-tertiary">
                  Fixed expenses use{' '}
                  <span
                    className={
                      summary.monthlyExpense > summary.monthlyIncome ? 'text-app-red' : 'text-foreground'
                    }
                  >
                    {Math.round((summary.monthlyExpense / summary.monthlyIncome) * 100)}%
                  </span>{' '}
                  of recurring income
                </span>
              )}
            </div>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-[var(--overlay-3)]">
              <div
                className="h-full bg-app-green transition-[width] duration-500"
                style={{
                  width: `${(summary.monthlyIncome / (summary.monthlyIncome + summary.monthlyExpense)) * 100}%`,
                }}
              />
              <div
                className="h-full bg-app-red transition-[width] duration-500"
                style={{
                  width: `${(summary.monthlyExpense / (summary.monthlyIncome + summary.monthlyExpense)) * 100}%`,
                }}
              />
            </div>
            <div className="flex items-center gap-4 text-[11px] text-text-tertiary">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-app-green" /> Income{' '}
                {formatCurrency(summary.monthlyIncome)}/mo
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-app-red" /> Expense{' '}
                {formatCurrency(summary.monthlyExpense)}/mo
              </span>
            </div>
          </div>
        )}

        {/* Suggestions */}
        {!showForm && confirmed.length === 0 && !isLoading && (
          <div className="glass rounded-2xl border border-border p-6 space-y-3">
            <p className="text-sm font-medium text-foreground">Quick Add -- common recurring transactions</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s.name} type="button" onClick={() => openWithSuggestion(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    s.type === 'Income'
                      ? 'border-app-green/20 text-app-green bg-app-green/5 hover:bg-app-green/15'
                      : 'border-app-red/20 text-app-red bg-app-red/5 hover:bg-app-red/15'
                  }`}>
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Always show suggestions as a compact row when items exist */}
        {!showForm && confirmed.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-text-tertiary">Quick add:</span>
            {SUGGESTIONS.slice(0, 8).map((s) => (
              <button key={s.name} type="button" onClick={() => openWithSuggestion(s)}
                className="px-2.5 py-1 rounded-md text-[11px] font-medium text-muted-foreground bg-[var(--overlay-2)] hover:bg-[var(--overlay-5)] hover:text-foreground transition-colors">
                + {s.name}
              </button>
            ))}
          </div>
        )}

        {/* Add Form */}
        <AnimatePresence>
          {showForm && (
            <AddRecurringForm
              initial={suggestion}
              onSave={handleCreate}
              onCancel={() => { setShowForm(false); setSuggestion(undefined) }}
            />
          )}
        </AnimatePresence>

        {/* Active list */}
        {!isLoading && active.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Active ({active.length})</p>
            {active.map((item) => (
              <motion.div key={item.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <RecurringCard
                  item={item}
                  onUpdate={(patch) => handleUpdate(item.id, patch)}
                  onDelete={() => setDeleteTarget({ id: item.id, name: item.name })}
                />
              </motion.div>
            ))}
          </div>
        )}

        {/* Inactive list */}
        {!isLoading && inactive.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-text-tertiary">Inactive ({inactive.length})</p>
            {inactive.map((item) => (
              <motion.div key={item.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <RecurringCard
                  item={item}
                  onUpdate={(patch) => handleUpdate(item.id, patch)}
                  onDelete={() => setDeleteTarget({ id: item.id, name: item.name })}
                />
              </motion.div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && confirmed.length === 0 && !showForm && (
          <EmptyState
            icon={RefreshCw}
            title="No recurring transactions yet"
            description="Add your regular income and bills to project monthly cash flow, or pick one from Quick Add above."
            actionLabel="Add Recurring"
            onAction={() => { setSuggestion(undefined); setShowForm(true) }}
            variant="card"
          />
        )}

        {/* Loading */}
        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-20 rounded-xl bg-[var(--overlay-2)] animate-pulse" />
            ))}
          </div>
        )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
        title="Delete recurring transaction"
        description={`Remove "${deleteTarget?.name ?? ''}"? This stops it from appearing in projected cash flow.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => { if (deleteTarget) handleDelete(deleteTarget.id, deleteTarget.name) }}
      />
    </PageContainer>
  )
}
