import { Link, useNavigate } from 'react-router'
import { motion } from 'motion/react'
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
  AlertTriangle,
  ListChecks,
  Globe,
  FileText,
  HeartPulse,
  Landmark,
  Receipt,
  Compass,
  Store,
  Sparkles,
  ShieldCheck,
  LogOut,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { ROUTES } from '@/constants'
import { PageContainer, PageHeader } from '@/components/ui'
import { useIsAdmin } from '@/hooks/api/useAdminStats'
import { useLogout } from '@/hooks/api/useAuth'

interface MoreItem {
  to: string
  label: string
  icon: LucideIcon
  color: string
  /** Shown only to an account the server marks `is_admin`, never in demo mode. */
  adminOnly?: boolean
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
// Grouping mirrors the desktop sidebar exactly so the mental model is shared
// across viewports: Overview standalone, then Analytics, Wealth (Net Worth +
// Investments merged), Commitments, Planning, Tax, and a Data section that now
// includes Transactions (was missing on mobile -- desktop/mobile parity fix).
const SECTIONS: readonly MoreSection[] = [
  {
    title: 'Overview',
    items: [
      { to: ROUTES.OVERVIEW, label: 'Overview', icon: Compass, color: 'text-app-blue' },
    ],
  },
  {
    title: 'Analytics',
    items: [
      { to: ROUTES.SPENDING_ANALYSIS, label: 'Expense', icon: BarChart3, color: 'text-app-red' },
      { to: ROUTES.MERCHANT_INTELLIGENCE, label: 'Merchant Intelligence', icon: Store, color: 'text-app-orange' },
      { to: ROUTES.INCOME_ANALYSIS, label: 'Income', icon: CircleDollarSign, color: 'text-app-green' },
      { to: ROUTES.COMPARISON, label: 'Comparison', icon: GitCompareArrows, color: 'text-app-blue' },
      { to: ROUTES.YEAR_IN_REVIEW, label: 'Year in Review', icon: CalendarDays, color: 'text-app-purple' },
      { to: ROUTES.AI_CANVAS, label: 'AI Canvas', icon: Sparkles, color: 'text-app-purple' },
    ],
  },
  {
    title: 'Wealth',
    items: [
      { to: ROUTES.NET_WORTH, label: 'Net Worth', icon: Wallet, color: 'text-app-indigo' },
      { to: ROUTES.TRENDS_FORECASTS, label: 'Forecasts', icon: LineChart, color: 'text-app-teal' },
      { to: ROUTES.INVESTMENT_ANALYTICS, label: 'Investments', icon: TrendingUp, color: 'text-app-blue' },
      { to: ROUTES.MUTUAL_FUND_PROJECTION, label: 'Projections', icon: Target, color: 'text-app-purple' },
      { to: ROUTES.RETURNS_ANALYSIS, label: 'Returns', icon: Coins, color: 'text-app-yellow' },
    ],
  },
  {
    title: 'Commitments',
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
      { to: ROUTES.ANOMALIES, label: 'Anomalies', icon: AlertTriangle, color: 'text-app-red' },
      { to: ROUTES.REVIEW_QUEUE, label: 'Review', icon: ListChecks, color: 'text-app-blue' },
      { to: ROUTES.DATA_HEALTH, label: 'Data Health', icon: HeartPulse, color: 'text-app-teal' },
    ],
  },
  {
    title: 'Tax',
    items: [
      { to: ROUTES.TAX_PLANNING, label: 'Income Tax', icon: Landmark, color: 'text-app-indigo' },
      { to: ROUTES.GST_ANALYSIS, label: 'GST', icon: Receipt, color: 'text-app-teal' },
      { to: ROUTES.FOREIGN_ASSETS, label: 'Foreign Assets', icon: Globe, color: 'text-app-blue' },
      { to: ROUTES.AIS_IMPORT, label: 'AIS', icon: FileText, color: 'text-app-purple' },
    ],
  },
  {
    title: 'Data',
    items: [
      { to: ROUTES.TRANSACTIONS, label: 'Transactions', icon: Receipt, color: 'text-app-blue' },
      { to: ROUTES.UPLOAD, label: 'Upload', icon: Upload, color: 'text-app-blue' },
      { to: ROUTES.SETTINGS, label: 'Settings', icon: Settings2, color: 'text-text-secondary' },
      { to: ROUTES.ADMIN, label: 'Admin', icon: ShieldCheck, color: 'text-app-orange', adminOnly: true },
    ],
  },
]

/** Admin-only tiles dropped for everyone else; no section is admin-only, so none goes empty. */
function sectionsFor(isAdmin: boolean): readonly MoreSection[] {
  if (isAdmin) return SECTIONS
  return SECTIONS.map((section) => ({ ...section, items: section.items.filter((item) => !item.adminOnly) }))
}

function MoreTile({ item }: Readonly<{ item: MoreItem }>) {
  return (
    <Link
      to={item.to}
      className="ledger-panel flex min-h-24 flex-col items-center justify-center gap-2 p-3 transition-colors hover:border-[var(--hairline-3)] hover:bg-[var(--overlay-1)] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] md:min-h-16 md:flex-row md:justify-start"
    >
      <div className="flex size-10 items-center justify-center rounded-md border border-[var(--hairline-1)] bg-[var(--overlay-2)]">
        <item.icon className={`size-5 ${item.color}`} aria-hidden="true" />
      </div>
      <span className="min-w-0 text-center text-xs leading-tight text-foreground md:text-left">
        {item.label}
      </span>
    </Link>
  )
}

export default function MorePage() {
  const logout = useLogout()
  const navigate = useNavigate()
  const isAdmin = useIsAdmin()

  const handleSignOut = () => {
    // Block body + `void`: the mutate callback must return void, and navigate
    // is typed `void | Promise<void>` (returns undefined under BrowserRouter).
    // A failed logout still clears client state via useLogout's own onError,
    // so nothing is silenced here.
    logout.mutate(undefined, { onSuccess: () => { void navigate('/') } })
  }

  return (
    <PageContainer>
      <PageHeader title="More" subtitle="All workspace tools, grouped by workflow" />

      {sectionsFor(isAdmin).map((section, sIdx) => (
        <motion.section
          key={section.title}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: sIdx * 0.03 }}
          className="space-y-2"
        >
          <h2 className="px-1 text-overline font-semibold uppercase text-text-tertiary">
            {section.title}
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
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
        aria-busy={logout.isPending}
        className="ledger-control mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-md border p-3 text-app-red transition-colors hover:bg-app-red/5 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50"
      >
        <LogOut className="size-4" aria-hidden="true" />
        <span className="text-sm font-medium">
          {logout.isPending ? 'Signing out...' : 'Sign out'}
        </span>
      </button>
    </PageContainer>
  )
}
