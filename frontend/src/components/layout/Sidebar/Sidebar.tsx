import { useState, useMemo, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  LayoutDashboard,
  Upload,
  Receipt,
  TrendingUp,
  Landmark,
  PiggyBank,
  BarChart3,
  LineChart,
  Menu,
  X,
  ArrowRightLeft,
  Wallet,
  CircleDollarSign,
  Coins,
  Target,
  LogOut,
  GitCompareArrows,
  CalendarDays,
  Wallet2,
  AlertTriangle,
  Goal,
  Lightbulb,
  CreditCard,
  Search,
  Settings2,
  ChevronDown,
  Flame,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ROUTES } from '@/constants'
import { cn } from '@/lib/cn'
import SidebarSection from './SidebarSection'
import SidebarItem from './SidebarItem'
import CurrencySwitcher from './CurrencySwitcher'
import { useAuthStore } from '@/store/authStore'
import { useDemoStore } from '@/store/demoStore'
import { useLogout } from '@/hooks/api/useAuth'
import NotificationCenter from '@/components/shared/NotificationCenter'
import ProfileModal from '@/components/shared/ProfileModal'
import { useBudgets, useAnomalies, useRecurringTransactions } from '@/hooks/api/useAnalyticsV2'
import { exitDemoMode } from '@/lib/demo'

// ─── Navigation config ──────────────────────────────────────────────────────

export interface NavItem {
  path: string
  label: string
  icon: LucideIcon
}

interface NavSection {
  title: string
  items: NavItem[]
}

const dashboardItem: NavItem = {
  path: ROUTES.DASHBOARD, label: 'Dashboard', icon: LayoutDashboard,
}

const navigationSections: NavSection[] = [
  {
    title: 'Analytics',
    items: [
      { path: ROUTES.SPENDING_ANALYSIS, label: 'Expense Analysis', icon: BarChart3 },
      { path: ROUTES.INCOME_ANALYSIS, label: 'Income Analysis', icon: CircleDollarSign },
      { path: ROUTES.INCOME_EXPENSE_FLOW, label: 'Cash Flow', icon: ArrowRightLeft },
      { path: ROUTES.COMPARISON, label: 'Comparison', icon: GitCompareArrows },
      { path: ROUTES.YEAR_IN_REVIEW, label: 'Year in Review', icon: CalendarDays },
    ],
  },
  {
    title: 'Net Worth',
    items: [
      { path: ROUTES.NET_WORTH, label: 'Net Worth Tracker', icon: Wallet },
      { path: ROUTES.TRENDS_FORECASTS, label: 'Trends & Forecasts', icon: LineChart },
    ],
  },
  {
    title: 'Investments',
    items: [
      { path: ROUTES.INVESTMENT_ANALYTICS, label: 'Investment Analytics', icon: TrendingUp },
      { path: ROUTES.MUTUAL_FUND_PROJECTION, label: 'Projections', icon: Target },
      { path: ROUTES.RETURNS_ANALYSIS, label: 'Returns Analysis', icon: Coins },
    ],
  },
  {
    title: 'Transactions',
    items: [
      { path: ROUTES.TRANSACTIONS, label: 'Transactions', icon: Receipt },
    ],
  },
  {
    title: 'Tracking',
    items: [
      { path: ROUTES.SUBSCRIPTIONS, label: 'Recurring', icon: CreditCard },
      { path: ROUTES.BILL_CALENDAR, label: 'Bill Calendar', icon: CalendarDays },
    ],
  },
  {
    title: 'Planning',
    items: [
      { path: ROUTES.BUDGETS, label: 'Budget Manager', icon: Wallet2 },
      { path: ROUTES.GOALS, label: 'Financial Goals', icon: Goal },
      { path: ROUTES.FIRE_CALCULATOR, label: 'FIRE Calculator', icon: Flame },
      { path: ROUTES.INSIGHTS, label: 'Insights', icon: Lightbulb },
      { path: ROUTES.ANOMALIES, label: 'Anomaly Review', icon: AlertTriangle },
    ],
  },
  {
    title: 'Tax',
    items: [
      { path: ROUTES.TAX_PLANNING, label: 'Income Tax', icon: Landmark },
      { path: ROUTES.GST_ANALYSIS, label: 'Indirect Tax (GST)', icon: Receipt },
    ],
  },
]

const utilityItems: NavItem[] = [
  { path: ROUTES.UPLOAD, label: 'Upload & Sync', icon: Upload },
  { path: ROUTES.SETTINGS, label: 'Settings', icon: Settings2 },
]

// Alert-level badge routes (shown with red variant)
const ALERT_BADGE_ROUTES: Set<string> = new Set([ROUTES.ANOMALIES, ROUTES.BUDGETS])

// ─── Sub-components ─────────────────────────────────────────────────────────

function BrandHeader({
  user,
  onOpenProfile,
}: Readonly<{
  user: { full_name?: string | null; email: string } | null
  onOpenProfile: () => void
}>) {
  return (
    <button
      type="button"
      onClick={onOpenProfile}
      className="w-full flex items-center gap-3 px-4 py-4 border-b border-border hover:bg-white/[0.04] transition-colors duration-150 group/brand"
    >
      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-blue-500/15">
        <PiggyBank className="w-5 h-5 text-blue-400" />
      </div>
      <div className="flex-1 min-w-0 text-left">
        <p className="text-[15px] font-semibold text-white truncate leading-tight">
          Ledger Sync
        </p>
        <p className="text-xs text-text-tertiary truncate leading-tight mt-0.5">
          {user?.email || 'Financial Dashboard'}
        </p>
      </div>
      <ChevronDown
        size={16}
        className="text-text-quaternary flex-shrink-0 group-hover/brand:text-muted-foreground transition-colors duration-150"
      />
    </button>
  )
}


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
      {/* Mobile toggle */}
      <button
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 w-10 h-10 flex items-center justify-center rounded-xl bg-zinc-900/90 border border-white/[0.08] backdrop-blur-sm active:scale-95 transition-transform"
        aria-label={isMobileOpen ? 'Close menu' : 'Open menu'}
      >
        {isMobileOpen
          ? <X size={20} className="text-white" />
          : <Menu size={20} className="text-white" />}
      </button>

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed lg:sticky top-0 h-screen w-64 z-40',
          'bg-[#111113]/95 backdrop-blur-sm',
          'border-r border-border',
          'transition-transform duration-200 ease-out',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        <div className="flex flex-col h-full">
          {/* Brand Header */}
          <BrandHeader
            user={isDemoMode ? { email: 'Demo Mode' } : user}
            onOpenProfile={() => { if (!isDemoMode) setShowProfile(true) }}
          />

          {/* Search */}
          <div className="px-3 py-2 border-b border-border">
            <button
              onClick={openSearch}
              className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-text-tertiary hover:text-white transition-colors duration-150 text-sm"
              title="Search (⌘K)"
            >
              <Search size={15} className="flex-shrink-0" />
              <span className="flex-1 text-left">Search...</span>
              <kbd className="hidden sm:inline text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.08] text-text-quaternary font-medium">
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

          {/* Bottom icon bar */}
          <div className="border-t border-border px-3 py-2.5">
            <div className="flex items-center justify-center gap-1">
              <CurrencySwitcher />
              <NotificationCenter />
              {utilityItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={closeMobile}
                  className="w-9 h-9 flex items-center justify-center rounded-lg text-text-tertiary hover:text-white hover:bg-white/[0.06] transition-colors duration-150"
                  title={item.label}
                >
                  <item.icon size={18} />
                </Link>
              ))}
              {isDemoMode ? (
                <button
                  type="button"
                  onClick={() => exitDemoMode(queryClient, navigate)}
                  className="w-9 h-9 flex items-center justify-center rounded-lg text-text-tertiary hover:text-red-400 hover:bg-red-500/10 transition-colors duration-150"
                  title="Exit Demo"
                >
                  <LogOut size={18} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={logout.isPending}
                  className="w-9 h-9 flex items-center justify-center rounded-lg text-text-tertiary hover:text-red-400 hover:bg-red-500/10 transition-colors duration-150 disabled:opacity-50"
                  title="Sign out"
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
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-30 lg:hidden appearance-none border-none p-0 m-0 cursor-default w-full"
          onClick={() => setIsMobileOpen(false)}
          onKeyDown={(e) => e.key === 'Escape' && setIsMobileOpen(false)}
        />
      )}

      {/* Profile Modal */}
      <ProfileModal open={showProfile} onOpenChange={setShowProfile} />
    </>
  )
}
