import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom'
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
  ChevronsLeft,
  ChevronsRight,
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
  Star,
  Settings2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ROUTES } from '@/constants'
import { rawColors } from '@/constants/colors'
import { cn } from '@/lib/cn'
import SidebarGroup from './SidebarGroup'
import SidebarItem from './SidebarItem'
import { useAuthStore } from '@/store/authStore'
import { useLogout } from '@/hooks/api/useAuth'
import NotificationCenter from '@/components/shared/NotificationCenter'
import ProfileModal from '@/components/shared/ProfileModal'
import { useBudgets, useAnomalies, useRecurringTransactions } from '@/hooks/api/useAnalyticsV2'

// ─── Storage keys ───────────────────────────────────────────────────────────

const SIDEBAR_COLLAPSED_KEY = 'ledger-sync-sidebar-collapsed'
const COLLAPSED_GROUPS_KEY = 'ledger-sync-sidebar-collapsed-groups'
const FAVORITES_KEY = 'ledger-sync-sidebar-favorites'

// ─── Navigation config ──────────────────────────────────────────────────────

export interface NavItem {
  path: string
  label: string
  icon: LucideIcon
}

export interface NavGroup {
  id: string
  title: string
  icon: LucideIcon
  items: NavItem[]
}

const navigationGroups: NavGroup[] = [
  {
    id: 'overview',
    title: 'Overview',
    icon: LayoutDashboard,
    items: [
      { path: ROUTES.DASHBOARD, label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    id: 'tracking',
    title: 'Tracking',
    icon: Receipt,
    items: [
      { path: ROUTES.TRANSACTIONS, label: 'Transactions', icon: Receipt },
      { path: ROUTES.SUBSCRIPTIONS, label: 'Subscriptions', icon: CreditCard },
      { path: ROUTES.BILL_CALENDAR, label: 'Bill Calendar', icon: CalendarDays },
    ],
  },
  {
    id: 'analytics',
    title: 'Analytics',
    icon: BarChart3,
    items: [
      { path: ROUTES.SPENDING_ANALYSIS, label: 'Expense Analysis', icon: BarChart3 },
      { path: ROUTES.INCOME_ANALYSIS, label: 'Income Analysis', icon: CircleDollarSign },
      { path: ROUTES.INCOME_EXPENSE_FLOW, label: 'Cash Flow', icon: ArrowRightLeft },
      { path: ROUTES.COMPARISON, label: 'Comparison', icon: GitCompareArrows },
      { path: ROUTES.YEAR_IN_REVIEW, label: 'Year in Review', icon: CalendarDays },
    ],
  },
  {
    id: 'planning',
    title: 'Planning',
    icon: Lightbulb,
    items: [
      { path: ROUTES.BUDGETS, label: 'Budget Manager', icon: Wallet2 },
      { path: ROUTES.GOALS, label: 'Financial Goals', icon: Goal },
      { path: ROUTES.INSIGHTS, label: 'Insights', icon: Lightbulb },
      { path: ROUTES.ANOMALIES, label: 'Anomaly Review', icon: AlertTriangle },
    ],
  },
  {
    id: 'networth',
    title: 'Net Worth',
    icon: Wallet,
    items: [
      { path: ROUTES.NET_WORTH, label: 'Net Worth Tracker', icon: Wallet },
      { path: ROUTES.TRENDS_FORECASTS, label: 'Trends & Forecasts', icon: LineChart },
    ],
  },
  {
    id: 'investments',
    title: 'Investments',
    icon: TrendingUp,
    items: [
      { path: ROUTES.INVESTMENT_ANALYTICS, label: 'Investment Analytics', icon: TrendingUp },
      { path: ROUTES.MUTUAL_FUND_PROJECTION, label: 'SIP Projections', icon: Target },
      { path: ROUTES.RETURNS_ANALYSIS, label: 'Returns Analysis', icon: Coins },
    ],
  },
  {
    id: 'tax',
    title: 'Tax Planning',
    icon: Landmark,
    items: [
      { path: ROUTES.TAX_PLANNING, label: 'Tax Summary', icon: Landmark },
    ],
  },
]

const bottomItems: NavItem[] = [
  { path: ROUTES.UPLOAD, label: 'Upload & Sync', icon: Upload },
  { path: ROUTES.SETTINGS, label: 'Settings', icon: Settings2 },
]

// ─── Helpers ────────────────────────────────────────────────────────────────

function loadSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key)
    if (raw) return new Set(JSON.parse(raw) as string[])
  } catch { /* ignore corrupt data */ }
  return new Set()
}

function saveSet(key: string, set: Set<string>) {
  localStorage.setItem(key, JSON.stringify([...set]))
}

// All items flat lookup (module-level constant)
const allItemsMap = new Map<string, NavItem>()
for (const group of navigationGroups) {
  for (const item of group.items) allItemsMap.set(item.path, item)
}
for (const item of bottomItems) allItemsMap.set(item.path, item)

// ─── Extracted sub-components ────────────────────────────────────────────────

function MobileToggleButton({
  isMobileOpen,
  onToggle,
}: Readonly<{
  isMobileOpen: boolean
  onToggle: () => void
}>) {
  return (
    <button
      onClick={onToggle}
      className="lg:hidden fixed top-4 left-4 z-50 w-11 h-11 flex items-center justify-center rounded-2xl glass-strong shadow-xl shadow-black/20 active:scale-95 transition-transform"
      aria-label={isMobileOpen ? 'Close menu' : 'Open menu'}
    >
      {isMobileOpen
        ? <X size={22} className="text-white" />
        : <Menu size={22} className="text-white" />}
    </button>
  )
}

function UserProfileButton({
  user,
  isCollapsed,
  onOpenProfile,
  onLogout,
  isPending,
}: Readonly<{
  user: { full_name?: string | null; email: string } | null
  isCollapsed: boolean
  onOpenProfile: () => void
  onLogout: () => void
  isPending: boolean
}>) {
  if (!user) return null

  const initials = (user.full_name || user.email)[0].toUpperCase()

  return (
    <div className={cn(
      'border-t border-border',
      isCollapsed ? 'p-2' : 'p-3',
    )}>
      <div className={cn(
        'flex items-center',
        isCollapsed ? 'flex-col gap-2' : 'gap-3',
      )}>
        {/* Avatar — always clickable */}
        <button
          type="button"
          onClick={onOpenProfile}
          className="flex-shrink-0 group/avatar"
          title="View Profile"
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg transition-transform group-hover/avatar:scale-105"
            style={{
              background: `linear-gradient(135deg, ${rawColors.ios.purple}, ${rawColors.ios.pink})`,
              boxShadow: `0 4px 12px ${rawColors.ios.purple}40`,
            }}
          >
            <span className="text-white font-semibold text-sm">{initials}</span>
          </div>
        </button>

        {/* Expanded: name + "View Profile" */}
        {!isCollapsed && (
          <button
            type="button"
            onClick={onOpenProfile}
            className="flex-1 min-w-0 text-left group/profile"
          >
            <p className="text-sm font-semibold text-white truncate">
              {user.full_name || user.email.split('@')[0]}
            </p>
            <p className="text-xs text-muted-foreground group-hover/profile:text-primary transition-colors">
              View Profile
            </p>
          </button>
        )}

        {/* Sign Out quick button */}
        <button
          type="button"
          onClick={onLogout}
          disabled={isPending}
          className={cn(
            'flex items-center justify-center rounded-lg transition-colors duration-200',
            'text-ios-red-vibrant/70 hover:text-ios-red-vibrant hover:bg-ios-red-vibrant/10',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            isCollapsed ? 'w-10 h-10' : 'w-9 h-9 flex-shrink-0',
          )}
          title="Sign out"
        >
          <LogOut size={isCollapsed ? 18 : 16} />
        </button>
      </div>
    </div>
  )
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function Sidebar() {
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (globalThis.window === undefined) {
      return false
    }
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true'
  })
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => loadSet(COLLAPSED_GROUPS_KEY),
  )
  const [favorites, setFavorites] = useState<Set<string>>(
    () => loadSet(FAVORITES_KEY),
  )
  const [scrollState, setScrollState] = useState({ top: false, bottom: false })
  const [showProfile, setShowProfile] = useState(false)

  const navRef = useRef<HTMLElement>(null)
  const { user } = useAuthStore()
  const logout = useLogout()
  const navigate = useNavigate()
  const location = useLocation()

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

  // ── Favorites ───────────────────────────────────────────────────────────

  const favoriteItems = useMemo(
    () =>
      [...favorites]
        .map((path) => allItemsMap.get(path))
        .filter((item): item is NavItem => item !== undefined),
    [favorites],
  )

  // ── Active group detection ──────────────────────────────────────────────

  const isGroupActive = useCallback(
    (group: NavGroup) =>
      group.items.some((item) => location.pathname === item.path),
    [location.pathname],
  )

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleLogout = () => {
    logout.mutate(undefined, { onSuccess: () => navigate('/') })
  }

  const toggleCollapse = () => setIsCollapsed((v) => !v)

  const toggleGroupCollapsed = useCallback((groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      saveSet(COLLAPSED_GROUPS_KEY, next)
      return next
    })
  }, [])

  const toggleFavorite = useCallback((path: string) => {
    setFavorites((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      saveSet(FAVORITES_KEY, next)
      return next
    })
  }, [])

  const openSearch = useCallback(() => {
    document.dispatchEvent(new CustomEvent('open-command-palette'))
  }, [])

  const closeMobile = useCallback(() => setIsMobileOpen(false), [])

  // ── Persist sidebar collapse state ──────────────────────────────────────

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(isCollapsed))
  }, [isCollapsed])

  // ── Scroll indicators ─────────────────────────────────────────────────

  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const handleScroll = () => {
      setScrollState({
        top: nav.scrollTop > 0,
        bottom: nav.scrollHeight - nav.scrollTop - nav.clientHeight > 1,
      })
    }
    handleScroll()
    nav.addEventListener('scroll', handleScroll, { passive: true })
    const ro = new ResizeObserver(handleScroll)
    ro.observe(nav)
    return () => {
      nav.removeEventListener('scroll', handleScroll)
      ro.disconnect()
    }
  }, [])

  return (
    <>
      <MobileToggleButton
        isMobileOpen={isMobileOpen}
        onToggle={() => setIsMobileOpen(!isMobileOpen)}
      />

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed lg:sticky top-0 h-screen glass-ultra transition-colors duration-300 ease-out z-40',
          'border-r border-border',
          isCollapsed ? 'w-20' : 'w-72',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        <div className="flex flex-col h-full">
          {/* Header — Logo */}
          <div className={cn('border-b border-border', isCollapsed ? 'p-4' : 'p-6')}>
            <Link
              to="/"
              className={cn(
                'flex items-center hover:opacity-80 transition-opacity',
                isCollapsed ? 'justify-center' : 'gap-3',
              )}
            >
              <div
                className="p-2.5 rounded-2xl shadow-lg flex-shrink-0"
                style={{
                  background: `linear-gradient(to bottom right, ${rawColors.ios.blue}, ${rawColors.ios.indigo})`,
                  boxShadow: `0 10px 30px ${rawColors.ios.blue}33`,
                }}
              >
                <PiggyBank className="w-6 h-6 text-white" />
              </div>
              {!isCollapsed && (
                <div>
                  <h1 className="text-xl font-semibold text-white tracking-tight">
                    Ledger Sync
                  </h1>
                  <p className="text-xs" style={{ color: rawColors.text.secondary }}>
                    Financial Dashboard
                  </p>
                </div>
              )}
            </Link>
          </div>

          {/* Search button */}
          <div className={cn('border-b border-border', isCollapsed ? 'p-2' : 'px-3 py-2')}>
            <button
              onClick={openSearch}
              className={cn(
                'flex items-center gap-2 w-full rounded-xl transition-colors duration-200',
                'bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-white',
                isCollapsed ? 'justify-center p-2.5' : 'px-3 py-2',
              )}
              title="Search (⌘K)"
            >
              <Search size={16} className="flex-shrink-0" />
              {!isCollapsed && (
                <>
                  <span className="text-sm">Search...</span>
                  <kbd className="ml-auto text-[10px] px-1.5 py-0.5 rounded-md bg-white/5 border border-white/10 text-text-tertiary font-medium">
                    ⌘K
                  </kbd>
                </>
              )}
            </button>
          </div>

          {/* Main scrollable navigation */}
          <div className="relative flex-1 min-h-0">
            {/* Top scroll indicator */}
            {scrollState.top && (
              <div className="absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-[rgba(18,18,18,0.9)] to-transparent pointer-events-none z-10" />
            )}

            <nav
              ref={navRef}
              aria-label="Main navigation"
              className={cn(
                'h-full py-2 overflow-y-auto overflow-x-visible scrollbar-none',
                isCollapsed ? 'px-2' : 'px-3',
              )}
            >
              {/* Favorites section */}
              {favoriteItems.length > 0 && (
                <div className="pb-2 mb-1 border-b border-border">
                  {!isCollapsed && (
                    <div className="flex items-center gap-2 px-3 py-2 mb-1">
                      <Star size={12} className="text-ios-yellow" />
                      <span className="text-overline font-semibold text-ios-yellow/70 uppercase tracking-wider">
                        Favorites
                      </span>
                    </div>
                  )}
                  <div className={cn(
                    'space-y-0.5',
                    !isCollapsed && 'rounded-xl bg-ios-yellow/[0.08] border border-ios-yellow/20 p-1',
                  )}>
                    {favoriteItems.map((item) => (
                      <SidebarItem
                        key={`fav-${item.path}`}
                        to={item.path}
                        icon={item.icon}
                        label={item.label}
                        isCollapsed={isCollapsed}
                        badge={badgeCounts[item.path]}
                        isFavorite
                        onToggleFavorite={() => toggleFavorite(item.path)}
                        onNavigate={closeMobile}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Navigation groups */}
              {navigationGroups.map((group) => (
                <SidebarGroup
                  key={group.id}
                  id={group.id}
                  title={group.title}
                  groupIcon={group.icon}
                  isCollapsed={isCollapsed}
                  isExpanded={!collapsedGroups.has(group.id)}
                  onToggle={() => toggleGroupCollapsed(group.id)}
                  isActive={isGroupActive(group)}
                >
                  {group.items.map((item) => (
                    <SidebarItem
                      key={item.path}
                      to={item.path}
                      icon={item.icon}
                      label={item.label}
                      isCollapsed={isCollapsed}
                      badge={badgeCounts[item.path]}
                      isFavorite={favorites.has(item.path)}
                      onToggleFavorite={() => toggleFavorite(item.path)}
                      onNavigate={closeMobile}
                    />
                  ))}
                </SidebarGroup>
              ))}
            </nav>

            {/* Bottom scroll indicator */}
            {scrollState.bottom && (
              <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-[rgba(18,18,18,0.9)] to-transparent pointer-events-none z-10" />
            )}
          </div>

          {/* Bottom-pinned: compact icon buttons + collapse + notifications */}
          <div className="border-t border-border p-2 space-y-1">
            {/* Upload & Settings — compact icon-only row */}
            <div className="flex items-center gap-2 justify-center">
              {bottomItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={closeMobile}
                  className={({ isActive }) =>
                    cn(
                      'w-9 h-9 rounded-lg flex items-center justify-center relative group/bottom transition-colors duration-200',
                      isActive
                        ? 'bg-primary/20 text-primary'
                        : 'text-muted-foreground hover:bg-white/10 hover:text-white',
                    )
                  }
                  title={item.label}
                >
                  <item.icon size={18} />
                  {/* Tooltip */}
                  <span className="absolute left-full ml-2 px-2 py-1 rounded bg-surface-tooltip text-xs text-white whitespace-nowrap opacity-0 group-hover/bottom:opacity-100 transition-opacity pointer-events-none border border-border shadow-lg z-50">
                    {item.label}
                  </span>
                </NavLink>
              ))}

              {/* Collapse toggle */}
              <button
                onClick={toggleCollapse}
                className="w-9 h-9 rounded-lg flex items-center justify-center relative group/bottom text-muted-foreground hover:bg-white/10 hover:text-white transition-colors duration-200"
                title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {isCollapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
                <span className="absolute left-full ml-2 px-2 py-1 rounded bg-surface-tooltip text-xs text-white whitespace-nowrap opacity-0 group-hover/bottom:opacity-100 transition-opacity pointer-events-none border border-border shadow-lg z-50">
                  {isCollapsed ? 'Expand' : 'Collapse'}
                </span>
              </button>
            </div>

            <NotificationCenter isCollapsed={isCollapsed} />
          </div>

          {/* User Profile & Logout */}
          <UserProfileButton
            user={user}
            isCollapsed={isCollapsed}
            onOpenProfile={() => setShowProfile(true)}
            onLogout={handleLogout}
            isPending={logout.isPending}
          />
        </div>
      </aside>

      {/* Mobile overlay */}
      {isMobileOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          className="fixed inset-0 bg-black/40 backdrop-blur-xl z-30 lg:hidden appearance-none border-none p-0 m-0 cursor-default w-full"
          onClick={() => setIsMobileOpen(false)}
          onKeyDown={(e) => e.key === 'Escape' && setIsMobileOpen(false)}
        />
      )}

      {/* Profile Modal */}
      <ProfileModal open={showProfile} onOpenChange={setShowProfile} />
    </>
  )
}
