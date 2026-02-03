import { useState } from 'react'
import { 
  LayoutDashboard,
  Upload,
  Receipt,
  TrendingUp,
  Receipt as TaxIcon,
  PiggyBank,
  BarChart3,
  TrendingUp as ForecastIcon,
  Menu,
  X,
  Settings,
  ArrowRightLeft
} from 'lucide-react'
import { ROUTES } from '@/constants'
import { rawColors } from '@/constants/colors'
import { cn } from '@/lib/cn'
import SidebarGroup from './SidebarGroup'
import SidebarItem from './SidebarItem'

const navigationGroups = [
  {
    id: 'overview',
    title: 'Overview',
    icon: LayoutDashboard,
    items: [
      { path: ROUTES.DASHBOARD, label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    id: 'networth',
    title: 'Net Worth',
    icon: PiggyBank,
    items: [
      { path: ROUTES.NET_WORTH, label: 'Net Worth Tracker', icon: PiggyBank },
      { path: ROUTES.TRENDS_FORECASTS, label: 'Trends & Forecasts', icon: ForecastIcon },
    ],
  },
  {
    id: 'analytics',
    title: 'Analytics',
    icon: BarChart3,
    items: [
      { path: ROUTES.SPENDING_ANALYSIS, label: 'Expense Analysis', icon: BarChart3 },
      { path: ROUTES.INCOME_ANALYSIS, label: 'Income Analysis', icon: TrendingUp },
      { path: ROUTES.INCOME_EXPENSE_FLOW, label: 'Cash Flow', icon: ArrowRightLeft },
    ],
  },
  {
    id: 'investments',
    title: 'Investments',
    icon: TrendingUp,
    items: [
      { path: ROUTES.INVESTMENT_ANALYTICS, label: 'Investment Analytics', icon: TrendingUp },
      { path: ROUTES.MUTUAL_FUND_PROJECTION, label: 'SIP Projections', icon: TrendingUp },
      { path: ROUTES.RETURNS_ANALYSIS, label: 'Returns Analysis', icon: BarChart3 },
    ],
  },
  {
    id: 'tax',
    title: 'Tax Planning',
    icon: TaxIcon,
    items: [
      { path: ROUTES.TAX_PLANNING, label: 'Tax Summary', icon: TaxIcon },
    ],
  },
  {
    id: 'transactions',
    title: 'Transactions',
    icon: Receipt,
    items: [
      { path: ROUTES.TRANSACTIONS, label: 'All Transactions', icon: Receipt },
    ],
  },
  {
    id: 'data',
    title: 'Settings',
    icon: Settings,
    items: [
      { path: ROUTES.UPLOAD, label: 'Upload & Sync', icon: Upload },
      { path: ROUTES.SETTINGS, label: 'Account Classification', icon: Settings },
    ],
  },
]

export default function Sidebar() {
  const [isMobileOpen, setIsMobileOpen] = useState(false)

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
          'fixed lg:sticky top-0 h-screen w-72 glass-ultra transition-all duration-500 ease-out z-40',
          'border-r border-white/[0.06]',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        <div className="flex flex-col h-full">
          {/* Header - iOS style */}
          <div className="p-6 border-b border-white/[0.06]">
            <div className="flex items-center gap-3">
              <div 
                className="p-2.5 rounded-2xl shadow-lg"
                style={{ 
                  background: `linear-gradient(to bottom right, ${rawColors.ios.blue}, ${rawColors.ios.indigo})`,
                  boxShadow: `0 10px 30px ${rawColors.ios.blue}33`
                }}
              >
                <PiggyBank className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-white tracking-tight">
                  Ledger Sync
                </h1>
                <p className="text-xs" style={{ color: rawColors.text.secondary }}>Financial Dashboard</p>
              </div>
            </div>
          </div>

          {/* Navigation - iOS style grouped list */}
          <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-2">
            {navigationGroups.map((group) => (
              <SidebarGroup
                key={group.id}
                title={group.title}
                icon={group.icon}
              >
                {group.items.map((item) => (
                  <SidebarItem
                    key={item.path}
                    to={item.path}
                    icon={item.icon}
                    label={item.label}
                  />
                ))}
              </SidebarGroup>
            ))}
          </nav>

          {/* Footer - iOS style */}
          <div className="p-4 border-t border-white/[0.06]">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#636366] font-medium">v1.0.0</span>
              <span className="text-[#48484a]">Built with ❤️</span>
            </div>
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
