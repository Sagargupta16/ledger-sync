import { useState, useMemo, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useQueryClient } from '@tanstack/react-query'
import { Menu, X, LogOut, Search } from 'lucide-react'

import { ROUTES } from '@/constants'
import { cn } from '@/lib/cn'
import { useAuthStore } from '@/store/authStore'
import { useDemoStore } from '@/store/demoStore'
import { useLogout } from '@/hooks/api/useAuth'
import NotificationCenter from '@/components/shared/NotificationCenter'
import ProfileModal from '@/components/shared/ProfileModal'
import { useBudgets, useAnomalies, useRecurringTransactions } from '@/hooks/api/useAnalyticsV2'
import { exitDemoMode } from '@/lib/demo'

import SidebarSection from './SidebarSection'
import SidebarItem from './SidebarItem'
import CurrencySwitcher from './CurrencySwitcher'
import ThemeToggle from './ThemeToggle'
import BrandHeader from './BrandHeader'
import {
  dashboardItem,
  overviewItem,
  navigationSections,
  utilityItems,
  ALERT_BADGE_ROUTES,
} from './navConfig'

// ─── Component ──────────────────────────────────────────────────────────────

export default function Sidebar() {
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [showProfile, setShowProfile] = useState(false)

  const { user } = useAuthStore()
  const isDemoMode = useDemoStore((s) => s.isDemoMode)
  const logout = useLogout()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // ── Badge counts from API data ──────────────────────────────────────────

  const { data: budgets = [] } = useBudgets({ active_only: true })
  const { data: anomalies = [] } = useAnomalies({ include_reviewed: false })
  const { data: recurring = [] } = useRecurringTransactions({ active_only: true })

  const badgeCounts = useMemo(() => {
    const map: Record<string, number> = {}
    const currentTime = new Date()

    const unreviewedAnomalies = anomalies.filter(
      (a) => !a.is_dismissed && !a.is_reviewed,
    ).length
    if (unreviewedAnomalies > 0) map[ROUTES.ANOMALIES] = unreviewedAnomalies

    const overBudget = budgets.filter(
      (b) => b.usage_pct >= b.alert_threshold,
    ).length
    if (overBudget > 0) map[ROUTES.BUDGETS] = overBudget

    const upcomingBills = recurring.filter((r) => {
      if (!r.next_expected) return false
      const days = Math.ceil(
        (new Date(r.next_expected).getTime() - currentTime.getTime()) / 86_400_000,
      )
      return days >= 0 && days <= 7
    }).length
    if (upcomingBills > 0) map[ROUTES.BILL_CALENDAR] = upcomingBills

    return map
  }, [anomalies, budgets, recurring])

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleLogout = () => {
    logout.mutate(undefined, { onSuccess: () => navigate('/') })
  }

  const openSearch = useCallback(() => {
    document.dispatchEvent(new CustomEvent('open-command-palette'))
  }, [])

  const closeMobile = useCallback(() => setIsMobileOpen(false), [])

  return (
    <>
      {/* Mobile toggle -- offset by safe-area-inset-top so it clears the iOS notch in PWA mode.
          Left offset also respects safe-area-inset-left for landscape on notched devices. */}
      <button
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        className="ledger-control fixed z-50 flex h-11 w-11 items-center justify-center rounded-xl border backdrop-blur-sm transition-transform active:scale-95 lg:hidden"
        style={{
          top: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)',
          left: 'calc(env(safe-area-inset-left, 0px) + 1rem)',
        }}
        aria-label={isMobileOpen ? 'Close menu' : 'Open menu'}
      >
        {isMobileOpen
          ? <X size={20} className="text-foreground" />
          : <Menu size={20} className="text-foreground" />}
      </button>

      {/* Sidebar -- h-dvh so the nav tracks the real viewport height
          (h-screen = 100vh jumps when the mobile browser address bar toggles). */}
      <aside
        className={cn(
          'fixed lg:sticky top-0 h-dvh w-64 z-40',
          'bg-[var(--sidebar-bg)] backdrop-blur-sm',
          'border-r border-[var(--hairline-2)] shadow-[8px_0_24px_-22px_rgba(0,0,0,0.7)]',
          'transition-transform duration-200 ease-out',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        {/* pt-safe ensures the brand row clears the iOS notch when the drawer
            opens in PWA standalone mode; desktop gets no extra padding. */}
        <div className="flex flex-col h-full pt-safe">
          {/* Brand Header */}
          <BrandHeader
            user={isDemoMode ? { email: 'Demo Mode' } : user}
            onOpenProfile={() => { if (!isDemoMode) setShowProfile(true) }}
          />

          {/* Search */}
          <div className="border-b border-[var(--hairline-2)] px-3 py-2">
            <button
              onClick={openSearch}
              className="ledger-control flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-sm text-text-tertiary transition-colors duration-150 hover:text-foreground"
              title="Search (⌘K)"
            >
              <Search size={15} className="flex-shrink-0" />
              <span className="flex-1 text-left">Search...</span>
              <kbd className="hidden rounded border border-[var(--hairline-2)] bg-[var(--overlay-3)] px-1.5 py-0.5 text-[10px] font-medium text-text-quaternary sm:inline">
                ⌘K
              </kbd>
            </button>
          </div>

          {/* Scrollable navigation */}
          <nav
            aria-label="Main navigation"
            className="flex-1 min-h-0 overflow-y-auto scrollbar-none py-1"
          >
            {/* Dashboard + Overview — standalone top-level entries */}
            <div className="px-2 pt-2 space-y-0.5">
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
            </div>

            {/* Navigation sections */}
            {navigationSections.map((section) => (
              <SidebarSection key={section.title} title={section.title}>
                {section.items.map((item) => (
                  <SidebarItem
                    key={item.path}
                    to={item.path}
                    icon={item.icon}
                    label={item.label}
                    badge={badgeCounts[item.path]}
                    badgeVariant={ALERT_BADGE_ROUTES.has(item.path) ? 'alert' : 'default'}
                    onNavigate={closeMobile}
                  />
                ))}
              </SidebarSection>
            ))}
          </nav>

          {/* Bottom icon bar -- extra bottom padding on iOS to clear the home-indicator. */}
          <div
            className="border-t border-[var(--hairline-2)] px-3 py-2.5"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.625rem)' }}
          >
            <div className="flex items-center justify-center gap-1">
              <CurrencySwitcher />
              <ThemeToggle />
              <NotificationCenter />
              {utilityItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={closeMobile}
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-text-tertiary transition-colors duration-150 hover:bg-[var(--ledger-control-bg-hover)] hover:text-foreground lg:h-9 lg:w-9"
                  title={item.label}
                  aria-label={item.label}
                >
                  <item.icon size={18} />
                </Link>
              ))}
              {isDemoMode ? (
                <button
                  type="button"
                  onClick={() => exitDemoMode(queryClient, navigate)}
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-text-tertiary transition-colors duration-150 hover:bg-app-red/10 hover:text-app-red lg:h-9 lg:w-9"
                  title="Exit Demo"
                  aria-label="Exit Demo"
                >
                  <LogOut size={18} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={logout.isPending}
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-text-tertiary transition-colors duration-150 hover:bg-app-red/10 hover:text-app-red disabled:opacity-50 lg:h-9 lg:w-9"
                  title="Sign out"
                  aria-label="Sign out"
                >
                  <LogOut size={18} />
                </button>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {isMobileOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          className="fixed inset-0 bg-[var(--modal-backdrop)] backdrop-blur-sm z-30 lg:hidden appearance-none border-none p-0 m-0 cursor-default w-full"
          onClick={() => setIsMobileOpen(false)}
          onKeyDown={(e) => e.key === 'Escape' && setIsMobileOpen(false)}
        />
      )}

      {/* Profile Modal */}
      <ProfileModal open={showProfile} onOpenChange={setShowProfile} />
    </>
  )
}
