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
  Compass,
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

/**
 * Overview -- the single "whole picture" page (cash flow + net worth + goals +
 * budget status), sits right under Dashboard as a top-level entry.
 */
export const overviewItem: NavItem = {
  path: ROUTES.OVERVIEW, label: 'Overview', icon: Compass,
}

/**
 * Transactions is a first-class destination (it's one of the four mobile tabs),
 * so it sits top-level with Dashboard and Overview rather than alone in a
 * single-item "Data" group.
 */
export const transactionsItem: NavItem = {
  path: ROUTES.TRANSACTIONS, label: 'Transactions', icon: Receipt,
}

/**
 * Sections are ordered to follow the natural money decision-flow --
 * "where did it go -> what comes in -> what's left -> grow it -> plan ahead ->
 * what I owe" -- so the sidebar reads like how people think about their money
 * (mental-model fit) rather than by implementation area.
 *
 * IA changes (2026-06-28, from the IA audit):
 *  - Net Worth + Investments merged into one "Wealth" domain section (D).
 *  - The single-item "Transactions" dead-end section folded into a bottom
 *    "Data" section alongside Upload & Sync and Settings (C + elevate Upload, E).
 *  - "Tracking" renamed "Commitments" to signal subscriptions/bills intent.
 */
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
    title: 'Wealth',
    items: [
      { path: ROUTES.NET_WORTH, label: 'Net Worth Tracker', icon: Wallet },
      { path: ROUTES.TRENDS_FORECASTS, label: 'Trends & Forecasts', icon: LineChart },
      { path: ROUTES.INVESTMENT_ANALYTICS, label: 'Investment Analytics', icon: TrendingUp },
      { path: ROUTES.MUTUAL_FUND_PROJECTION, label: 'Projections', icon: Target },
      { path: ROUTES.RETURNS_ANALYSIS, label: 'Returns Analysis', icon: Coins },
    ],
  },
  {
    title: 'Commitments',
    items: [
      { path: ROUTES.SUBSCRIPTIONS, label: 'Recurring', icon: CreditCard },
      { path: ROUTES.BILL_CALENDAR, label: 'Bill Calendar', icon: CalendarDays },
    ],
  },
  {
    title: 'Planning',
    items: [
      { path: ROUTES.BUDGETS, label: 'Budget Rule', icon: Wallet2 },
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

/**
 * Bottom utility bar is the single home for Upload & Sync and Settings --
 * always visible above the profile, no scrolling through the nav groups.
 * They were previously duplicated in the Data section; the duplication read
 * as two different destinations, so the list entries were dropped.
 */
export const utilityItems: NavItem[] = [
  { path: ROUTES.UPLOAD, label: 'Upload & Sync', icon: Upload },
  { path: ROUTES.SETTINGS, label: 'Settings', icon: Settings2 },
]

// Alert-level badge routes (shown with red variant)
export const ALERT_BADGE_ROUTES: Set<string> = new Set([ROUTES.ANOMALIES, ROUTES.BUDGETS])
