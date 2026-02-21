import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
  SlidersHorizontal,
  LogOut,
  GitCompareArrows,
  CalendarDays,
  Wallet2,
  AlertTriangle,
  Goal,
  Lightbulb,
} from 'lucide-react'
import { ROUTES } from '@/constants'
import { rawColors } from '@/constants/colors'
import { cn } from '@/lib/cn'
import SidebarGroup from './SidebarGroup'
import SidebarItem from './SidebarItem'
import { useAuthStore } from '@/store/authStore'
import { useLogout } from '@/hooks/api/useAuth'

const SIDEBAR_COLLAPSED_KEY = 'ledger-sync-sidebar-collapsed'

const navigationGroups = [
  {
    id: 'overview',
    title: 'Overview',
    items: [
      { path: ROUTES.DASHBOARD, label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    id: 'networth',
    title: 'Net Worth',
    items: [
      { path: ROUTES.NET_WORTH, label: 'Net Worth Tracker', icon: Wallet },
      { path: ROUTES.TRENDS_FORECASTS, label: 'Trends & Forecasts', icon: LineChart },
    ],
  },
  {
    id: 'analytics',
    title: 'Analytics',
    items: [
      { path: ROUTES.SPENDING_ANALYSIS, label: 'Expense Analysis', icon: BarChart3 },
      { path: ROUTES.INCOME_ANALYSIS, label: 'Income Analysis', icon: CircleDollarSign },
      { path: ROUTES.INCOME_EXPENSE_FLOW, label: 'Cash Flow', icon: ArrowRightLeft },
      { path: ROUTES.COMPARISON, label: 'Comparison', icon: GitCompareArrows },
      { path: ROUTES.BUDGETS, label: 'Budget Manager', icon: Wallet2 },
      { path: ROUTES.YEAR_IN_REVIEW, label: 'Year in Review', icon: CalendarDays },
      { path: ROUTES.ANOMALIES, label: 'Anomaly Review', icon: AlertTriangle },
      { path: ROUTES.GOALS, label: 'Financial Goals', icon: Goal },
      { path: ROUTES.INSIGHTS, label: 'Financial Insights', icon: Lightbulb },
    ],
  },
  {
    id: 'investments',
    title: 'Investments',
    items: [
      { path: ROUTES.INVESTMENT_ANALYTICS, label: 'Investment Analytics', icon: TrendingUp },
      { path: ROUTES.MUTUAL_FUND_PROJECTION, label: 'SIP Projections', icon: Target },
      { path: ROUTES.RETURNS_ANALYSIS, label: 'Returns Analysis', icon: Coins },
    ],
  },
  {
    id: 'tax',
    title: 'Tax Planning',
    items: [
      { path: ROUTES.TAX_PLANNING, label: 'Tax Summary', icon: Landmark },
    ],
  },
  {
    id: 'transactions',
    title: 'Transactions',
    items: [
      { path: ROUTES.TRANSACTIONS, label: 'All Transactions', icon: Receipt },
    ],
  },
  {
    id: 'data',
    title: 'Settings',
    items: [
      { path: ROUTES.UPLOAD, label: 'Upload & Sync', icon: Upload },
      { path: ROUTES.SETTINGS, label: 'Account Classification', icon: SlidersHorizontal },
    ],
  },
]

export default function Sidebar() {
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(() => {
    // Load from localStorage on initial render
    if (globalThis.window !== undefined) {
      const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY)
      return saved === 'true'
    }
    return false
  })

  const { user } = useAuthStore()
  const logout = useLogout()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        navigate('/')
      }
    })
  }

  // Persist collapse state to localStorage
  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(isCollapsed))
  }, [isCollapsed])

  const toggleCollapse = () => setIsCollapsed(!isCollapsed)

  return (
    <>
      {/* Mobile toggle button - iOS style */}
      <button
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-3 rounded-2xl glass-strong shadow-xl shadow-black/20 active:scale-95 transition-transform"
        aria-label={isMobileOpen ? 'Close menu' : 'Open menu'}
      >
        {isMobileOpen ? <X size={22} className="text-white" /> : <Menu size={22} className="text-white" />}
      </button>

      {/* Sidebar - iOS Frosted Glass */}
      <aside
        className={cn(
          'fixed lg:sticky top-0 h-screen glass-ultra transition-colors duration-300 ease-out z-40',
          'border-r border-border',
          isCollapsed ? 'w-20' : 'w-72',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        <div className="flex flex-col h-full">
          {/* Header - iOS style */}
          <div className={cn("border-b border-border", isCollapsed ? "p-4" : "p-6")}>
            <Link to="/" className={cn(
              "flex items-center hover:opacity-80 transition-opacity",
              isCollapsed ? "justify-center" : "gap-3"
            )}>
              <div 
                className="p-2.5 rounded-2xl shadow-lg flex-shrink-0"
                style={{ 
                  background: `linear-gradient(to bottom right, ${rawColors.ios.blue}, ${rawColors.ios.indigo})`,
                  boxShadow: `0 10px 30px ${rawColors.ios.blue}33`
                }}
              >
                <PiggyBank className="w-6 h-6 text-white" />
              </div>
              {!isCollapsed && (
                <div>
                  <h1 className="text-xl font-semibold text-white tracking-tight">
                    Ledger Sync
                  </h1>
                  <p className="text-xs" style={{ color: rawColors.text.secondary }}>Financial Dashboard</p>
                </div>
              )}
            </Link>
          </div>

          {/* Navigation - iOS style grouped list */}
          <nav
            aria-label="Main navigation"
            className={cn(
            "flex-1 py-2 overflow-y-auto overflow-x-visible scrollbar-none",
            isCollapsed ? "px-2" : "px-3"
          )}>
            {navigationGroups.map((group) => (
              <SidebarGroup
                key={group.id}
                title={group.title}
                isCollapsed={isCollapsed}
              >
                {group.items.map((item) => (
                  <SidebarItem
                    key={item.path}
                    to={item.path}
                    icon={item.icon}
                    label={item.label}
                    isCollapsed={isCollapsed}
                  />
                ))}
              </SidebarGroup>
            ))}
          </nav>

          {/* Collapse Toggle Button */}
          <div className="p-2 border-t border-border">
            <button
              onClick={toggleCollapse}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2.5 rounded-xl transition-colors duration-200",
                "text-muted-foreground hover:bg-white/10 hover:text-white hover:scale-[1.02]",
                isCollapsed && "justify-center px-2"
              )}
              title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {isCollapsed ? (
                <ChevronsRight size={18} />
              ) : (
                <>
                  <ChevronsLeft size={18} />
                  <span className="text-sm">Collapse</span>
                </>
              )}
            </button>
          </div>

          {/* User Profile & Logout */}
          <div className={cn(
            "border-t border-border",
            isCollapsed ? "p-2" : "p-3"
          )}>
            {/* User Card */}
            {user && (
              <div className={cn(
                "rounded-xl transition-colors duration-200",
                isCollapsed ? "p-2" : "p-3 bg-white/5 hover:bg-white/10"
              )}>
                <div className={cn(
                  "flex items-center gap-3",
                  isCollapsed && "justify-center"
                )}>
                  {/* Avatar with initials */}
                  <div 
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg"
                    style={{ 
                      background: `linear-gradient(135deg, ${rawColors.ios.purple}, ${rawColors.ios.pink})`,
                      boxShadow: `0 4px 12px ${rawColors.ios.purple}40`
                    }}
                  >
                    <span className="text-white font-semibold text-sm">
                      {(user.full_name || user.email)[0].toUpperCase()}
                    </span>
                  </div>
                  {!isCollapsed && (
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">
                        {user.full_name || user.email.split('@')[0]}
                      </p>
                      <p className="text-xs truncate" style={{ color: rawColors.text.tertiary }}>
                        {user.email}
                      </p>
                    </div>
                  )}
                </div>
                
                {/* Sign Out Button */}
                {!isCollapsed && (
                  <button
                    onClick={handleLogout}
                    disabled={logout.isPending}
                    className={cn(
                      "w-full flex items-center justify-center gap-2 mt-3 px-3 py-2 rounded-lg transition-colors duration-200",
                      "text-ios-red-vibrant/80 hover:text-ios-red-vibrant bg-ios-red-vibrant/5 hover:bg-ios-red-vibrant/10",
                      "text-xs font-medium",
                      "disabled:opacity-50 disabled:cursor-not-allowed"
                    )}
                  >
                    <LogOut size={14} />
                    <span>{logout.isPending ? 'Signing out...' : 'Sign Out'}</span>
                  </button>
                )}
              </div>
            )}

            {/* Collapsed Sign Out Button */}
            {isCollapsed && (
              <button
                onClick={handleLogout}
                disabled={logout.isPending}
                className={cn(
                  "w-full flex items-center justify-center mt-2 p-2 rounded-xl transition-colors duration-200",
                  "text-ios-red-vibrant hover:bg-ios-red-vibrant/10",
                  "disabled:opacity-50 disabled:cursor-not-allowed"
                )}
                title="Sign out"
              >
                <LogOut size={18} />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile overlay - iOS blur style */}
      {isMobileOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          className="fixed inset-0 bg-black/40 backdrop-blur-xl z-30 lg:hidden appearance-none border-none p-0 m-0 cursor-default w-full"
          onClick={() => setIsMobileOpen(false)}
          onKeyDown={(e) => e.key === 'Escape' && setIsMobileOpen(false)}
        />
      )}
    </>
  )
}
