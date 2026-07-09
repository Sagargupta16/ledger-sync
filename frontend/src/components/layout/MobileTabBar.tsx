import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import { LayoutDashboard, Receipt, ArrowRightLeft, Grid3x3 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { ROUTES } from '@/constants'
import { cn } from '@/lib/cn'
import { useBudgets, useAnomalies } from '@/hooks/api/useAnalyticsV2'

interface TabItem {
  to: string
  label: string
  icon: LucideIcon
}

// Four-tab spec chosen to mirror typical finance-app information architecture:
//   Home    -> at-a-glance metrics (Dashboard)
//   Txns    -> the raw ledger, the thing users poke at most
//   Flow    -> Sankey / income-vs-expense, the flagship mobile view
//   More    -> grid entry point for everything else (budgets, tax, settings, ...)
// Kept to 4 so each tab target stays >=64px wide on a 390px iPhone, well
// clear of Apple's 44px minimum and Google's 48dp recommendation.
const TABS: readonly TabItem[] = [
  { to: ROUTES.DASHBOARD, label: 'Home', icon: LayoutDashboard },
  { to: ROUTES.TRANSACTIONS, label: 'Txns', icon: Receipt },
  { to: ROUTES.INCOME_EXPENSE_FLOW, label: 'Flow', icon: ArrowRightLeft },
  { to: ROUTES.MORE, label: 'More', icon: Grid3x3 },
]

/**
 * Native-style bottom tab bar for phone-sized viewports.
 *
 * Hidden at lg+ (1024px) where the sidebar owns primary navigation. Pinned
 * to the bottom via `fixed`, sits inside its own safe-area padding so the
 * iOS home indicator doesn't overlap icons.
 *
 * Active-tab feedback: the icon colors flip to primary + a small pill
 * highlight slides under the active item (Framer Motion `layoutId` =
 * shared-element animation between tabs).
 */
export default function MobileTabBar() {
  // Surface the same alert counts the desktop sidebar badges (unreviewed
  // anomalies + over-budget categories) on the "More" tab, so time-sensitive
  // items aren't invisible behind the grid on phones.
  const { data: anomalies = [] } = useAnomalies({ include_reviewed: false })
  const { data: budgets = [] } = useBudgets({ active_only: true })
  const moreAlertCount =
    anomalies.filter((a) => !a.is_dismissed && !a.is_reviewed).length +
    budgets.filter((b) => b.usage_pct >= b.alert_threshold).length

  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 left-0 right-0 z-30 border-t border-[var(--hairline-2)] bg-[var(--sidebar-bg)] shadow-[0_-12px_30px_-24px_rgba(0,0,0,0.75)] backdrop-blur-lg lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <ul className="flex items-stretch justify-around px-2 pt-1.5">
        {TABS.map((tab) => {
          const badge = tab.to === ROUTES.MORE ? moreAlertCount : 0
          return (
          <li key={tab.to} className="flex-1">
            <NavLink
              to={tab.to}
              className={({ isActive }) =>
                cn(
                  'relative flex flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
                  // min-height hits Apple's 44x44 guidance comfortably
                  'min-h-[52px]',
                  isActive ? 'text-foreground' : 'text-text-tertiary hover:text-foreground',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="mobile-tab-pill"
                      className="absolute inset-x-1.5 inset-y-1 rounded-xl border border-[var(--hairline-2)] bg-[var(--ledger-control-bg)] shadow-[var(--ledger-control-shadow)]"
                      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                    />
                  )}
                  <span className="relative z-[1]">
                    <tab.icon
                      size={22}
                      strokeWidth={isActive ? 2.4 : 2}
                    />
                    {badge > 0 && (
                      <span
                        className="absolute -right-2 -top-1.5 h-4 min-w-[16px] rounded-full bg-app-red px-1 text-center text-[10px] font-semibold leading-4 text-on-accent tabular-nums"
                        aria-label={`${badge} items need attention`}
                      >
                        {badge > 9 ? '9+' : badge}
                      </span>
                    )}
                  </span>
                  <span
                    className={cn(
                      'relative z-[1] text-[10px] sm:text-[11px] font-medium leading-none',
                      isActive && 'text-foreground',
                    )}
                  >
                    {tab.label}
                  </span>
                </>
              )}
            </NavLink>
          </li>
          )
        })}
      </ul>
    </nav>
  )
}
