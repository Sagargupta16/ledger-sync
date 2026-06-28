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
        className="lg:hidden fixed z-50 w-11 h-11 flex items-center justify-center rounded-xl bg-surface-dropdown/90 border border-[var(--hairline-2)] backdrop-blur-sm active:scale-95 transition-transform"
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
          'border-r border-border',
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
          <div className="px-3 py-2 border-b border-border">
            <button
              onClick={openSearch}
              className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg bg-[var(--overlay-2)] hover:bg-[var(--overlay-4)] text-text-tertiary hover:text-foreground transition-colors duration-150 text-sm"
              title="Search (⌘K)"
            >
              <Search size={15} className="flex-shrink-0" />
              <span className="flex-1 text-left">Search...</span>
              <kbd className="hidden sm:inline text-[10px] px-1.5 py-0.5 rounded bg-[var(--overlay-3)] border border-[var(--hairline-2)] text-text-quaternary font-medium">
                ⌘K
              </kbd>
            </button>
          </div>

          {/* Scrollable navigation */}
          <nav
            aria-label="Main navigation"
            className="flex-1 min-h-0 overflow-y-auto scrollbar-none py-1"
          >
            {/* Dashboard — standalone */}
            <div className="px-2 pt-2">
              <SidebarItem
                to={dashboardItem.path}
                icon={dashboardItem.icon}
                label={dashboardItem.label}
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
            className="border-t border-border px-3 py-2.5"
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
                  className="w-11 h-11 lg:w-9 lg:h-9 flex items-center justify-center rounded-lg text-text-tertiary hover:text-foreground hover:bg-[var(--overlay-3)] transition-colors duration-150"
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
                  className="w-11 h-11 lg:w-9 lg:h-9 flex items-center justify-center rounded-lg text-text-tertiary hover:text-app-red hover:bg-app-red/10 transition-colors duration-150"
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
                  className="w-11 h-11 lg:w-9 lg:h-9 flex items-center justify-center rounded-lg text-text-tertiary hover:text-app-red hover:bg-app-red/10 transition-colors duration-150 disabled:opacity-50"
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
