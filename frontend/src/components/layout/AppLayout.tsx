import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

import { motion, AnimatePresence } from 'motion/react'

import CommandPalette from '@/components/shared/CommandPalette'
import ChatWidget from '@/components/chat/ChatWidget'
import { DemoBanner } from '@/components/shared/DemoBanner'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { useDemoStore } from '@/store/demoStore'
import { useExchangeRate } from '@/hooks/api/useExchangeRate'

import Sidebar from './Sidebar/Sidebar'
import MobileTabBar from './MobileTabBar'
import { PAGE_TITLES } from './pageTitles'
import StaleAnalyticsAlert from './StaleAnalyticsAlert'
import WorkspaceHeader from './WorkspaceHeader'

const pageTransition = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: { duration: 0.2, ease: 'easeOut' as const },
}

export default function AppLayout() {
  const location = useLocation()
  const isDemoMode = useDemoStore((s) => s.isDemoMode)
  const pageTitle = PAGE_TITLES[location.pathname] ?? 'Page not found'

  // Fetch exchange rate when display currency changes (pushes to store for formatters)
  useExchangeRate()

  // Dynamic page title + scroll reset on navigation
  useEffect(() => {
    document.title = `${pageTitle} | Ledger Sync`
    document.getElementById('main-content')?.scrollTo(0, 0)
  }, [location.pathname, pageTitle])

  return (
    <div className="ledger-workspace relative flex h-dvh overflow-hidden bg-background">
      {isDemoMode && <DemoBanner />}

      {/* Skip to main content link for keyboard users */}
      <a
        href="#main-content"
        aria-label="Skip to main content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-app-blue focus:text-on-accent focus:rounded-xl focus:text-sm focus:font-medium focus:shadow-lg"
      >
        Skip to main content
      </a>

      <Sidebar />
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <WorkspaceHeader title={pageTitle} />
        {/*
          Above the scroll container, not inside it: a warning that the numbers
          below are stale is worthless if the user has to scroll up to find it.
        */}
        <StaleAnalyticsAlert />
        <main
          id="main-content"
          className="min-h-0 flex-1 overflow-auto overscroll-contain pb-[calc(68px+env(safe-area-inset-bottom,0px))] lg:pb-safe"
        >
          <AnimatePresence mode="popLayout">
            <motion.div
              key={location.pathname}
              className="min-h-full"
              {...pageTransition}
            >
              <ErrorBoundary key={location.pathname}>
                <Outlet />
              </ErrorBoundary>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Bottom tab bar -- phone-only. Sidebar handles lg+. */}
      <MobileTabBar />

      {/* Global command palette -- Cmd+K / Ctrl+K */}
      <CommandPalette />
      <ChatWidget />
    </div>
  )
}
