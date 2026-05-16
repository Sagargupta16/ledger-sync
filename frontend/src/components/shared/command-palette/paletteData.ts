import {
  AlertTriangle,
  ArrowRightLeft,
  BarChart3,
  CalendarDays,
  CircleDollarSign,
  Coins,
  GitCompareArrows,
  Goal,
  Landmark,
  LayoutDashboard,
  LineChart,
  Receipt,
  SlidersHorizontal,
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
  { path: ROUTES.DASHBOARD, label: 'Dashboard', icon: LayoutDashboard, keywords: ['home', 'overview', 'summary'] },
  { path: ROUTES.UPLOAD, label: 'Upload & Sync', icon: Upload, keywords: ['import', 'csv', 'file', 'data'] },
  { path: ROUTES.TRANSACTIONS, label: 'All Transactions', icon: Receipt, keywords: ['payments', 'history', 'list'] },
  { path: ROUTES.SPENDING_ANALYSIS, label: 'Expense Analysis', icon: BarChart3, keywords: ['spending', 'categories', 'breakdown'] },
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
  { path: ROUTES.BUDGETS, label: 'Budget Manager', icon: Wallet2, keywords: ['budget', 'plan', 'limit', 'allocation'] },
  { path: ROUTES.GOALS, label: 'Financial Goals', icon: Goal, keywords: ['savings goal', 'target', 'milestone'] },
  { path: ROUTES.ANOMALIES, label: 'Anomaly Review', icon: AlertTriangle, keywords: ['unusual', 'suspicious', 'outlier'] },
  { path: ROUTES.YEAR_IN_REVIEW, label: 'Year in Review', icon: CalendarDays, keywords: ['annual', 'yearly', 'recap'] },
  { path: ROUTES.SETTINGS, label: 'Account Classification', icon: SlidersHorizontal, keywords: ['preferences', 'config', 'accounts'] },
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

export function searchTransactions(
  transactions: Transaction[] | undefined,
  q: string,
  limit = 5,
): TransactionResult[] {
  const results: TransactionResult[] = []
  if (!transactions || transactions.length === 0) return results

  for (const tx of transactions) {
    if (results.length >= limit) break
    const matchNote = tx.note && fuzzyMatch(tx.note, q)
    const matchCategory = tx.category && fuzzyMatch(tx.category, q)
    if (matchNote || matchCategory) {
      results.push({ kind: 'transaction', transaction: tx })
    }
  }
  return results
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
