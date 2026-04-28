import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

import { motion, AnimatePresence } from 'framer-motion'

import CommandPalette from '@/components/shared/CommandPalette'
import ChatWidget from '@/components/chat/ChatWidget'
import { DemoBanner } from '@/components/shared/DemoBanner'
import { useDemoStore } from '@/store/demoStore'
import { useExchangeRate } from '@/hooks/api/useExchangeRate'

import Sidebar from './Sidebar/Sidebar'

const pageTransition = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: { duration: 0.2, ease: 'easeOut' as const },
}

// Route → browser tab title
const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/transactions': 'Transactions',
  '/subscriptions': 'Subscriptions',
  '/bill-calendar': 'Bill Calendar',
  '/spending': 'Expense Analysis',
  '/income': 'Income Analysis',
  '/income-expense-flow': 'Cash Flow',
  '/comparison': 'Comparison',
  '/year-in-review': 'Year in Review',
  '/budgets': 'Budget Manager',
  '/goals': 'Financial Goals',
  '/insights': 'Insights',
  '/anomalies': 'Anomaly Review',
  '/net-worth': 'Net Worth',
  '/forecasts': 'Trends & Forecasts',
  '/investments/analytics': 'Investment Analytics',
  '/investments/sip-projection': 'SIP Projections',
  '/investments/returns': 'Returns Analysis',
  '/tax': 'Income Tax',
  '/tax/gst': 'Indirect Tax (GST)',
  '/upload': 'Upload & Sync',
  '/settings': 'Settings',
}

export default function AppLayout() {
  const location = useLocation()
  const isDemoMode = useDemoStore((s) => s.isDemoMode)

  // Fetch exchange rate when display currency changes (pushes to store for formatters)
  useExchangeRate()

  // Dynamic page title + scroll reset on navigation
  useEffect(() => {
    const title = PAGE_TITLES[location.pathname]
    document.title = title ? `${title} | Ledger Sync` : 'Ledger Sync'
    document.getElementById('main-content')?.scrollTo(0, 0)
  }, [location.pathname])

  return (
    <div className="flex h-dvh bg-black relative overflow-hidden">
      {isDemoMode && <DemoBanner />}

      {/* Skip to main content link for keyboard users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-app-blue focus:text-white focus:rounded-xl focus:text-sm focus:font-medium focus:shadow-lg"
      >
        Skip to main content
      </a>

      {/* Static gradient orbs */}
      <div
        className="fixed inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          background: [
            'radial-gradient(600px circle at -10% -20%, rgba(94,92,230,0.20), transparent 70%)',
            'radial-gradient(500px circle at 110% 60%, rgba(10,132,255,0.15), transparent 70%)',
            'radial-gradient(400px circle at 50% 30%, rgba(191,90,242,0.10), transparent 70%)',
            'radial-gradient(450px circle at 20% 110%, rgba(48,209,88,0.10), transparent 70%)',
          ].join(', '),
        }}
      />

      <Sidebar />
      {/*
        Mobile PWA notes:
        - `overscroll-contain` stops the rubber-band scroll from bleeding into
          the document (which otherwise shows a white flash under the notch).
        - `pb-safe` on the scrollable main means the last row of any page
          clears the iOS home indicator without every page having to add it.
      */}
      <main
        id="main-content"
        className="flex-1 overflow-auto overscroll-contain relative z-10 pb-safe"
      >
        <AnimatePresence mode="popLayout">
          <motion.div key={location.pathname} {...pageTransition}>
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Global command palette — Cmd+K / Ctrl+K */}
      <CommandPalette />
      <ChatWidget />
    </div>
  )
}
