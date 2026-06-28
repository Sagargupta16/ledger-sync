import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { rawColors } from '@/constants/colors'
import { useBudgets, useAnomalies, useRecurringTransactions } from '@/hooks/api/useAnalyticsV2'
import {
  type Notification,
  type NotificationType,
  budgetNotifications,
  anomalyNotifications,
  upcomingNotifications,
  loadDismissed,
  saveDismissed,
  getSeverityColor,
  relativeTime,
  groupConfig,
  groupOrder,
} from './notificationData'

// ---------------------------------------------------------------------------
// Severity dot
// ---------------------------------------------------------------------------

function SeverityDot({ severity }: Readonly<{ severity: Notification['severity'] }>) {
  const color = getSeverityColor(severity)
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

export default function NotificationCenter() {
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

  const unreadSuffix = totalCount > 0 ? ` (${totalCount} unread)` : ''

  return (
    <div className="relative">
      {/* Bell button */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen((v) => !v)}
        className={cn(
          'w-9 h-9 flex items-center justify-center rounded-lg transition-all duration-150 ease-out relative',
          'text-text-tertiary hover:text-foreground hover:bg-[var(--overlay-3)]',
          isOpen && 'bg-[var(--overlay-4)] text-foreground',
        )}
        title="Notifications"
        aria-label={`Notifications${unreadSuffix}`}
      >
        <Bell size={18} />
        {totalCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 flex items-center justify-center px-0.5 rounded-full text-[9px] font-bold text-foreground"
            style={{
              background: `linear-gradient(135deg, ${rawColors.app.red}, ${rawColors.app.pink})`,
            }}
          >
            {totalCount > 9 ? '9+' : totalCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={panelRef}
            aria-label="Notifications panel"
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
                <Bell size={16} className="text-app-blue" />
                <span className="text-sm font-semibold text-foreground">
                  Notifications
                </span>
                {totalCount > 0 && (
                  <span
                    className="px-1.5 py-0.5 rounded-md text-[10px] font-bold text-foreground"
                    style={{
                      background: `linear-gradient(135deg, ${rawColors.app.blue}, ${rawColors.app.indigo})`,
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
                    className="text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg hover:bg-[var(--overlay-5)] transition-colors"
                  >
                    Clear all
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-[var(--overlay-5)] transition-colors"
                  aria-label="Close notifications"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Notification list */}
            <div role="list" className="overflow-y-auto max-h-[calc(70vh-48px)] scrollbar-none">
              {totalCount === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-4">
                  <div
                    className="p-3 rounded-2xl mb-3"
                    style={{
                      background: `linear-gradient(135deg, ${rawColors.app.green}20, ${rawColors.app.teal}20)`,
                    }}
                  >
                    <Bell size={24} className="text-app-green" />
                  </div>
                  <p className="text-sm font-medium text-foreground">All caught up!</p>
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
                          role="listitem"
                          layout
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: -20 }}
                          transition={{ duration: 0.2 }}
                          className="group mx-2 mb-1 px-3 py-2.5 rounded-xl hover:bg-[var(--overlay-2)] transition-colors"
                        >
                          <div className="flex items-start gap-2.5">
                            <SeverityDot severity={item.severity} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-foreground leading-snug">
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
                              className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-[var(--overlay-5)] transition-all flex-shrink-0"
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
