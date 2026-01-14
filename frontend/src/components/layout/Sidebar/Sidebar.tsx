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
  ChevronDown,
  ChevronRight,
  Menu,
  X,
  Settings,
  ArrowRightLeft
} from 'lucide-react'
import { ROUTES } from '@/constants'
import { cn } from '@/lib/cn'
import SidebarGroup from './SidebarGroup'
import SidebarItem from './SidebarItem'

const navigationGroups = [
  {
    id: 'overview',
    title: '📊 Overview',
    icon: LayoutDashboard,
    items: [
      { path: ROUTES.DASHBOARD, label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    id: 'networth',
    title: '📈 Net Worth & Forecasts',
    icon: PiggyBank,
    items: [
      { path: ROUTES.NET_WORTH, label: 'Net Worth Tracker', icon: PiggyBank },
      { path: ROUTES.TRENDS_FORECASTS, label: 'Trends & Forecasts', icon: ForecastIcon },
    ],
  },
  {
    id: 'analytics',
    title: '📊 Financial Analytics',
    icon: BarChart3,
    items: [
      { path: ROUTES.SPENDING_ANALYSIS, label: 'Expense Analysis', icon: BarChart3 },
      { path: ROUTES.INCOME_ANALYSIS, label: 'Income Analysis', icon: TrendingUp },
      { path: ROUTES.INCOME_EXPENSE_FLOW, label: 'Cash Flow', icon: ArrowRightLeft },
    ],
  },
  {
    id: 'investments',
    title: '💼 Investments',
    icon: TrendingUp,
    items: [
      { path: ROUTES.INVESTMENT_ANALYTICS, label: 'Investment Analytics', icon: TrendingUp },
      { path: ROUTES.MUTUAL_FUND_PROJECTION, label: 'SIP Projections', icon: TrendingUp },
      { path: ROUTES.RETURNS_ANALYSIS, label: 'Returns Analysis', icon: BarChart3 },
    ],
  },
  {
    id: 'tax',
    title: '💳 Tax Planning',
    icon: TaxIcon,
    items: [
      { path: ROUTES.TAX_PLANNING, label: 'Tax Summary', icon: TaxIcon },
    ],
  },
  {
    id: 'transactions',
    title: '💰 Transactions',
    icon: Receipt,
    items: [
      { path: ROUTES.TRANSACTIONS, label: 'All Transactions', icon: Receipt },
    ],
  },
  {
    id: 'data',
    title: '⚙️ Settings & Data',
    icon: Settings,
    items: [
      { path: ROUTES.UPLOAD, label: 'Upload & Sync', icon: Upload },
      { path: ROUTES.SETTINGS, label: 'Account Classification', icon: Settings },
    ],
  },
]

export default function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)

  return (
    <>
      {/* Mobile toggle button */}
      <button
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg glass-strong shadow-lg"
      >
        {isMobileOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed lg:sticky top-0 h-screen bg-gradient-to-b from-gray-900 via-gray-900/95 to-gray-950 border-r border-purple-500/20 transition-all duration-300 z-40 shadow-2xl backdrop-blur-xl',
          isCollapsed ? 'w-20' : 'w-72',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-6 border-b border-purple-500/20 bg-gradient-to-r from-purple-900/20 to-blue-900/20">
            <div className="flex items-center justify-between">
              {!isCollapsed && (
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-purple-500 to-blue-500 rounded-xl shadow-lg shadow-purple-500/50">
                    <PiggyBank className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent drop-shadow-lg">
                      Ledger Sync
                    </h1>
                    <p className="text-xs text-gray-400">Financial Dashboard</p>
                  </div>
                </div>
              )}
              {isCollapsed && (
                <div className="p-2 bg-gradient-to-br from-purple-500 to-blue-500 rounded-xl shadow-lg shadow-purple-500/50 mx-auto">
                  <PiggyBank className="w-6 h-6 text-white" />
                </div>
              )}
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-1 scrollbar-thin scrollbar-thumb-purple-500/20 scrollbar-track-transparent">
            {navigationGroups.map((group) => (
              <SidebarGroup
                key={group.id}
                title={group.title}
                icon={group.icon}
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

          {/* Footer */}
          <div className="p-4 border-t border-purple-500/20 bg-gradient-to-r from-purple-900/10 to-blue-900/10">
            {!isCollapsed && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">v1.0.0</span>
                <span className="text-gray-500">Built with ❤️</span>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-md z-30 lg:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}
    </>
  )
}
