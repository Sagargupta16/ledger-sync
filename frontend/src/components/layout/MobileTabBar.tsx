import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import { LayoutDashboard, Receipt, ArrowRightLeft, Grid3x3 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { ROUTES } from '@/constants'
import { cn } from '@/lib/cn'

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
  return (
    <nav
      aria-label="Primary"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-[#0a0a0c]/95 backdrop-blur-lg border-t border-border"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <ul className="flex items-stretch justify-around px-1 pt-1.5">
        {TABS.map((tab) => (
          <li key={tab.to} className="flex-1">
            <NavLink
              to={tab.to}
              className={({ isActive }) =>
                cn(
                  'relative flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl transition-colors',
                  // min-height hits Apple's 44x44 guidance comfortably
                  'min-h-[52px]',
                  isActive ? 'text-white' : 'text-text-tertiary hover:text-white',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="mobile-tab-pill"
                      className="absolute inset-x-2 inset-y-1 rounded-xl bg-white/[0.08]"
                      transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                    />
                  )}
                  <tab.icon
                    size={22}
                    className="relative z-[1]"
                    strokeWidth={isActive ? 2.4 : 2}
                  />
                  <span
                    className={cn(
                      'relative z-[1] text-[10px] font-medium leading-none',
                      isActive && 'text-white',
                    )}
                  >
                    {tab.label}
                  </span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
