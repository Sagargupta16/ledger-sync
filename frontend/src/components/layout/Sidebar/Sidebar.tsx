import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
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
  SlidersHorizontal
} from 'lucide-react'
import { ROUTES } from '@/constants'
import { rawColors } from '@/constants/colors'
import { cn } from '@/lib/cn'
import SidebarGroup from './SidebarGroup'
import SidebarItem from './SidebarItem'

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
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY)
      return saved === 'true'
    }
    return false
  })

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
          'fixed lg:sticky top-0 h-screen glass-ultra transition-all duration-300 ease-out z-40',
          'border-r border-white/[0.06]',
          isCollapsed ? 'w-20 overflow-visible' : 'w-72',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        <div className={cn("flex flex-col h-full", isCollapsed && "overflow-visible")}>
          {/* Header - iOS style */}
          <div className={cn("border-b border-white/[0.06]", isCollapsed ? "p-4" : "p-6")}>
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
          <nav className={cn(
            "flex-1 py-2",
            isCollapsed ? "px-2 overflow-visible" : "px-3 overflow-y-auto"
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
          <div className="p-2 border-t border-white/[0.06]">
            <button
              onClick={toggleCollapse}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2.5 rounded-xl transition-all duration-200",
                "text-[#98989f] hover:bg-white/[0.08] hover:text-white hover:scale-[1.02]",
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
        </div>
      </aside>

      {/* Mobile overlay - iOS blur style */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-xl z-30 lg:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}
    </>
  )
}
