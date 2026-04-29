import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Upload,
  Settings2,
  BarChart3,
  CircleDollarSign,
  GitCompareArrows,
  CalendarDays,
  Wallet,
  LineChart,
  TrendingUp,
  Target,
  Coins,
  CreditCard,
  Wallet2,
  Goal,
  Flame,
  Lightbulb,
  AlertTriangle,
  Landmark,
  Receipt,
  LogOut,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { ROUTES } from '@/constants'
import { PageHeader } from '@/components/ui'
import { useLogout } from '@/hooks/api/useAuth'
import { useNavigate } from 'react-router-dom'

interface MoreItem {
  to: string
  label: string
  icon: LucideIcon
  color: string
}

interface MoreSection {
  title: string
  items: MoreItem[]
}

// The phone-only "More" page groups everything that didn't earn a bottom-tab
// slot. Grouping mirrors the desktop sidebar sections so users who already
// have a mental model don't have to relearn it. Colors are finance-semantic
// (income=green, expense=red, investment=blue, savings=purple, etc.) so the
// grid is scannable at a glance.
const SECTIONS: readonly MoreSection[] = [
  {
    title: 'Analytics',
    items: [
      { to: ROUTES.SPENDING_ANALYSIS, label: 'Expense', icon: BarChart3, color: 'text-app-red' },
      { to: ROUTES.INCOME_ANALYSIS, label: 'Income', icon: CircleDollarSign, color: 'text-app-green' },
      { to: ROUTES.COMPARISON, label: 'Comparison', icon: GitCompareArrows, color: 'text-app-blue' },
      { to: ROUTES.YEAR_IN_REVIEW, label: 'Year in Review', icon: CalendarDays, color: 'text-app-purple' },
    ],
  },
  {
    title: 'Net Worth',
    items: [
      { to: ROUTES.NET_WORTH, label: 'Net Worth', icon: Wallet, color: 'text-app-indigo' },
      { to: ROUTES.TRENDS_FORECASTS, label: 'Forecasts', icon: LineChart, color: 'text-app-teal' },
    ],
  },
  {
    title: 'Investments',
    items: [
      { to: ROUTES.INVESTMENT_ANALYTICS, label: 'Analytics', icon: TrendingUp, color: 'text-app-blue' },
      { to: ROUTES.MUTUAL_FUND_PROJECTION, label: 'Projections', icon: Target, color: 'text-app-purple' },
      { to: ROUTES.RETURNS_ANALYSIS, label: 'Returns', icon: Coins, color: 'text-app-yellow' },
    ],
  },
  {
    title: 'Tracking',
    items: [
      { to: ROUTES.SUBSCRIPTIONS, label: 'Recurring', icon: CreditCard, color: 'text-app-teal' },
      { to: ROUTES.BILL_CALENDAR, label: 'Bill Calendar', icon: CalendarDays, color: 'text-app-orange' },
    ],
  },
  {
    title: 'Planning',
    items: [
      { to: ROUTES.BUDGETS, label: 'Budgets', icon: Wallet2, color: 'text-app-green' },
      { to: ROUTES.GOALS, label: 'Goals', icon: Goal, color: 'text-app-purple' },
      { to: ROUTES.FIRE_CALCULATOR, label: 'FIRE', icon: Flame, color: 'text-app-orange' },
      { to: ROUTES.INSIGHTS, label: 'Insights', icon: Lightbulb, color: 'text-app-yellow' },
      { to: ROUTES.ANOMALIES, label: 'Anomalies', icon: AlertTriangle, color: 'text-app-red' },
    ],
  },
  {
    title: 'Tax',
    items: [
      { to: ROUTES.TAX_PLANNING, label: 'Income Tax', icon: Landmark, color: 'text-app-indigo' },
      { to: ROUTES.GST_ANALYSIS, label: 'GST', icon: Receipt, color: 'text-app-teal' },
    ],
  },
  {
    title: 'Data',
    items: [
      { to: ROUTES.UPLOAD, label: 'Upload', icon: Upload, color: 'text-app-blue' },
      { to: ROUTES.SETTINGS, label: 'Settings', icon: Settings2, color: 'text-text-secondary' },
    ],
  },
]

function MoreTile({ item }: Readonly<{ item: MoreItem }>) {
  return (
    <Link
      to={item.to}
      className="flex flex-col items-center justify-center gap-2 p-3 rounded-2xl glass border border-border active:scale-95 transition-transform"
    >
      <div className="w-11 h-11 rounded-xl bg-white/[0.04] flex items-center justify-center">
        <item.icon className={`w-5 h-5 ${item.color}`} />
      </div>
      <span className="text-xs text-center text-foreground leading-tight">
        {item.label}
      </span>
    </Link>
  )
}

export default function MorePage() {
  const logout = useLogout()
  const navigate = useNavigate()

  const handleSignOut = () => {
    logout.mutate(undefined, { onSuccess: () => navigate('/') })
  }

  return (
    <div className="min-h-full p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader title="More" subtitle="Everything else" />

        {SECTIONS.map((section, sIdx) => (
          <motion.section
            key={section.title}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: sIdx * 0.03 }}
            className="space-y-2"
          >
            <h2 className="text-[11px] uppercase tracking-wider text-text-tertiary font-semibold px-1">
              {section.title}
            </h2>
            <div className="grid grid-cols-4 gap-2">
              {section.items.map((item) => (
                <MoreTile key={item.to} item={item} />
              ))}
            </div>
          </motion.section>
        ))}

        <button
          type="button"
          onClick={handleSignOut}
          disabled={logout.isPending}
          className="w-full mt-2 p-3 rounded-2xl glass border border-border flex items-center justify-center gap-2 text-app-red active:scale-[0.98] transition-transform disabled:opacity-50"
        >
          <LogOut className="w-4 h-4" />
          <span className="text-sm font-medium">Sign out</span>
        </button>
      </div>
    </div>
  )
}
