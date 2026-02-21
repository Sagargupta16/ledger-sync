import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  CreditCard,
  DollarSign,
  Calendar,
  Hash,
  ArrowUpDown,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react'
import { useRecurringTransactions } from '@/hooks/api/useAnalyticsV2'
import type { RecurringTransaction } from '@/hooks/api/useAnalyticsV2'
import { PageHeader } from '@/components/ui'
import { formatCurrency } from '@/lib/formatters'
import { rawColors } from '@/constants/colors'
import { SCROLL_FADE_UP, staggerContainer, fadeUpItem, fadeUpWithDelay } from '@/constants/animations'
import EmptyState from '@/components/shared/EmptyState'

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
  const color =
    percent >= 80
      ? rawColors.ios.green
      : percent >= 50
        ? rawColors.ios.yellow
        : rawColors.ios.red

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

/** Status badge */
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
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-ios-yellow/15 text-ios-yellow">
      <AlertTriangle className="w-3 h-3" />
      Possibly Inactive
    </span>
  )
}

/** Single subscription card */
function SubscriptionCard({ sub }: Readonly<{ sub: RecurringTransaction }>) {
  const monthlyAmount = toMonthlyAmount(sub.expected_amount, sub.frequency)
  const annualCost = Math.abs(sub.expected_amount) * getAnnualFactor(sub.frequency)
  const status = getSubscriptionStatus(sub.last_occurrence, sub.frequency)

  return (
    <motion.div
      variants={fadeUpItem}
      className="glass rounded-xl border border-border p-5 hover:border-white/20 transition-colors duration-200"
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
              <h3 className="font-semibold text-white truncate">{sub.name}</h3>
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

  // Filter for expense subscriptions only
  const subscriptions = useMemo(() => {
    if (!recurringTransactions) return []
    return recurringTransactions.filter(
      (t) => t.type === 'Expense',
    )
  }, [recurringTransactions])

  // Sort subscriptions
  const sortedSubscriptions = useMemo(() => {
    const list = [...subscriptions]
    switch (sortBy) {
      case 'amount':
        return list.sort((a, b) => Math.abs(b.expected_amount) - Math.abs(a.expected_amount))
      case 'name':
        return list.sort((a, b) => a.name.localeCompare(b.name))
      case 'last_occurrence':
        return list.sort((a, b) => {
          if (!a.last_occurrence) return 1
          if (!b.last_occurrence) return -1
          return new Date(b.last_occurrence).getTime() - new Date(a.last_occurrence).getTime()
        })
      case 'annual_cost':
        return list.sort((a, b) => {
          const aCost = Math.abs(a.expected_amount) * getAnnualFactor(a.frequency)
          const bCost = Math.abs(b.expected_amount) * getAnnualFactor(b.frequency)
          return bCost - aCost
        })
      default:
        return list
    }
  }, [subscriptions, sortBy])

  // Summary calculations
  const summary = useMemo(() => {
    if (subscriptions.length === 0) {
      return { totalMonthly: 0, totalAnnual: 0, count: 0, average: 0 }
    }
    const totalMonthly = subscriptions.reduce(
      (sum, s) => sum + toMonthlyAmount(s.expected_amount, s.frequency),
      0,
    )
    return {
      totalMonthly,
      totalAnnual: totalMonthly * 12,
      count: subscriptions.length,
      average: totalMonthly / subscriptions.length,
    }
  }, [subscriptions])

  const loadingPlaceholder = '...'

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Subscription Tracker"
          subtitle="Track recurring expenses, subscriptions, and bills"
        />

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          <SummaryCard
            icon={DollarSign}
            label="Monthly Cost"
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
            value={isLoading ? loadingPlaceholder : String(summary.count)}
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

          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={`skeleton-${i}`}
                  className="h-32 rounded-xl bg-white/5 animate-pulse"
                />
              ))}
            </div>
          ) : sortedSubscriptions.length === 0 ? (
            <EmptyState
              icon={CreditCard}
              title="No recurring expenses found"
              description="Once recurring expense patterns are detected from your transactions, they will appear here as subscriptions."
              variant="card"
            />
          ) : (
            <motion.div
              className="space-y-4"
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
            >
              {sortedSubscriptions.map((sub) => (
                <SubscriptionCard key={sub.id} sub={sub} />
              ))}
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  )
}
