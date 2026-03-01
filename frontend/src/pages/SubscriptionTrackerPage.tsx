import { useMemo, useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CreditCard,
  DollarSign,
  Calendar,
  Hash,
  ArrowUpDown,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Plus,
  Save,
  X,
  Pencil,
  Trash2,
  UserPlus,
} from 'lucide-react'
import { useRecurringTransactions } from '@/hooks/api/useAnalyticsV2'
import type { RecurringTransaction } from '@/hooks/api/useAnalyticsV2'
import { PageHeader } from '@/components/ui'
import { formatCurrency } from '@/lib/formatters'
import { rawColors } from '@/constants/colors'
import { SCROLL_FADE_UP, staggerContainer, fadeUpItem, fadeUpWithDelay } from '@/constants/animations'
import EmptyState from '@/components/shared/EmptyState'
import { toast } from 'sonner'

// ---------------------------------------------------------------------------
// localStorage keys (shared with BillCalendarPage)
// ---------------------------------------------------------------------------

const CONFIRMED_SUBS_KEY = 'ledger-sync-confirmed-subscriptions'
const MANUAL_SUBS_KEY = 'ledger-sync-manual-subscriptions'

// ---------------------------------------------------------------------------
// Manual subscription type
// ---------------------------------------------------------------------------

export interface ManualSubscription {
  id: string
  name: string
  amount: number
  frequency: string
  next_due: string
  category?: string
}

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

function loadConfirmedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(CONFIRMED_SUBS_KEY)
    if (!raw) return new Set()
    return new Set(JSON.parse(raw) as string[])
  } catch {
    return new Set()
  }
}

function saveConfirmedIds(ids: Set<string>): void {
  try {
    localStorage.setItem(CONFIRMED_SUBS_KEY, JSON.stringify([...ids]))
  } catch {
    // Storage full or unavailable; ignore
  }
}

function loadManualSubscriptions(): ManualSubscription[] {
  try {
    const raw = localStorage.getItem(MANUAL_SUBS_KEY)
    if (!raw) return []
    return JSON.parse(raw) as ManualSubscription[]
  } catch {
    return []
  }
}

function saveManualSubscriptions(subs: ManualSubscription[]): void {
  try {
    localStorage.setItem(MANUAL_SUBS_KEY, JSON.stringify(subs))
  } catch {
    // Storage full or unavailable; ignore
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type SortKey = 'amount' | 'name' | 'last_occurrence' | 'annual_cost'

/** Frequency label to annual multiplier */
function getAnnualFactor(frequency: string | null): number {
  switch (frequency?.toLowerCase()) {
    case 'weekly':
      return 52
    case 'fortnightly':
    case 'biweekly':
      return 26
    case 'monthly':
      return 12
    case 'quarterly':
      return 4
    case 'yearly':
    case 'annually':
      return 1
    default:
      return 12 // default to monthly if unknown
  }
}

/** Expected interval in days for a given frequency */
function getExpectedIntervalDays(frequency: string | null): number {
  switch (frequency?.toLowerCase()) {
    case 'weekly':
      return 7
    case 'fortnightly':
    case 'biweekly':
      return 14
    case 'monthly':
      return 30
    case 'quarterly':
      return 90
    case 'yearly':
    case 'annually':
      return 365
    default:
      return 30
  }
}

/** Convert any frequency amount to a monthly equivalent */
function toMonthlyAmount(amount: number, frequency: string | null): number {
  const annualFactor = getAnnualFactor(frequency)
  return (Math.abs(amount) * annualFactor) / 12
}

/** Determine status based on last occurrence and expected frequency */
function getSubscriptionStatus(
  lastOccurrence: string | null,
  frequency: string | null,
): 'active' | 'possibly_inactive' {
  if (!lastOccurrence) return 'possibly_inactive'
  const daysSinceLast = (Date.now() - new Date(lastOccurrence).getTime()) / (1000 * 60 * 60 * 24)
  const expectedInterval = getExpectedIntervalDays(frequency)
  return daysSinceLast > expectedInterval * 2 ? 'possibly_inactive' : 'active'
}

/** Format a date string as a readable date */
function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'N/A'
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** Capitalize first letter of a string */
function capitalize(str: string | null): string {
  if (!str) return 'Unknown'
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

/** Return the confidence indicator color based on percentage threshold */
function getConfidenceColor(percent: number, colors: { green: string; yellow: string; red: string }): string {
  if (percent >= 80) return colors.green
  if (percent >= 50) return colors.yellow
  return colors.red
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Summary card at the top */
function SummaryCard({
  icon: Icon,
  label,
  value,
  colorClass,
  bgClass,
  shadowClass,
  delay,
}: Readonly<{
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  colorClass: string
  bgClass: string
  shadowClass: string
  delay: number
}>) {
  return (
    <motion.div {...fadeUpWithDelay(delay)} className="glass rounded-xl border border-border p-6 shadow-lg">
      <div className="flex items-center gap-3">
        <div className={`p-3 ${bgClass} rounded-xl shadow-lg ${shadowClass}`}>
          <Icon className={`w-6 h-6 ${colorClass}`} />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold text-white">{value}</p>
        </div>
      </div>
    </motion.div>
  )
}

/** Confidence score visual indicator */
function ConfidenceIndicator({ confidence }: Readonly<{ confidence: number }>) {
  const percent = Math.round(confidence * 100)
  const color = getConfidenceColor(percent, rawColors.ios)

  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.6, ease: 'easeOut', delay: 0.2 }}
          style={{ backgroundColor: color }}
        />
      </div>
      <span className="text-xs text-muted-foreground">{percent}%</span>
    </div>
  )
}

/** Status badge for detected subscriptions */
function StatusBadge({ status }: Readonly<{ status: 'active' | 'possibly_inactive' }>) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-ios-green/15 text-ios-green">
        <CheckCircle2 className="w-3 h-3" />
        Active
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
      <AlertTriangle className="w-3 h-3" />
      Possibly Inactive
    </span>
  )
}

/** Confirm/unconfirm badge toggle button */
function ConfirmBadge({
  isConfirmed,
  onToggle,
}: Readonly<{
  isConfirmed: boolean
  onToggle: () => void
}>) {
  if (isConfirmed) {
    return (
      <button
        onClick={onToggle}
        title="Confirmed as active subscription. Click to unconfirm."
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-ios-green/15 text-ios-green hover:bg-ios-green/25 transition-colors"
      >
        <CheckCircle2 className="w-3 h-3" />
        Confirmed
      </button>
    )
  }
  return (
    <button
      onClick={onToggle}
      title="Click to confirm as active subscription"
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-white transition-colors"
    >
      <CheckCircle2 className="w-3 h-3" />
      Detected
    </button>
  )
}

/** "Manual" badge for manually added subscriptions */
function ManualBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-ios-purple/15 text-ios-purple">
      <UserPlus className="w-3 h-3" />
      Manual
    </span>
  )
}

/** Single detected subscription card */
function SubscriptionCard({
  sub,
  isConfirmed,
  onToggleConfirm,
}: Readonly<{
  sub: RecurringTransaction
  isConfirmed: boolean
  onToggleConfirm: () => void
}>) {
  const monthlyAmount = toMonthlyAmount(sub.expected_amount, sub.frequency)
  const annualCost = Math.abs(sub.expected_amount) * getAnnualFactor(sub.frequency)
  const status = getSubscriptionStatus(sub.last_occurrence, sub.frequency)

  return (
    <motion.div
      variants={fadeUpItem}
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
    </motion.div>
  )
}

/** Manual subscription card */
function ManualSubscriptionCard({
  sub,
  onEdit,
  onDelete,
}: Readonly<{
  sub: ManualSubscription
  onEdit: () => void
  onDelete: () => void
}>) {
  const monthlyAmount = toMonthlyAmount(sub.amount, sub.frequency)
  const annualCost = Math.abs(sub.amount) * getAnnualFactor(sub.frequency)

  return (
    <motion.div
      variants={fadeUpItem}
      className="glass rounded-xl border border-ios-purple/20 p-5 hover:border-ios-purple/30 hover:bg-white/[0.04] transition-colors duration-200"
    >
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
    </motion.div>
  )
}

/** Inline form for creating / editing a manual subscription */
function ManualSubscriptionForm({
  initial,
  onSave,
  onCancel,
  isEdit,
}: Readonly<{
  initial?: ManualSubscription
  onSave: (data: Omit<ManualSubscription, 'id'>) => void
  onCancel: () => void
  isEdit?: boolean
}>) {
  const [name, setName] = useState(initial?.name ?? '')
  const [amount, setAmount] = useState(initial?.amount != null ? String(initial.amount) : '')
  const [frequency, setFrequency] = useState(initial?.frequency ?? 'monthly')
  const [nextDue, setNextDue] = useState(initial?.next_due ?? '')
  const [category, setCategory] = useState(initial?.category ?? '')

  const handleSave = () => {
    if (!name.trim()) {
      toast.error('Subscription name is required')
      return
    }
    const numAmount = Number(amount)
    if (Number.isNaN(numAmount) || numAmount <= 0) {
      toast.error('Please enter a valid positive amount')
      return
    }
    onSave({
      name: name.trim(),
      amount: numAmount,
      frequency,
      next_due: nextDue,
      category: category.trim() || undefined,
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className="glass rounded-2xl border border-border p-6 space-y-4">
        <h3 className="text-lg font-semibold text-white">
          {isEdit ? 'Edit Subscription' : 'Add Manual Subscription'}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="manual-sub-name" className="text-xs text-text-tertiary mb-1 block">Name *</label>
            <input
              id="manual-sub-name"
              type="text"
              placeholder="e.g. Netflix, Spotify"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 bg-surface-dropdown/80 border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-ios-purple/50"
              autoFocus
            />
          </div>
          <div>
            <label htmlFor="manual-sub-amount" className="text-xs text-text-tertiary mb-1 block">Amount *</label>
            <input
              id="manual-sub-amount"
              type="number"
              placeholder="Amount per cycle"
              min={0}
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-4 py-2.5 bg-surface-dropdown/80 border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-ios-purple/50"
            />
          </div>
          <div>
            <label htmlFor="manual-sub-frequency" className="text-xs text-text-tertiary mb-1 block">Frequency</label>
            <select
              id="manual-sub-frequency"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              className="w-full px-4 py-2.5 bg-surface-dropdown/80 border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-ios-purple/50"
            >
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>
          <div>
            <label htmlFor="manual-sub-due" className="text-xs text-text-tertiary mb-1 block">Next Due Date</label>
            <input
              id="manual-sub-due"
              type="date"
              value={nextDue}
              onChange={(e) => setNextDue(e.target.value)}
              className="w-full px-4 py-2.5 bg-surface-dropdown/80 border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-ios-purple/50"
            />
          </div>
        </div>
        <div>
          <label htmlFor="manual-sub-category" className="text-xs text-text-tertiary mb-1 block">Category (optional)</label>
          <input
            id="manual-sub-category"
            type="text"
            placeholder="e.g. Entertainment, Bills & Utilities"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-4 py-2.5 bg-surface-dropdown/80 border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-ios-purple/50"
          />
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleSave}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium text-white transition-colors hover:opacity-90"
            style={{ background: `linear-gradient(135deg, ${rawColors.ios.green}, ${rawColors.ios.teal})` }}
          >
            <Save className="w-4 h-4" />
            {isEdit ? 'Save Changes' : 'Add Subscription'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm text-muted-foreground bg-white/5 border border-border hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" /> Cancel
          </button>
        </div>
      </div>
    </motion.div>
  )
}

/** Sort button */
function SortButton({
  label,
  sortKey,
  currentSort,
  onSort,
}: Readonly<{
  label: string
  sortKey: SortKey
  currentSort: SortKey
  onSort: (key: SortKey) => void
}>) {
  const isActive = currentSort === sortKey
  return (
    <button
      onClick={() => onSort(sortKey)}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors duration-200 ${
        isActive
          ? 'bg-ios-blue/20 text-ios-blue border border-ios-blue/30'
          : 'bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-white border border-transparent'
      }`}
    >
      {label}
      {isActive && <ArrowUpDown className="w-3 h-3" />}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function SubscriptionTrackerPage() {
  const { data: recurringTransactions, isLoading } = useRecurringTransactions({ active_only: true })
  const [sortBy, setSortBy] = useState<SortKey>('amount')
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(loadConfirmedIds)
  const [manualSubs, setManualSubs] = useState<ManualSubscription[]>(loadManualSubscriptions)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingManualId, setEditingManualId] = useState<string | null>(null)

  // Sync from localStorage on mount
  useEffect(() => {
    setConfirmedIds(loadConfirmedIds())
    setManualSubs(loadManualSubscriptions())
  }, [])

  // Filter for expense subscriptions only
  const subscriptions = useMemo(() => {
    if (!recurringTransactions) return []
    return recurringTransactions.filter(
      (t) => t.type === 'Expense',
    )
  }, [recurringTransactions])

  // Toggle confirmed status for a detected subscription
  const handleToggleConfirm = useCallback(
    (id: string) => {
      const updated = new Set(confirmedIds)
      if (updated.has(id)) {
        updated.delete(id)
        toast.success('Subscription unconfirmed')
      } else {
        updated.add(id)
        toast.success('Subscription confirmed as active')
      }
      setConfirmedIds(updated)
      saveConfirmedIds(updated)
    },
    [confirmedIds],
  )

  // Add manual subscription
  const handleAddManual = useCallback(
    (data: Omit<ManualSubscription, 'id'>) => {
      const newSub: ManualSubscription = {
        ...data,
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      }
      const updated = [...manualSubs, newSub]
      setManualSubs(updated)
      saveManualSubscriptions(updated)
      setShowCreateForm(false)
      toast.success('Manual subscription added')
    },
    [manualSubs],
  )

  // Edit manual subscription
  const handleEditManual = useCallback(
    (id: string, data: Omit<ManualSubscription, 'id'>) => {
      const updated = manualSubs.map((s) => (s.id === id ? { ...s, ...data } : s))
      setManualSubs(updated)
      saveManualSubscriptions(updated)
      setEditingManualId(null)
      toast.success('Subscription updated')
    },
    [manualSubs],
  )

  // Delete manual subscription
  const handleDeleteManual = useCallback(
    (id: string) => {
      const updated = manualSubs.filter((s) => s.id !== id)
      setManualSubs(updated)
      saveManualSubscriptions(updated)
      toast.success('Subscription removed')
    },
    [manualSubs],
  )

  // Split detected subscriptions into confirmed and unconfirmed
  const confirmedDetected = useMemo(
    () => subscriptions.filter((s) => confirmedIds.has(String(s.id))),
    [subscriptions, confirmedIds],
  )
  const unconfirmedDetected = useMemo(
    () => subscriptions.filter((s) => !confirmedIds.has(String(s.id))),
    [subscriptions, confirmedIds],
  )

  // Sort a list of detected subscriptions
  const sortDetected = useCallback(
    (list: RecurringTransaction[]) => {
      const sorted = [...list]
      switch (sortBy) {
        case 'amount':
          return sorted.sort((a, b) => Math.abs(b.expected_amount) - Math.abs(a.expected_amount))
        case 'name':
          return sorted.sort((a, b) => a.name.localeCompare(b.name))
        case 'last_occurrence':
          return sorted.sort((a, b) => {
            if (!a.last_occurrence) return 1
            if (!b.last_occurrence) return -1
            return new Date(b.last_occurrence).getTime() - new Date(a.last_occurrence).getTime()
          })
        case 'annual_cost':
          return sorted.sort((a, b) => {
            const aCost = Math.abs(a.expected_amount) * getAnnualFactor(a.frequency)
            const bCost = Math.abs(b.expected_amount) * getAnnualFactor(b.frequency)
            return bCost - aCost
          })
        default:
          return sorted
      }
    },
    [sortBy],
  )

  const sortedConfirmed = useMemo(() => sortDetected(confirmedDetected), [confirmedDetected, sortDetected])
  const sortedUnconfirmed = useMemo(() => sortDetected(unconfirmedDetected), [unconfirmedDetected, sortDetected])

  // Sort manual subscriptions by amount descending (matching default)
  const sortedManual = useMemo(() => {
    const sorted = [...manualSubs]
    switch (sortBy) {
      case 'amount':
        return sorted.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
      case 'name':
        return sorted.sort((a, b) => a.name.localeCompare(b.name))
      case 'annual_cost':
        return sorted.sort((a, b) => {
          const aCost = Math.abs(a.amount) * getAnnualFactor(a.frequency)
          const bCost = Math.abs(b.amount) * getAnnualFactor(b.frequency)
          return bCost - aCost
        })
      default:
        return sorted
    }
  }, [manualSubs, sortBy])

  // Summary calculations: include confirmed detected + manual subscriptions
  const summary = useMemo(() => {
    const confirmedMonthly = confirmedDetected.reduce(
      (sum, s) => sum + toMonthlyAmount(s.expected_amount, s.frequency),
      0,
    )
    const manualMonthly = manualSubs.reduce(
      (sum, s) => sum + toMonthlyAmount(s.amount, s.frequency),
      0,
    )
    const totalMonthly = confirmedMonthly + manualMonthly
    const activeCount = confirmedDetected.length + manualSubs.length
    return {
      totalMonthly,
      totalAnnual: totalMonthly * 12,
      activeCount,
      totalDetected: subscriptions.length,
      average: activeCount > 0 ? totalMonthly / activeCount : 0,
    }
  }, [confirmedDetected, manualSubs, subscriptions])

  const loadingPlaceholder = '...'
  const hasAnySubs = subscriptions.length > 0 || manualSubs.length > 0

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Subscription Tracker"
          subtitle="Track recurring expenses, subscriptions, and bills"
          action={
            <button
              onClick={() => { setShowCreateForm(!showCreateForm); setEditingManualId(null) }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-colors hover:opacity-90"
              style={{ background: `linear-gradient(135deg, ${rawColors.ios.blue}, ${rawColors.ios.indigo})` }}
            >
              <Plus className="w-4 h-4" /> Add Subscription
            </button>
          }
        />

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          <SummaryCard
            icon={DollarSign}
            label="Active Monthly Cost"
            value={isLoading ? loadingPlaceholder : formatCurrency(summary.totalMonthly)}
            colorClass="text-ios-red"
            bgClass="bg-ios-red/20"
            shadowClass="shadow-ios-red/30"
            delay={0.1}
          />
          <SummaryCard
            icon={Calendar}
            label="Annual Projection"
            value={isLoading ? loadingPlaceholder : formatCurrency(summary.totalAnnual)}
            colorClass="text-ios-orange"
            bgClass="bg-ios-orange/20"
            shadowClass="shadow-ios-orange/30"
            delay={0.2}
          />
          <SummaryCard
            icon={Hash}
            label="Active Subscriptions"
            value={isLoading ? loadingPlaceholder : `${summary.activeCount} active`}
            colorClass="text-ios-blue"
            bgClass="bg-ios-blue/20"
            shadowClass="shadow-ios-blue/30"
            delay={0.3}
          />
          <SummaryCard
            icon={CreditCard}
            label="Avg per Subscription"
            value={isLoading ? loadingPlaceholder : formatCurrency(summary.average)}
            colorClass="text-ios-purple"
            bgClass="bg-ios-purple/20"
            shadowClass="shadow-ios-purple/30"
            delay={0.4}
          />
        </div>

        {/* Create Manual Subscription Form */}
        <AnimatePresence>
          {showCreateForm && (
            <ManualSubscriptionForm
              onSave={handleAddManual}
              onCancel={() => setShowCreateForm(false)}
            />
          )}
        </AnimatePresence>

        {/* Subscription List */}
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
            <motion.div
              className="space-y-4"
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
            >
              {/* Section: Confirmed active subscriptions */}
              {sortedConfirmed.length > 0 && (
                <>
                  <div className="flex items-center gap-2 pt-1">
                    <CheckCircle2 className="w-4 h-4 text-ios-green" />
                    <span className="text-sm font-medium text-ios-green">
                      Confirmed ({sortedConfirmed.length})
                    </span>
                  </div>
                  {sortedConfirmed.map((sub) => (
                    <SubscriptionCard
                      key={sub.id}
                      sub={sub}
                      isConfirmed
                      onToggleConfirm={() => handleToggleConfirm(String(sub.id))}
                    />
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
                  {sortedUnconfirmed.map((sub) => (
                    <SubscriptionCard
                      key={sub.id}
                      sub={sub}
                      isConfirmed={false}
                      onToggleConfirm={() => handleToggleConfirm(String(sub.id))}
                    />
                  ))}
                </>
              )}
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  )
}
