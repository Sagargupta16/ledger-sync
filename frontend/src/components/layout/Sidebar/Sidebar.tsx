import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useQueryClient } from '@tanstack/react-query'
import { ChevronDown, LogOut, Menu, Search, X } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

import ProfileModal from '@/components/shared/ProfileModal'
import { Button } from '@/components/ui'
import { ROUTES } from '@/constants'
import {
  useAnomalies,
  useBudgets,
  useRecurringTransactions,
} from '@/hooks/api/useAnalyticsV2'
import { cn } from '@/lib/cn'
import { exitDemoMode } from '@/lib/demo'
import { useAuthStore } from '@/store/authStore'
import { useDemoStore } from '@/store/demoStore'
import { useLogout } from '@/hooks/api/useAuth'

import BrandHeader from './BrandHeader'
import CurrencySwitcher from './CurrencySwitcher'
import {
  ALERT_BADGE_ROUTES,
  dashboardItem,
  navigationSections,
  overviewItem,
  transactionsItem,
  utilityItems,
} from './navConfig'
import SidebarItem from './SidebarItem'
import SidebarSection from './SidebarSection'
import ThemeToggle from './ThemeToggle'

function getInitials(name?: string | null, email?: string): string {
  const source = name?.trim() || email?.split('@')[0] || 'LS'
  return source
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

export default function Sidebar() {
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const mobileToggleRef = useRef<HTMLButtonElement>(null)
  const sidebarRef = useRef<HTMLElement>(null)

  const { user } = useAuthStore()
  const isDemoMode = useDemoStore((state) => state.isDemoMode)
  const logout = useLogout()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: budgets = [] } = useBudgets({ active_only: true })
  const { data: anomalies = [] } = useAnomalies({ include_reviewed: false })
  const { data: recurring = [] } = useRecurringTransactions({ active_only: true })

  const badgeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    const now = new Date()

    const anomalyCount = anomalies.filter(
      (item) => !item.is_dismissed && !item.is_reviewed,
    ).length
    if (anomalyCount > 0) counts[ROUTES.ANOMALIES] = anomalyCount

    const budgetCount = budgets.filter(
      (item) => item.usage_pct >= item.alert_threshold,
    ).length
    if (budgetCount > 0) counts[ROUTES.BUDGETS] = budgetCount

    const billCount = recurring.filter((item) => {
      if (!item.next_expected) return false
      const days = Math.ceil(
        (new Date(item.next_expected).getTime() - now.getTime()) / 86_400_000,
      )
      return days >= 0 && days <= 7
    }).length
    if (billCount > 0) counts[ROUTES.BILL_CALENDAR] = billCount

    return counts
  }, [anomalies, budgets, recurring])

  const closeMobile = useCallback(() => {
    setIsMobileOpen(false)
    globalThis.requestAnimationFrame(() => mobileToggleRef.current?.focus())
  }, [])

  const openSearch = useCallback(() => {
    document.dispatchEvent(new CustomEvent('open-command-palette'))
  }, [])

  const handleLogout = () => {
    logout.mutate(undefined, { onSuccess: () => navigate('/') })
  }

  const displayUser = isDemoMode
    ? { full_name: 'Demo workspace', email: 'Explore sample data' }
    : user

  useEffect(() => {
    if (!isMobileOpen) return

    const sidebar = sidebarRef.current
    const focusableSelector =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    sidebar?.querySelector<HTMLElement>(focusableSelector)?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeMobile()
        return
      }
      if (event.key !== 'Tab' || !sidebar) return

      const focusable = [
        mobileToggleRef.current,
        ...sidebar.querySelectorAll<HTMLElement>(focusableSelector),
      ].filter((element): element is HTMLElement => element !== null)
      const first = focusable[0]
      const last = focusable.at(-1)

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [closeMobile, isMobileOpen])

  return (
    <>
      <Button
        ref={mobileToggleRef}
        type="button"
        variant="secondary"
        size="md"
        onClick={() => {
          if (isMobileOpen) closeMobile()
          else setIsMobileOpen(true)
        }}
        className="fixed z-50 size-11 p-0 lg:hidden"
        style={{
          top: 'calc(env(safe-area-inset-top, 0px) + 0.375rem)',
          left: 'calc(env(safe-area-inset-left, 0px) + 0.625rem)',
        }}
        aria-label={isMobileOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={isMobileOpen}
        aria-controls="workspace-navigation"
      >
        {isMobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
      </Button>

      <aside
        ref={sidebarRef}
        id="workspace-navigation"
        aria-label="Workspace navigation"
        className={cn(
          'fixed top-0 z-40 h-dvh w-60 border-r border-[var(--hairline-2)] bg-[var(--sidebar-bg)] transition-transform duration-200 ease-out lg:sticky',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        <div className="flex h-full flex-col pt-safe">
          <BrandHeader />

          <div className="border-b border-[var(--hairline-1)] p-2.5">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={openSearch}
              className="w-full justify-start px-2.5 text-xs text-text-tertiary hover:text-foreground"
              aria-label="Search workspace"
            >
              <Search className="size-3.5 shrink-0" />
              <span className="flex-1 text-left">Search workspace</span>
              <kbd className="rounded border border-[var(--hairline-2)] px-1 py-0.5 text-[9px]">
                Ctrl K
              </kbd>
            </Button>
          </div>

          <nav
            aria-label="Main navigation"
            className="min-h-0 flex-1 overflow-y-auto py-2 scrollbar-none"
          >
            <div className="space-y-0.5 px-2">
              <SidebarItem
                to={dashboardItem.path}
                icon={dashboardItem.icon}
                label={dashboardItem.label}
                onNavigate={closeMobile}
              />
              <SidebarItem
                to={overviewItem.path}
                icon={overviewItem.icon}
                label={overviewItem.label}
                onNavigate={closeMobile}
              />
              <SidebarItem
                to={transactionsItem.path}
                icon={transactionsItem.icon}
                label={transactionsItem.label}
                onNavigate={closeMobile}
              />
            </div>

            {navigationSections.map((section) => (
              <SidebarSection key={section.title} title={section.title}>
                {section.items.map((item) => (
                  <SidebarItem
                    key={item.path}
                    to={item.path}
                    icon={item.icon}
                    label={item.label}
                    badge={badgeCounts[item.path]}
                    badgeVariant={
                      ALERT_BADGE_ROUTES.has(item.path) ? 'alert' : 'default'
                    }
                    onNavigate={closeMobile}
                  />
                ))}
              </SidebarSection>
            ))}
          </nav>

          <div className="border-t border-[var(--hairline-2)]">
            <div className="flex items-center gap-1 px-2.5 py-2">
              <CurrencySwitcher />
              <ThemeToggle />
              <div className="ml-auto flex items-center gap-1">
                {utilityItems.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={closeMobile}
                    className="flex size-11 items-center justify-center rounded-md text-text-tertiary transition-colors duration-150 hover:bg-[var(--overlay-2)] hover:text-foreground lg:size-9"
                    title={item.label}
                    aria-label={item.label}
                  >
                    <item.icon className="size-4" />
                  </Link>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={
                    isDemoMode
                      ? () => exitDemoMode(queryClient, navigate)
                      : handleLogout
                  }
                  disabled={logout.isPending}
                  className="size-11 p-0 text-text-tertiary hover:bg-app-red/10 hover:text-app-red lg:size-9 lg:min-h-9 lg:min-w-9"
                  title={isDemoMode ? 'Exit demo' : 'Sign out'}
                  aria-label={isDemoMode ? 'Exit demo' : 'Sign out'}
                >
                  <LogOut className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                if (!isDemoMode) setShowProfile(true)
              }}
              className="flex min-h-14 w-full items-center gap-2.5 border-t border-[var(--hairline-1)] px-3 text-left transition-colors duration-150 hover:bg-[var(--overlay-2)]"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground text-[10px] font-semibold text-background">
                {getInitials(displayUser?.full_name, displayUser?.email)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-foreground">
                  {displayUser?.full_name || 'Ledger Sync user'}
                </span>
                <span className="block truncate text-[10px] text-text-tertiary">
                  {displayUser?.email || 'Personal workspace'}
                </span>
              </span>
              <ChevronDown className="size-3.5 shrink-0 text-text-quaternary" />
            </button>
          </div>
        </div>
      </aside>

      {isMobileOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          className="fixed inset-0 z-30 m-0 w-full cursor-default appearance-none border-none bg-[var(--modal-backdrop)] p-0 lg:hidden"
          onClick={closeMobile}
        />
      )}

      <ProfileModal open={showProfile} onOpenChange={setShowProfile} />
    </>
  )
}
