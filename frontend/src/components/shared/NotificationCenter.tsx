import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bell,
  X,
  Wallet2,
  AlertTriangle,
  CalendarClock,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { rawColors } from '@/constants/colors'
import { formatCurrencyCompact } from '@/lib/formatters'
import { useBudgets, useAnomalies, useRecurringTransactions } from '@/hooks/api/useAnalyticsV2'
import type { Budget, Anomaly, RecurringTransaction } from '@/hooks/api/useAnalyticsV2'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type NotificationType = 'budget' | 'anomaly' | 'upcoming'

interface Notification {
  id: string
  type: NotificationType
  title: string
  message: string
  timestamp: string
  severity: 'low' | 'medium' | 'high'
  meta?: Record<string, unknown>
}

interface NotificationCenterProps {
  isCollapsed: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DISMISSED_KEY = 'ledger-sync-dismissed-notifications'

function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY)
    if (raw) return new Set(JSON.parse(raw) as string[])
  } catch { /* ignore */ }
  return new Set()
}

function saveDismissed(ids: Set<string>) {
  localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]))
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null
  const target = new Date(dateStr)
  const now = new Date()
  const diff = target.getTime() - now.getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function relativeTime(dateStr: string): string {
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

function budgetNotifications(budgets: Budget[]): Notification[] {
  return budgets
    .filter((b) => b.usage_pct >= b.alert_threshold)
    .map((b) => {
      const pct = Math.round(b.usage_pct)
      const severity: Notification['severity'] =
        pct >= 100 ? 'high' : pct >= 90 ? 'medium' : 'low'
      return {
        id: `budget-${b.id}`,
        type: 'budget' as NotificationType,
        title: 'Budget Alert',
        message:
          pct >= 100
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

function anomalyNotifications(anomalies: Anomaly[]): Notification[] {
  return anomalies
    .filter((a) => !a.is_dismissed && !a.is_reviewed)
    .map((a) => {
      const amount = a.actual_value
        ? formatCurrencyCompact(a.actual_value)
        : ''
      const label =
        a.anomaly_type === 'high_expense'
          ? `Unusual ${amount} expense`
          : a.anomaly_type === 'large_transfer'
            ? `Large ${amount} transfer detected`
            : a.anomaly_type === 'budget_exceeded'
              ? 'Budget exceeded'
              : 'Unusual activity'
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

function upcomingNotifications(recurring: RecurringTransaction[]): Notification[] {
  const results: Notification[] = []
  for (const r of recurring) {
    const days = daysUntil(r.next_expected)
    if (days === null || days < 0 || days > 7) continue
    const amount = formatCurrencyCompact(r.expected_amount)
    results.push({
      id: `upcoming-${r.id}`,
      type: 'upcoming',
      title: 'Upcoming Payment',
      message:
        days === 0
          ? `${r.name} (${amount}) is due today`
          : days === 1
            ? `${r.name} (${amount}) is due tomorrow`
            : `${r.name} (${amount}) due in ${days} days`,
      timestamp: r.next_expected!,
      severity: days <= 1 ? 'high' : days <= 3 ? 'medium' : 'low',
      meta: { category: r.category, amount: r.expected_amount },
    })
  }
  return results
}

// ---------------------------------------------------------------------------
// Grouped section config
// ---------------------------------------------------------------------------

const groupConfig: Record<
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
    colorClass: 'text-ios-orange',
    bgClass: 'bg-ios-orange/15',
    dotColor: rawColors.ios.orange,
  },
  anomaly: {
    label: 'Anomalies',
    icon: AlertTriangle,
    colorClass: 'text-ios-red',
    bgClass: 'bg-ios-red/15',
    dotColor: rawColors.ios.red,
  },
  upcoming: {
    label: 'Upcoming',
    icon: CalendarClock,
    colorClass: 'text-ios-blue',
    bgClass: 'bg-ios-blue/15',
    dotColor: rawColors.ios.blue,
  },
}

const groupOrder: NotificationType[] = ['budget', 'anomaly', 'upcoming']

// ---------------------------------------------------------------------------
// Severity dot
// ---------------------------------------------------------------------------

function SeverityDot({ severity }: { severity: Notification['severity'] }) {
  const color =
    severity === 'high'
      ? rawColors.ios.red
      : severity === 'medium'
        ? rawColors.ios.orange
        : rawColors.ios.yellow
  return (
    <span
      className="inline-block w-2 h-2 rounded-full flex-shrink-0"
      style={{ backgroundColor: color }}
    />
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function NotificationCenter({ isCollapsed }: NotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [dismissed, setDismissed] = useState<Set<string>>(loadDismissed)
  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Fetch data
  const { data: budgets = [] } = useBudgets({ active_only: true })
  const { data: anomalies = [] } = useAnomalies({ include_reviewed: false })
  const { data: recurring = [] } = useRecurringTransactions({ active_only: true })

  // Build notifications
  const notifications = useMemo(() => {
    const all = [
      ...budgetNotifications(budgets),
      ...anomalyNotifications(anomalies),
      ...upcomingNotifications(recurring),
    ]
    return all.filter((n) => !dismissed.has(n.id))
  }, [budgets, anomalies, recurring, dismissed])

  const grouped = useMemo(() => {
    const map = new Map<NotificationType, Notification[]>()
    for (const n of notifications) {
      const list = map.get(n.type) || []
      list.push(n)
      map.set(n.type, list)
    }
    return map
  }, [notifications])

  const totalCount = notifications.length

  // Dismiss handler
  const handleDismiss = useCallback(
    (id: string) => {
      setDismissed((prev) => {
        const next = new Set(prev)
        next.add(id)
        saveDismissed(next)
        return next
      })
    },
    [],
  )

  const handleDismissAll = useCallback(() => {
    setDismissed((prev) => {
      const next = new Set(prev)
      for (const n of notifications) next.add(n.id)
      saveDismissed(next)
      return next
    })
  }, [notifications])

  // Click-outside handler
  useEffect(() => {
    if (!isOpen) return
    function handleClick(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isOpen])

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen])

  return (
    <div className="relative">
      {/* Bell button */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen((v) => !v)}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2.5 rounded-xl transition-colors duration-200',
          'text-muted-foreground hover:bg-white/10 hover:text-white',
          isCollapsed && 'justify-center px-2',
          isOpen && 'bg-white/10 text-white',
        )}
        title="Notifications"
        aria-label={`Notifications${totalCount > 0 ? ` (${totalCount} unread)` : ''}`}
      >
        <div className="relative">
          <Bell size={18} />
          {totalCount > 0 && (
            <span
              className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 flex items-center justify-center px-1 rounded-full text-[10px] font-bold text-white"
              style={{
                background: `linear-gradient(135deg, ${rawColors.ios.red}, ${rawColors.ios.pink})`,
                boxShadow: `0 2px 8px ${rawColors.ios.red}60`,
              }}
            >
              {totalCount > 99 ? '99+' : totalCount}
            </span>
          )}
        </div>
        {!isCollapsed && <span className="text-sm">Notifications</span>}
        {!isCollapsed && totalCount > 0 && (
          <ChevronRight
            size={14}
            className={cn(
              'ml-auto transition-transform duration-200',
              isOpen && 'rotate-90',
            )}
          />
        )}
      </button>

      {/* Dropdown panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, x: -8, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -8, scale: 0.96 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className={cn(
              'absolute z-[100] w-80 max-h-[70vh] rounded-2xl overflow-hidden',
              'glass-strong border border-border shadow-2xl shadow-black/40',
              // Position: to the right of the sidebar, vertically centered near the bell
              'left-full bottom-0 ml-3',
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Bell size={16} className="text-ios-blue" />
                <span className="text-sm font-semibold text-white">
                  Notifications
                </span>
                {totalCount > 0 && (
                  <span
                    className="px-1.5 py-0.5 rounded-md text-[10px] font-bold text-white"
                    style={{
                      background: `linear-gradient(135deg, ${rawColors.ios.blue}, ${rawColors.ios.indigo})`,
                    }}
                  >
                    {totalCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {totalCount > 0 && (
                  <button
                    onClick={handleDismissAll}
                    className="text-[11px] text-muted-foreground hover:text-white px-2 py-1 rounded-lg hover:bg-white/10 transition-colors"
                  >
                    Clear all
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 rounded-lg text-muted-foreground hover:text-white hover:bg-white/10 transition-colors"
                  aria-label="Close notifications"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Notification list */}
            <div className="overflow-y-auto max-h-[calc(70vh-48px)] scrollbar-none">
              {totalCount === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-4">
                  <div
                    className="p-3 rounded-2xl mb-3"
                    style={{
                      background: `linear-gradient(135deg, ${rawColors.ios.green}20, ${rawColors.ios.teal}20)`,
                    }}
                  >
                    <Bell size={24} className="text-ios-green" />
                  </div>
                  <p className="text-sm font-medium text-white">All caught up!</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    No new notifications
                  </p>
                </div>
              ) : (
                groupOrder.map((type) => {
                  const items = grouped.get(type)
                  if (!items || items.length === 0) return null
                  const config = groupConfig[type]
                  const GroupIcon = config.icon

                  return (
                    <div key={type} className="py-1">
                      {/* Group header */}
                      <div className="flex items-center gap-2 px-4 py-2">
                        <div className={cn('p-1 rounded-md', config.bgClass)}>
                          <GroupIcon size={12} className={config.colorClass} />
                        </div>
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {config.label}
                        </span>
                        <span
                          className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                          style={{
                            backgroundColor: `${config.dotColor}20`,
                            color: config.dotColor,
                          }}
                        >
                          {items.length}
                        </span>
                      </div>

                      {/* Items */}
                      {items.map((item) => (
                        <motion.div
                          key={item.id}
                          layout
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: -20 }}
                          transition={{ duration: 0.2 }}
                          className="group mx-2 mb-1 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors"
                        >
                          <div className="flex items-start gap-2.5">
                            <SeverityDot severity={item.severity} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-white leading-snug">
                                {item.message}
                              </p>
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                {relativeTime(item.timestamp)}
                              </p>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDismiss(item.id)
                              }}
                              className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-muted-foreground hover:text-white hover:bg-white/10 transition-all flex-shrink-0"
                              aria-label={`Dismiss: ${item.message}`}
                            >
                              <X size={12} />
                            </button>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
