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
  Settings
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
    id: 'data',
    title: '📁 Data Management',
    icon: Upload,
    items: [
      { path: ROUTES.UPLOAD, label: 'Upload & Sync', icon: Upload },
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
    id: 'networth',
    title: '📈 Net Worth',
    icon: PiggyBank,
    items: [
      { path: ROUTES.NET_WORTH, label: 'Net Worth Tracker', icon: PiggyBank },
    ],
  },
  {
    id: 'spending',
    title: '📊 Spending Analysis',
    icon: BarChart3,
    items: [
      { path: ROUTES.SPENDING_ANALYSIS, label: 'Category Spending', icon: BarChart3 },
      { path: ROUTES.INCOME_ANALYSIS, label: 'Income Analysis', icon: TrendingUp },
    ],
  },
  {
    id: 'forecasts',
    title: '🔮 Trends & Forecasts',
    icon: ForecastIcon,
    items: [
      { path: ROUTES.TRENDS_FORECASTS, label: 'Forecasts', icon: ForecastIcon },
    ],
  },
  {
    id: 'settings',
    title: '⚙️ Settings',
    icon: Settings,
    items: [
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
          'fixed lg:sticky top-0 h-screen glass-strong border-r border-border/50 transition-all duration-300 z-40 shadow-2xl',
          isCollapsed ? 'w-16' : 'w-64',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-4 border-b border-border/50 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              {!isCollapsed && (
                <h1 className="text-xl font-bold bg-gradient-to-r from-primary via-purple-400 to-secondary bg-clip-text text-transparent drop-shadow-lg">
                  Ledger Sync
                </h1>
              )}
              <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="hidden lg:block p-1 rounded hover:bg-white/10 transition-colors"
              >
                {isCollapsed ? <ChevronRight size={20} /> : <ChevronDown size={20} />}
              </button>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-2 scrollbar-thin">
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
          <div className="p-4 border-t border-border/50 backdrop-blur-sm">
            {!isCollapsed && (
              <div className="text-xs text-muted-foreground">
                v1.0.0 | Built with ❤️
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
