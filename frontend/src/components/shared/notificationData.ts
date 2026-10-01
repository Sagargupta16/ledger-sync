import { Bell, Wallet2, AlertTriangle, CalendarClock } from 'lucide-react'
import { colors } from '@/constants/colors'
import { formatCurrencyCompact, formatDate } from '@/lib/formatters'
import { getDateKey, getTodayKey, inclusiveDaySpan } from '@/lib/dateUtils'
import type { Budget, Anomaly, RecurringTransaction } from '@/hooks/api/useAnalyticsV2'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NotificationType = 'budget' | 'anomaly' | 'upcoming'

export interface Notification {
  id: string
  type: NotificationType
  title: string
  message: string
  timestamp: string
  severity: 'low' | 'medium' | 'high'
  meta?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Dismissals are stored per session identity (`<prefix>:<provider>:<id>` or
 * `<prefix>:demo`), so one account's dismissals never hide another's alerts.
 * The bare prefix was the old global key; `clearDismissedNotifications` drops
 * it along with every per-identity key.
 */
const DISMISSED_KEY_PREFIX = 'ledger-sync-dismissed-notifications'

export function dismissedStorageKey(identity: string): string {
  return `${DISMISSED_KEY_PREFIX}:${identity}`
}

/** Remove every stored dismissal (all identities plus the legacy global key). */
export function clearDismissedNotifications(): void {
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(DISMISSED_KEY_PREFIX)) keys.push(key)
    }
    for (const key of keys) localStorage.removeItem(key)
  } catch (e) {
    console.warn('[clearDismissedNotifications] Failed to clear localStorage:', e)
  }
}

/**
 * Severity thresholds for notifications. Kept here as named constants so the
 * cutoffs are visible in one place rather than scattered as magic numbers
 * across the generators and severity helpers below.
 */
const BUDGET_EXCEEDED_PCT = 100 // at/over limit -> high severity, "exceeded" copy
const BUDGET_WARNING_PCT = 90 // approaching limit -> medium severity
const DUE_SOON_DAYS = 7 // only surface upcoming bills within this window
const DUE_HIGH_DAYS = 1 // due today/tomorrow -> high severity
const DUE_MEDIUM_DAYS = 3 // due within 3 days -> medium severity

export function loadDismissed(storageKey: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw) return new Set(JSON.parse(raw) as string[])
  } catch (e) { console.warn('[loadDismissed] Failed to read localStorage:', e) }
  return new Set()
}

export function saveDismissed(storageKey: string, ids: Set<string>) {
  try {
    localStorage.setItem(storageKey, JSON.stringify([...ids]))
  } catch (e) {
    console.warn('[saveDismissed] Failed to write localStorage:', e)
  }
}

/**
 * Whole local calendar days from today to `dateStr` (0 = today). Compares
 * date keys, not instants: `new Date('YYYY-MM-DD')` is UTC midnight, which
 * with a ceil against local "now" called a bill due today "due tomorrow" (or
 * vice versa) depending on the time zone and hour.
 */
function daysUntil(dateStr: string | null, todayKey: string): number | null {
  if (!dateStr) return null
  const targetKey = getDateKey(dateStr)
  if (targetKey < todayKey) return -(inclusiveDaySpan(targetKey, todayKey) - 1)
  return inclusiveDaySpan(todayKey, targetKey) - 1
}

function getSeverityFromPct(pct: number): Notification['severity'] {
  if (pct >= BUDGET_EXCEEDED_PCT) return 'high'
  if (pct >= BUDGET_WARNING_PCT) return 'medium'
  return 'low'
}

function getAnomalyLabel(anomalyType: string, amount: string): string {
  if (anomalyType === 'high_expense') return `Unusual ${amount} expense`
  if (anomalyType === 'large_transfer') return `Large ${amount} transfer detected`
  if (anomalyType === 'budget_exceeded') return 'Budget exceeded'
  return 'Unusual activity'
}

function getDueMessage(name: string, amount: string, days: number): string {
  if (days === 0) return `${name} (${amount}) is due today`
  if (days === 1) return `${name} (${amount}) is due tomorrow`
  return `${name} (${amount}) due in ${days} days`
}

function getSeverityFromDays(days: number): Notification['severity'] {
  if (days <= DUE_HIGH_DAYS) return 'high'
  if (days <= DUE_MEDIUM_DAYS) return 'medium'
  return 'low'
}

/** CSS var() for the DOM severity dot, so it follows a theme toggle. */
export function getSeverityColor(severity: Notification['severity']): string {
  if (severity === 'high') return colors.app.red
  if (severity === 'medium') return colors.app.orange
  return colors.app.yellow
}

export function relativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}h ago`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 7) return `${diffD}d ago`
  return formatDate(date, { day: 'numeric', month: 'short' })
}

// ---------------------------------------------------------------------------
// Notification generators
// ---------------------------------------------------------------------------

export function budgetNotifications(budgets: Budget[], todayKey: string = getTodayKey()): Notification[] {
  // Budgets are monthly: the month in the ID lets a dismissal cover only this
  // month's alert, not every future month's.
  const period = todayKey.slice(0, 7)
  return budgets
    .filter((b) => b.usage_pct >= b.alert_threshold)
    .map((b) => {
      const pct = Math.round(b.usage_pct)
      const severity: Notification['severity'] = getSeverityFromPct(pct)
      return {
        id: `budget-${b.id}-${period}`,
        type: 'budget',
        title: 'Budget Alert',
        message:
          pct >= BUDGET_EXCEEDED_PCT
            ? `${b.category} budget exceeded (${pct}% used)`
            : `${b.category} budget ${pct}% used`,
        timestamp: new Date().toISOString(),
        severity,
        meta: {
          category: b.category,
          spent: b.current_spent,
          limit: b.monthly_limit,
          pct,
        },
      }
    })
}

export function anomalyNotifications(anomalies: Anomaly[]): Notification[] {
  return anomalies
    .filter((a) => !a.is_dismissed && !a.is_reviewed)
    .map((a) => {
      const amount = a.actual_value
        ? formatCurrencyCompact(a.actual_value)
        : ''
      const label = getAnomalyLabel(a.anomaly_type, amount)
      return {
        id: `anomaly-${a.id}`,
        type: 'anomaly',
        title: 'Anomaly Detected',
        message: a.description || label,
        timestamp: a.detected_at,
        severity: a.severity,
      }
    })
}

export function upcomingNotifications(
  recurring: RecurringTransaction[],
  todayKey: string = getTodayKey(),
): Notification[] {
  const results: Notification[] = []
  for (const r of recurring) {
    const days = daysUntil(r.next_expected, todayKey)
    if (days === null || days < 0 || days > DUE_SOON_DAYS) continue
    const amount = formatCurrencyCompact(r.expected_amount)
    results.push({
      // The due date in the ID scopes a dismissal to this cycle only.
      id: `upcoming-${r.id}-${getDateKey(r.next_expected ?? '')}`,
      type: 'upcoming',
      title: 'Upcoming Payment',
      message: getDueMessage(r.name, amount, days),
      timestamp: r.next_expected ?? '',
      severity: getSeverityFromDays(days),
      meta: { category: r.category, amount: r.expected_amount },
    })
  }
  return results
}

// ---------------------------------------------------------------------------
// Grouped section config
// ---------------------------------------------------------------------------

export const groupConfig: Record<
  NotificationType,
  {
    label: string
    icon: typeof Bell
    colorClass: string
    bgClass: string
  }
> = {
  budget: {
    label: 'Budget Alerts',
    icon: Wallet2,
    colorClass: 'text-app-orange',
    bgClass: 'bg-app-orange/15',
  },
  anomaly: {
    label: 'Anomalies',
    icon: AlertTriangle,
    colorClass: 'text-app-red',
    bgClass: 'bg-app-red/15',
  },
  upcoming: {
    label: 'Upcoming',
    icon: CalendarClock,
    colorClass: 'text-app-blue',
    bgClass: 'bg-app-blue/15',
  },
}

export const groupOrder: NotificationType[] = ['budget', 'anomaly', 'upcoming']
