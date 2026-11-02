import {
  AlertTriangle,
  ArrowRightLeft,
  BarChart3,
  CalendarDays,
  CircleDollarSign,
  Coins,
  Compass,
  CreditCard,
  FileText,
  Flame,
  GitCompareArrows,
  Globe,
  Goal,
  HeartPulse,
  Landmark,
  LayoutDashboard,
  LineChart,
  ListChecks,
  Receipt,
  SlidersHorizontal,
  Sparkles,
  Store,
  Target,
  TrendingUp,
  Upload,
  Wallet,
  Wallet2,
  type LucideIcon,
} from 'lucide-react'

import { ROUTES } from '@/constants'
import type { Transaction } from '@/types'

export interface PageEntry {
  path: string
  label: string
  icon: LucideIcon
  keywords: string[]
}

export const PAGE_ENTRIES: PageEntry[] = [
  { path: ROUTES.DASHBOARD, label: 'Dashboard', icon: LayoutDashboard, keywords: ['home', 'summary'] },
  { path: ROUTES.OVERVIEW, label: 'Overview', icon: Compass, keywords: ['whole picture', 'complete picture', 'summary'] },
  { path: ROUTES.UPLOAD, label: 'Upload & Sync', icon: Upload, keywords: ['import', 'csv', 'file', 'data'] },
  { path: ROUTES.TRANSACTIONS, label: 'All Transactions', icon: Receipt, keywords: ['payments', 'history', 'list'] },
  { path: ROUTES.SPENDING_ANALYSIS, label: 'Expense Analysis', icon: BarChart3, keywords: ['spending', 'categories', 'breakdown'] },
  { path: ROUTES.MERCHANT_INTELLIGENCE, label: 'Merchant Intelligence', icon: Store, keywords: ['merchants', 'payees', 'shops', 'vendors'] },
  { path: ROUTES.INCOME_ANALYSIS, label: 'Income Analysis', icon: CircleDollarSign, keywords: ['earnings', 'revenue', 'salary'] },
  { path: ROUTES.INCOME_EXPENSE_FLOW, label: 'Cash Flow', icon: ArrowRightLeft, keywords: ['money', 'flow', 'income expense'] },
  { path: ROUTES.COMPARISON, label: 'Comparison', icon: GitCompareArrows, keywords: ['compare', 'vs', 'difference', 'period'] },
  { path: ROUTES.TRENDS_FORECASTS, label: 'Trends & Forecasts', icon: LineChart, keywords: ['prediction', 'future', 'projection'] },
  { path: ROUTES.NET_WORTH, label: 'Net Worth Tracker', icon: Wallet, keywords: ['assets', 'liabilities', 'balance', 'wealth'] },
  { path: ROUTES.INVESTMENT_ANALYTICS, label: 'Investment Analytics', icon: TrendingUp, keywords: ['portfolio', 'stocks', 'returns'] },
  { path: ROUTES.MUTUAL_FUND_PROJECTION, label: 'SIP Projections', icon: Target, keywords: ['mutual fund', 'sip', 'forecast'] },
  { path: ROUTES.RETURNS_ANALYSIS, label: 'Returns Analysis', icon: Coins, keywords: ['roi', 'gains', 'performance'] },
  { path: ROUTES.TAX_PLANNING, label: 'Income Tax', icon: Landmark, keywords: ['tax', 'deductions', '80c', 'planning', 'income tax'] },
  { path: ROUTES.GST_ANALYSIS, label: 'Indirect Tax (GST)', icon: Receipt, keywords: ['gst', 'indirect tax', 'vat', 'goods services'] },
  { path: ROUTES.FOREIGN_ASSETS, label: 'Foreign Assets', icon: Globe, keywords: ['schedule fa', 'rsu', 'foreign', 'shares', 'dividend'] },
  { path: ROUTES.AIS_IMPORT, label: 'AIS Import', icon: FileText, keywords: ['ais', 'annual information statement', 'tis', 'tds'] },
  { path: ROUTES.BUDGETS, label: 'Budget Manager', icon: Wallet2, keywords: ['budget', 'plan', 'limit', 'allocation'] },
  { path: ROUTES.SUBSCRIPTIONS, label: 'Recurring', icon: CreditCard, keywords: ['subscriptions', 'recurring', 'repeating'] },
  { path: ROUTES.BILL_CALENDAR, label: 'Bill Calendar', icon: CalendarDays, keywords: ['bills', 'due dates', 'calendar', 'upcoming'] },
  { path: ROUTES.GOALS, label: 'Financial Goals', icon: Goal, keywords: ['savings goal', 'target', 'milestone'] },
  { path: ROUTES.FIRE_CALCULATOR, label: 'FIRE Calculator', icon: Flame, keywords: ['fire', 'retirement', 'financial independence', 'corpus'] },
  { path: ROUTES.ANOMALIES, label: 'Anomaly Review', icon: AlertTriangle, keywords: ['unusual', 'suspicious', 'outlier'] },
  { path: ROUTES.REVIEW_QUEUE, label: 'Review Queue', icon: ListChecks, keywords: ['review', 'categorize', 'confirm', 'newest transactions'] },
  { path: ROUTES.DATA_HEALTH, label: 'Data Health', icon: HeartPulse, keywords: ['health', 'importer', 'stale', 'ledger current'] },
  { path: ROUTES.YEAR_IN_REVIEW, label: 'Year in Review', icon: CalendarDays, keywords: ['annual', 'yearly', 'recap'] },
  { path: ROUTES.AI_CANVAS, label: 'AI Canvas', icon: Sparkles, keywords: ['ai', 'assistant', 'chart'] },
  { path: ROUTES.SETTINGS, label: 'Settings', icon: SlidersHorizontal, keywords: ['preferences', 'config', 'accounts', 'account classification'] },
]

export interface PageResult {
  kind: 'page'
  entry: PageEntry
}

export interface TransactionResult {
  kind: 'transaction'
  transaction: Transaction
}

export type PaletteResult = PageResult | TransactionResult

export function fuzzyMatch(text: string, query: string): boolean {
  return text.toLowerCase().includes(query.toLowerCase())
}

export const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
}

export const panelVariants = {
  hidden: { opacity: 0, scale: 0.96, y: -10 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: 'spring' as const, damping: 30, stiffness: 400 },
  },
  exit: { opacity: 0, scale: 0.96, y: -10, transition: { duration: 0.15 } },
}
