import { useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Trash2, Pencil, Check, X, Power, PowerOff,
  ArrowDownCircle, ArrowUpCircle, TrendingUp, Hash,
  RefreshCw, Calendar,
} from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/ui'
import { formatCurrency } from '@/lib/formatters'
import { useDemoGuard } from '@/hooks/useDemoGuard'
import {
  useRecurringTransactions,
  useCreateRecurringTransaction,
  useUpdateRecurringTransaction,
  useDeleteRecurringTransaction,
} from '@/hooks/api/useAnalyticsV2'
import type { RecurringTransaction } from '@/hooks/api/useAnalyticsV2'
import { SummaryCard } from './components/SummaryCard'
import { toMonthlyAmount, capitalize, formatDate } from './helpers'

// ── Suggestions ──────────────────────────────────────────────────────────────

interface Suggestion {
  name: string
  type: 'Income' | 'Expense'
  frequency: string
  category: string
}

const SUGGESTIONS: Suggestion[] = [
  { name: 'Salary', type: 'Income', frequency: 'monthly', category: 'Salary' },
  { name: 'Freelance Income', type: 'Income', frequency: 'monthly', category: 'Freelance' },
  { name: 'Rental Income', type: 'Income', frequency: 'monthly', category: 'Rental Income' },
  { name: 'Family Support', type: 'Expense', frequency: 'monthly', category: 'Family' },
  { name: 'House Rent', type: 'Expense', frequency: 'monthly', category: 'Housing' },
  { name: 'Electricity Bill', type: 'Expense', frequency: 'monthly', category: 'Utilities' },
  { name: 'WiFi / Internet', type: 'Expense', frequency: 'monthly', category: 'Utilities' },
  { name: 'Water Bill', type: 'Expense', frequency: 'monthly', category: 'Utilities' },
  { name: 'Gas Bill', type: 'Expense', frequency: 'monthly', category: 'Utilities' },
  { name: 'Maid', type: 'Expense', frequency: 'monthly', category: 'Housing' },
  { name: 'Cook', type: 'Expense', frequency: 'monthly', category: 'Housing' },
  { name: 'Society Maintenance', type: 'Expense', frequency: 'monthly', category: 'Housing' },
  { name: 'Netflix / OTT', type: 'Expense', frequency: 'monthly', category: 'Entertainment' },
  { name: 'Gym Membership', type: 'Expense', frequency: 'monthly', category: 'Health' },
  { name: 'Insurance Premium', type: 'Expense', frequency: 'yearly', category: 'Insurance' },
  { name: 'SIP / Investment', type: 'Expense', frequency: 'monthly', category: 'Investment' },
  { name: 'EMI', type: 'Expense', frequency: 'monthly', category: 'Loan' },
  { name: 'Mobile Recharge', type: 'Expense', frequency: 'monthly', category: 'Utilities' },
]

const FREQUENCY_OPTIONS = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Biweekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'bimonthly', label: 'Bimonthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'semiannual', label: 'Semi-annual' },
  { value: 'yearly', label: 'Yearly' },
]

// ── Add Form ─────────────────────────────────────────────────────────────────

function AddRecurringForm({
  onSave,
  onCancel,
  initial,
}: Readonly<{
  onSave: (data: { name: string; type: string; frequency: string; amount: number; category?: string }) => void
  onCancel: () => void
  initial?: Suggestion
}>) {
  const [name, setName] = useState(initial?.name ?? '')
  const [type, setType] = useState<string>(initial?.type ?? 'Expense')
  const [frequency, setFrequency] = useState(initial?.frequency ?? 'monthly')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState(initial?.category ?? '')

  const handleSubmit = () => {
    if (!name.trim()) { toast.error('Name is required'); return }
    const amt = Number(amount)
    if (Number.isNaN(amt) || amt <= 0) { toast.error('Enter a valid amount'); return }
    onSave({ name: name.trim(), type, frequency, amount: amt, category: category.trim() || undefined })
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className="glass rounded-2xl border border-app-blue/30 p-6 space-y-4">
        <p className="text-sm font-medium text-white">Add Recurring Transaction</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="sm:col-span-2 lg:col-span-1">
            <label htmlFor="add-name" className="text-xs text-text-tertiary block mb-1">Name</label>
            <input id="add-name" type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. House Rent" autoFocus
              className="w-full px-3 py-2 bg-surface-dropdown/80 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-app-blue/50" />
          </div>
          <div>
            <label htmlFor="add-type" className="text-xs text-text-tertiary block mb-1">Type</label>
            <select id="add-type" value={type} onChange={(e) => setType(e.target.value)}
              className="w-full px-3 py-2 bg-surface-dropdown/80 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-app-blue/50">
              <option value="Expense">Expense</option>
              <option value="Income">Income</option>
            </select>
          </div>
          <div>
            <label htmlFor="add-freq" className="text-xs text-text-tertiary block mb-1">Frequency</label>
            <select id="add-freq" value={frequency} onChange={(e) => setFrequency(e.target.value)}
              className="w-full px-3 py-2 bg-surface-dropdown/80 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-app-blue/50">
              {FREQUENCY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="add-amt" className="text-xs text-text-tertiary block mb-1">Amount</label>
            <input id="add-amt" type="number" min={0} step="any" value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder="Per cycle"
              className="w-full px-3 py-2 bg-surface-dropdown/80 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-app-blue/50" />
          </div>
          <div>
            <label htmlFor="add-cat" className="text-xs text-text-tertiary block mb-1">Category (optional)</label>
            <input id="add-cat" type="text" value={category} onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Housing"
              className="w-full px-3 py-2 bg-surface-dropdown/80 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-app-blue/50" />
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={handleSubmit}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-app-blue/20 text-app-blue hover:bg-app-blue/30 transition-colors">
            <Check className="w-3.5 h-3.5" /> Add
          </button>
          <button type="button" onClick={onCancel}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm text-muted-foreground bg-white/5 hover:bg-white/10 transition-colors">
            <X className="w-3.5 h-3.5" /> Cancel
          </button>
        </div>
      </div>
    </motion.div>
  )
}

// ── Recurring Card ───────────────────────────────────────────────────────────

function RecurringCard({
  item,
  onUpdate,
  onDelete,
}: Readonly<{
  item: RecurringTransaction
  onUpdate: (patch: { pattern_name?: string; frequency?: string; expected_amount?: number; is_active?: boolean }) => void
  onDelete: () => void
}>) {
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(item.name)
  const [editFreq, setEditFreq] = useState(item.frequency ?? 'monthly')
  const [editAmt, setEditAmt] = useState(String(Math.abs(item.expected_amount)))

  const monthly = toMonthlyAmount(item.expected_amount, item.frequency)
  const isIncome = item.type === 'Income'

  const saveEdit = () => {
    const amt = Number(editAmt)
    if (!editName.trim() || Number.isNaN(amt) || amt <= 0) return
    onUpdate({ pattern_name: editName.trim(), frequency: editFreq, expected_amount: amt })
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="glass rounded-2xl border border-app-blue/30 p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label htmlFor={`e-n-${item.id}`} className="text-xs text-text-tertiary block mb-1">Name</label>
            <input id={`e-n-${item.id}`} type="text" value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus
              className="w-full px-3 py-1.5 bg-surface-dropdown/80 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-app-blue/50" />
          </div>
          <div>
            <label htmlFor={`e-f-${item.id}`} className="text-xs text-text-tertiary block mb-1">Frequency</label>
            <select id={`e-f-${item.id}`} value={editFreq} onChange={(e) => setEditFreq(e.target.value)}
              className="w-full px-3 py-1.5 bg-surface-dropdown/80 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-app-blue/50">
              {FREQUENCY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
        <div className="max-w-[200px]">
          <label htmlFor={`e-a-${item.id}`} className="text-xs text-text-tertiary block mb-1">Amount</label>
          <input id={`e-a-${item.id}`} type="number" min={0} step="any" value={editAmt} onChange={(e) => setEditAmt(e.target.value)}
            className="w-full px-3 py-1.5 bg-surface-dropdown/80 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-app-blue/50" />
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={saveEdit} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium bg-app-blue/20 text-app-blue hover:bg-app-blue/30 transition-colors">
            <Check className="w-3.5 h-3.5" /> Save
          </button>
          <button type="button" onClick={() => setEditing(false)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm text-muted-foreground bg-white/5 hover:bg-white/10 transition-colors">
            <X className="w-3.5 h-3.5" /> Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`glass rounded-2xl border p-4 transition-colors duration-200 ${
      item.is_active ? 'border-border hover:border-white/20' : 'border-white/5 opacity-50'
    }`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-2 h-8 rounded-full shrink-0 ${isIncome ? 'bg-app-green' : 'bg-app-red'}`} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-medium text-white truncate">{item.name}</h3>
              <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${isIncome ? 'bg-app-green/10 text-app-green' : 'bg-app-red/10 text-app-red'}`}>
                {item.type}
              </span>
              <span className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-app-blue/10 text-app-blue">
                {capitalize(item.frequency)}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-0.5 text-xs text-text-tertiary">
              {item.category && <span>{item.category}</span>}
              {item.last_occurrence && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Last: {formatDate(item.last_occurrence)}
                </span>
              )}
              {item.next_expected && (
                <span className="flex items-center gap-1">
                  <RefreshCw className="w-3 h-3" /> Next: {formatDate(item.next_expected)}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <p className={`text-base font-bold ${isIncome ? 'text-app-green' : 'text-app-red'}`}>
              {formatCurrency(Math.abs(item.expected_amount))}
            </p>
            <p className="text-[11px] text-muted-foreground">{formatCurrency(monthly)}/mo</p>
          </div>
          <div className="flex items-center gap-0.5">
            <button type="button" onClick={() => { setEditName(item.name); setEditFreq(item.frequency ?? 'monthly'); setEditAmt(String(Math.abs(item.expected_amount))); setEditing(true) }}
              title="Edit" className="p-1.5 rounded-lg text-text-tertiary hover:text-white hover:bg-white/10 transition-colors">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => onUpdate({ is_active: !item.is_active })}
              title={item.is_active ? 'Deactivate' : 'Activate'}
              className={`p-1.5 rounded-lg transition-colors ${item.is_active ? 'text-app-green hover:bg-app-green/10' : 'text-text-tertiary hover:bg-white/10'}`}>
              {item.is_active ? <Power className="w-3.5 h-3.5" /> : <PowerOff className="w-3.5 h-3.5" />}
            </button>
            <button type="button" onClick={onDelete}
              title="Delete" className="p-1.5 rounded-lg text-text-tertiary hover:text-app-red hover:bg-red-500/10 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function SubscriptionTrackerPage() {
  const { data: items = [], isLoading } = useRecurringTransactions({ active_only: false, min_confidence: 0 })
  const createMutation = useCreateRecurringTransaction()
  const updateMutation = useUpdateRecurringTransaction()
  const deleteMutation = useDeleteRecurringTransaction()

  const [showForm, setShowForm] = useState(false)
  const [suggestion, setSuggestion] = useState<Suggestion | undefined>()

  // Only user-confirmed items (manually created ones have is_confirmed=true)
  const confirmed = useMemo(() => items.filter((i) => i.is_confirmed), [items])
  const active = useMemo(() => confirmed.filter((i) => i.is_active), [confirmed])
  const inactive = useMemo(() => confirmed.filter((i) => !i.is_active), [confirmed])

  const summary = useMemo(() => {
    const expenses = active.filter((s) => s.type === 'Expense')
    const incomes = active.filter((s) => s.type === 'Income')
    const monthlyExpense = expenses.reduce((s, i) => s + toMonthlyAmount(i.expected_amount, i.frequency), 0)
    const monthlyIncome = incomes.reduce((s, i) => s + toMonthlyAmount(i.expected_amount, i.frequency), 0)
    return {
      monthlyExpense,
      monthlyIncome,
      netMonthly: monthlyIncome - monthlyExpense,
      count: active.length,
    }
  }, [active])

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

  const p = isLoading ? '...' : undefined

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Recurring Transactions"
          subtitle="Track your regular income and expenses for projected cash flow"
          action={
            <button type="button" onClick={() => { setSuggestion(undefined); setShowForm(true) }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white bg-app-blue hover:bg-app-blue/80 transition-colors">
              <Plus className="w-4 h-4" /> Add Recurring
            </button>
          }
        />

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <SummaryCard icon={ArrowDownCircle} label="Monthly Expense" value={p ?? formatCurrency(summary.monthlyExpense)}
            colorClass="text-app-red" bgClass="bg-app-red/20" shadowClass="shadow-app-red/30" delay={0.1} />
          <SummaryCard icon={ArrowUpCircle} label="Monthly Income" value={p ?? formatCurrency(summary.monthlyIncome)}
            colorClass="text-app-green" bgClass="bg-app-green/20" shadowClass="shadow-app-green/30" delay={0.2} />
          <SummaryCard icon={TrendingUp} label="Net Monthly"
            value={p ?? formatCurrency(summary.netMonthly)}
            colorClass={summary.netMonthly >= 0 ? 'text-app-green' : 'text-app-red'}
            bgClass={summary.netMonthly >= 0 ? 'bg-app-green/20' : 'bg-app-red/20'}
            shadowClass={summary.netMonthly >= 0 ? 'shadow-app-green/30' : 'shadow-app-red/30'} delay={0.3} />
          <SummaryCard icon={Hash} label="Active Recurring" value={p ?? `${summary.count}`}
            colorClass="text-app-blue" bgClass="bg-app-blue/20" shadowClass="shadow-app-blue/30" delay={0.4} />
        </div>

        {/* Suggestions */}
        {!showForm && confirmed.length === 0 && !isLoading && (
          <div className="glass rounded-2xl border border-border p-6 space-y-3">
            <p className="text-sm font-medium text-white">Quick Add -- common recurring transactions</p>
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
                className="px-2.5 py-1 rounded-md text-[11px] font-medium text-muted-foreground bg-white/5 hover:bg-white/10 hover:text-white transition-colors">
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
            <p className="text-sm font-medium text-white">Active ({active.length})</p>
            {active.map((item) => (
              <motion.div key={item.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <RecurringCard
                  item={item}
                  onUpdate={(patch) => handleUpdate(item.id, patch)}
                  onDelete={() => handleDelete(item.id, item.name)}
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
                  onDelete={() => handleDelete(item.id, item.name)}
                />
              </motion.div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && confirmed.length === 0 && !showForm && (
          <div className="text-center py-12 text-muted-foreground">
            <RefreshCw className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No recurring transactions yet. Add your first one above.</p>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-20 rounded-xl bg-white/5 animate-pulse" />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
