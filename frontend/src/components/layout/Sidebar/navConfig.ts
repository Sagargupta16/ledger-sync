import {
  LayoutDashboard,
  Upload,
  Receipt,
  TrendingUp,
  Landmark,
  BarChart3,
  LineChart,
  ArrowRightLeft,
  Wallet,
  CircleDollarSign,
  Coins,
  Target,
  GitCompareArrows,
  CalendarDays,
  Wallet2,
  AlertTriangle,
  Goal,
  CreditCard,
  Settings2,
  Flame,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { ROUTES } from '@/constants'

export interface NavItem {
  path: string
  label: string
  icon: LucideIcon
}

export interface NavSection {
  title: string
  items: NavItem[]
}

export const dashboardItem: NavItem = {
  path: ROUTES.DASHBOARD, label: 'Dashboard', icon: LayoutDashboard,
}

export const navigationSections: NavSection[] = [
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

export const utilityItems: NavItem[] = [
  { path: ROUTES.UPLOAD, label: 'Upload & Sync', icon: Upload },
  { path: ROUTES.SETTINGS, label: 'Settings', icon: Settings2 },
]

// Alert-level badge routes (shown with red variant)
export const ALERT_BADGE_ROUTES: Set<string> = new Set([ROUTES.ANOMALIES, ROUTES.BUDGETS])
