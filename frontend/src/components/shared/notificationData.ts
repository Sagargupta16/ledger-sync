import { Bell, Wallet2, AlertTriangle, CalendarClock } from 'lucide-react'
import { rawColors } from '@/constants/colors'
import { formatCurrencyCompact } from '@/lib/formatters'
import { MS_PER_DAY } from '@/lib/dateUtils'
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

const DISMISSED_KEY = 'ledger-sync-dismissed-notifications'

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

export function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY)
    if (raw) return new Set(JSON.parse(raw) as string[])
  } catch (e) { console.warn('[loadDismissed] Failed to read localStorage:', e) }
  return new Set()
}

export function saveDismissed(ids: Set<string>) {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]))
  } catch (e) {
    console.warn('[saveDismissed] Failed to write localStorage:', e)
  }
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null
  const target = new Date(dateStr)
  const now = new Date()
  const diff = target.getTime() - now.getTime()
  return Math.ceil(diff / MS_PER_DAY)
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

export function getSeverityColor(severity: Notification['severity']): string {
  if (severity === 'high') return rawColors.app.red
  if (severity === 'medium') return rawColors.app.orange
  return rawColors.app.yellow
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
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

// ---------------------------------------------------------------------------
// Notification generators
// ---------------------------------------------------------------------------

export function budgetNotifications(budgets: Budget[]): Notification[] {
  return budgets
    .filter((b) => b.usage_pct >= b.alert_threshold)
    .map((b) => {
      const pct = Math.round(b.usage_pct)
      const severity: Notification['severity'] = getSeverityFromPct(pct)
      return {
        id: `budget-${b.id}`,
        type: 'budget' as NotificationType,
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
        type: 'anomaly' as NotificationType,
        title: 'Anomaly Detected',
        message: a.description || label,
        timestamp: a.detected_at,
        severity: a.severity,
      }
    })
}

export function upcomingNotifications(recurring: RecurringTransaction[]): Notification[] {
  const results: Notification[] = []
  for (const r of recurring) {
    const days = daysUntil(r.next_expected)
    if (days === null || days < 0 || days > DUE_SOON_DAYS) continue
    const amount = formatCurrencyCompact(r.expected_amount)
    results.push({
      id: `upcoming-${r.id}`,
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
    dotColor: string
  }
> = {
  budget: {
    label: 'Budget Alerts',
    icon: Wallet2,
    colorClass: 'text-app-orange',
    bgClass: 'bg-app-orange/15',
    dotColor: rawColors.app.orange,
  },
  anomaly: {
    label: 'Anomalies',
    icon: AlertTriangle,
    colorClass: 'text-app-red',
    bgClass: 'bg-app-red/15',
    dotColor: rawColors.app.red,
  },
  upcoming: {
    label: 'Upcoming',
    icon: CalendarClock,
    colorClass: 'text-app-blue',
    bgClass: 'bg-app-blue/15',
    dotColor: rawColors.app.blue,
  },
}

export const groupOrder: NotificationType[] = ['budget', 'anomaly', 'upcoming']
