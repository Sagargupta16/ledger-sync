import { useEffect, type ReactNode } from 'react'
import { useLocation, useOutlet } from 'react-router-dom'

import { motion, AnimatePresence, useIsPresent } from 'motion/react'

import CommandPalette from '@/components/shared/CommandPalette'
import ChatWidget from '@/components/chat/ChatWidget'
import { DemoBanner } from '@/components/shared/DemoBanner'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { useDemoStore } from '@/store/demoStore'
import { useExchangeRate } from '@/hooks/api/useExchangeRate'
import { ROUTE_TRANSITION } from '@/constants/animations'

import Sidebar from './Sidebar/Sidebar'
import MobileTabBar from './MobileTabBar'
import { PAGE_TITLES } from './pageTitles'
import StaleAnalyticsAlert from './StaleAnalyticsAlert'
import WorkspaceHeader from './WorkspaceHeader'
import CurrencyAtmosphere from './CurrencyAtmosphere'

function RouteFrame({ children }: Readonly<{ children: ReactNode }>) {
  const isPresent = useIsPresent()

  return (
    <motion.div
      data-route-frame
      aria-hidden={isPresent ? undefined : true}
      inert={!isPresent}
      className="relative col-start-1 row-start-1 min-h-full min-w-0"
      style={{ zIndex: isPresent ? 1 : 0 }}
      {...ROUTE_TRANSITION}
    >
      {children}
    </motion.div>
  )
}

export default function AppLayout({ pendingTitle }: Readonly<{ pendingTitle?: string }>) {
  const location = useLocation()
  // Keep each route's content inside its own wrapper until its exit completes.
  const outlet = useOutlet()
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
    <div className="ledger-canvas h-dvh overflow-hidden p-0 lg:p-3">
      <div className="ledger-workspace relative flex h-full overflow-hidden bg-background lg:rounded-lg lg:border lg:border-[var(--hairline-2)]">
        {isDemoMode && <DemoBanner />}
        <div className="workspace-motion-field" aria-hidden="true">
          <span className="workspace-motion-beam workspace-motion-beam-x" />
          <span className="workspace-motion-beam workspace-motion-beam-y" />
        </div>

        {/* Skip to main content link for keyboard users */}
        <a
          href="#main-content"
          aria-label="Skip to main content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:border focus:border-app-blue/60 focus:bg-app-blue focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
        >
          Skip to main content
        </a>

        <Sidebar />
        <div className="relative z-10 flex min-w-0 flex-1 flex-col">
          <CurrencyAtmosphere />
          <WorkspaceHeader title={pageTitle} pendingTitle={pendingTitle} />
          {/*
            Above the scroll container, not inside it: a warning that the numbers
            below are stale is worthless if the user has to scroll up to find it.
          */}
          <StaleAnalyticsAlert />
          <main
            id="main-content"
            aria-busy={Boolean(pendingTitle)}
            className="relative z-10 min-h-0 flex-1 overflow-auto overscroll-contain pb-[calc(68px+env(safe-area-inset-bottom,0px))] lg:pb-safe"
          >
            <div className="grid min-h-full">
              <AnimatePresence initial={false} mode="sync">
                <RouteFrame key={location.pathname}>
                  <ErrorBoundary key={location.pathname}>
                    {outlet}
                  </ErrorBoundary>
                </RouteFrame>
              </AnimatePresence>
            </div>
          </main>
        </div>

        {/* Bottom tab bar -- phone-only. Sidebar handles lg+. */}
        <MobileTabBar />

        {/* Global command palette -- Cmd+K / Ctrl+K */}
        <CommandPalette />
        <ChatWidget />
      </div>
    </div>
  )
}
