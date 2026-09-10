import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom'

import { QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'motion/react'
import { Toaster } from 'sonner'

import { queryClient } from '@/lib/queryClient'
import { ROUTES } from '@/constants'
import AppLayout from '@/components/layout/AppLayout'
import { Spinner } from '@/components/ui'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { ChunkErrorBoundary } from '@/components/shared/ChunkErrorBoundary'
import { PreferencesProvider } from '@/components/shared/PreferencesProvider'
import { ProtectedRoute } from '@/components/shared/ProtectedRoute'
import { useAuthStore } from '@/store/authStore'
import { useDemoStore } from '@/store/demoStore'
import { useMotionStore } from '@/store/motionStore'
import { useThemeStore } from '@/store/themeStore'
import { useAuthInit } from '@/hooks/api/useAuth'

// Eagerly loaded -- core pages the user hits immediately
import HomePage from '@/pages/home/HomePage'
import DashboardPage from '@/pages/DashboardPage'
import OAuthCallbackPage from '@/pages/OAuthCallbackPage'
import DemoEntryPage from '@/pages/DemoEntryPage'

// Lazy-loaded pages are prefetched when a navigation link is focused or hovered.
const pageImports = {
  UploadSyncPage: () => import('@/pages/upload-sync/UploadSyncPage'),
  TransactionsPage: () => import('@/pages/TransactionsPage'),
  InvestmentAnalyticsPage: () => import('@/pages/investment-analytics/InvestmentAnalyticsPage'),
  MutualFundProjectionPage: () => import('@/pages/mutual-fund-projection/MutualFundProjectionPage'),
  ReturnsAnalysisPage: () => import('@/pages/returns-analysis/ReturnsAnalysisPage'),
  TaxPlanningPage: () => import('@/pages/tax-planning/TaxPlanningPage'),
  GSTAnalysisPage: () => import('@/pages/gst-analysis/GSTAnalysisPage'),
  NetWorthPage: () => import('@/pages/net-worth/NetWorthPage'),
  SpendingAnalysisPage: () => import('@/pages/spending-analysis/SpendingAnalysisPage'),
  MerchantIntelligencePage: () =>
    import('@/pages/merchant-intelligence/MerchantIntelligencePage'),
  IncomeAnalysisPage: () => import('@/pages/income-analysis/IncomeAnalysisPage'),
  IncomeExpenseFlowPage: () => import('@/pages/income-expense-flow/IncomeExpenseFlowPage'),
  TrendsForecastsPage: () => import('@/pages/trends-forecasts/TrendsForecastsPage'),
  ComparisonPage: () => import('@/pages/comparison/ComparisonPage'),
  BudgetPage: () => import('@/pages/budget/BudgetPage'),
  YearInReviewPage: () => import('@/pages/year-in-review/YearInReviewPage'),
  SettingsPage: () => import('@/pages/settings/SettingsPage'),
  AnomalyReviewPage: () => import('@/pages/AnomalyReviewPage'),
  DataHealthPage: () => import('@/pages/data-health/DataHealthPage'),
  GoalsPage: () => import('@/pages/goals/GoalsPage'),
  SubscriptionTrackerPage: () => import('@/pages/subscription-tracker/SubscriptionTrackerPage'),
  BillCalendarPage: () => import('@/pages/bill-calendar/BillCalendarPage'),
  FIRECalculatorPage: () => import('@/pages/FIRECalculatorPage'),
  MorePage: () => import('@/pages/MorePage'),
  OverviewPage: () => import('@/pages/OverviewPage'),
}

const UploadSyncPage = lazy(pageImports.UploadSyncPage)
const TransactionsPage = lazy(pageImports.TransactionsPage)
const InvestmentAnalyticsPage = lazy(pageImports.InvestmentAnalyticsPage)
const MutualFundProjectionPage = lazy(pageImports.MutualFundProjectionPage)
const ReturnsAnalysisPage = lazy(pageImports.ReturnsAnalysisPage)
const TaxPlanningPage = lazy(pageImports.TaxPlanningPage)
const GSTAnalysisPage = lazy(pageImports.GSTAnalysisPage)
const NetWorthPage = lazy(pageImports.NetWorthPage)
const SpendingAnalysisPage = lazy(pageImports.SpendingAnalysisPage)
const MerchantIntelligencePage = lazy(pageImports.MerchantIntelligencePage)
const IncomeAnalysisPage = lazy(pageImports.IncomeAnalysisPage)
const IncomeExpenseFlowPage = lazy(pageImports.IncomeExpenseFlowPage)
const TrendsForecastsPage = lazy(pageImports.TrendsForecastsPage)
const ComparisonPage = lazy(pageImports.ComparisonPage)
const BudgetPage = lazy(pageImports.BudgetPage)
const YearInReviewPage = lazy(pageImports.YearInReviewPage)
const SettingsPage = lazy(pageImports.SettingsPage)
const AnomalyReviewPage = lazy(pageImports.AnomalyReviewPage)
const DataHealthPage = lazy(pageImports.DataHealthPage)
const GoalsPage = lazy(pageImports.GoalsPage)
const SubscriptionTrackerPage = lazy(pageImports.SubscriptionTrackerPage)
const BillCalendarPage = lazy(pageImports.BillCalendarPage)
const FIRECalculatorPage = lazy(pageImports.FIRECalculatorPage)
const MorePage = lazy(pageImports.MorePage)
const OverviewPage = lazy(pageImports.OverviewPage)

const routeLoaders = new Map<string, () => Promise<unknown>>([
  [ROUTES.UPLOAD, pageImports.UploadSyncPage],
  [ROUTES.TRANSACTIONS, pageImports.TransactionsPage],
  [ROUTES.INVESTMENT_ANALYTICS, pageImports.InvestmentAnalyticsPage],
  [ROUTES.MUTUAL_FUND_PROJECTION, pageImports.MutualFundProjectionPage],
  [ROUTES.RETURNS_ANALYSIS, pageImports.ReturnsAnalysisPage],
  [ROUTES.TAX_PLANNING, pageImports.TaxPlanningPage],
  [ROUTES.GST_ANALYSIS, pageImports.GSTAnalysisPage],
  [ROUTES.NET_WORTH, pageImports.NetWorthPage],
  [ROUTES.SPENDING_ANALYSIS, pageImports.SpendingAnalysisPage],
  [ROUTES.MERCHANT_INTELLIGENCE, pageImports.MerchantIntelligencePage],
  [ROUTES.INCOME_ANALYSIS, pageImports.IncomeAnalysisPage],
  [ROUTES.INCOME_EXPENSE_FLOW, pageImports.IncomeExpenseFlowPage],
  [ROUTES.TRENDS_FORECASTS, pageImports.TrendsForecastsPage],
  [ROUTES.COMPARISON, pageImports.ComparisonPage],
  [ROUTES.BUDGETS, pageImports.BudgetPage],
  [ROUTES.YEAR_IN_REVIEW, pageImports.YearInReviewPage],
  [ROUTES.SETTINGS, pageImports.SettingsPage],
  [ROUTES.ANOMALIES, pageImports.AnomalyReviewPage],
  [ROUTES.DATA_HEALTH, pageImports.DataHealthPage],
  [ROUTES.GOALS, pageImports.GoalsPage],
  [ROUTES.SUBSCRIPTIONS, pageImports.SubscriptionTrackerPage],
  [ROUTES.BILL_CALENDAR, pageImports.BillCalendarPage],
  [ROUTES.FIRE_CALCULATOR, pageImports.FIRECalculatorPage],
  [ROUTES.MORE, pageImports.MorePage],
  [ROUTES.OVERVIEW, pageImports.OverviewPage],
])

/**
 * Minimal Suspense fallback -- only shows after 150ms delay
 * so fast chunk loads produce zero visible flash.
 */
function PageLoader() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setShow(true), 150)
    return () => clearTimeout(timer)
  }, [])

  if (!show) return null

  return (
    <div className="flex items-center justify-center min-h-[50vh]" aria-label="Loading page">
      <Spinner />
    </div>
  )
}

/**
 * Converts an absolute route path (e.g. "/dashboard") to a relative path
 * suitable for nested <Route> elements (e.g. "dashboard").
 */
function toRelativePath(absolutePath: string): string {
  return absolutePath.startsWith('/') ? absolutePath.slice(1) : absolutePath
}

// Simple 404 page shown for unmatched routes
function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <section className="ledger-panel w-full max-w-md p-6 text-center sm:p-8">
        <p className="ledger-meta text-primary">Navigation error</p>
        <p className="mt-4 font-mono text-4xl font-semibold tabular-nums text-foreground">
          404
        </p>
        <h1 className="mt-3 text-xl font-semibold text-foreground">Page not found</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-text-tertiary">
          This workspace route does not exist or may have moved.
        </p>
        <Link
          to={ROUTES.DASHBOARD}
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md border border-primary bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:border-app-blue-vibrant hover:bg-app-blue-vibrant focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        >
          Return to dashboard
        </Link>
      </section>
    </div>
  )
}

// Re-applies the resolved theme on store mount. The initial theme is already
// applied pre-paint by the inline script in index.html; modes are now just
// dark/light (new users default to the OS preference at load time), so there
// is no live OS watcher anymore.
function ThemeWatcher() {
  const syncResolved = useThemeStore((s) => s.syncResolved)

  useEffect(() => {
    syncResolved()
  }, [syncResolved])

  return null
}

function MotionWatcher() {
  const syncMode = useMotionStore((state) => state.syncMode)

  useEffect(() => {
    syncMode()
  }, [syncMode])

  return null
}

// Auth initializer component
function AuthInitializer({ children }: Readonly<{ children: React.ReactNode }>) {
  // useAuthInit verifies the token with the server and sets loading to false when done.
  // This replaces the arbitrary setTimeout approach.
  useAuthInit()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const isLoading = useAuthStore((state) => state.isLoading)

  useEffect(() => {
    if (!isAuthenticated || isLoading) return
    const prefetched = new Set<string>()
    const basePath = new URL(import.meta.env.BASE_URL, window.location.origin).pathname.replace(/\/$/, '')
    const prefetchLink = (event: Event) => {
      if (!(event.target instanceof Element)) return
      const link = event.target.closest<HTMLAnchorElement>('a[href]')
      if (!link) return
      const url = new URL(link.href)
      if (url.origin !== window.location.origin || !url.pathname.startsWith(`${basePath}/`)) return
      const path = url.pathname.slice(basePath.length).replace(/\/$/, '')
      const loader = routeLoaders.get(path)
      if (!loader || prefetched.has(path)) return
      prefetched.add(path)
      // Navigation still owns chunk-error feedback. A failed hint can retry.
      void loader().catch(() => { prefetched.delete(path) })
    }
    document.addEventListener('pointerover', prefetchLink)
    document.addEventListener('focusin', prefetchLink)
    document.addEventListener('touchstart', prefetchLink, { passive: true })
    return () => {
      document.removeEventListener('pointerover', prefetchLink)
      document.removeEventListener('focusin', prefetchLink)
      document.removeEventListener('touchstart', prefetchLink)
    }
  }, [isAuthenticated, isLoading])

  return <>{children}</>
}

function AuthenticatedLayout() {
  const userId = useAuthStore((state) => state.user?.id)
  const demo = useDemoStore((state) => state.isDemoMode)
  return (
    <ProtectedRoute>
      <AppLayout key={demo ? 'demo' : userId ?? 'anonymous'} />
    </ProtectedRoute>
  )
}

// Landing page that shows HomePage
function LandingPage() {
  const { isLoading } = useAuthStore()

  if (isLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background" aria-label="Authenticating">
        <Spinner />
      </div>
    )
  }

  return <HomePage />
}

/** Extracted style object for the Toaster component (avoids recreating on every render).
 *  Uses CSS tokens so toasts flip with the light/dark theme instead of always
 *  rendering as a dark overlay chip (which was unreadable in light mode). */
const TOASTER_STYLE: React.CSSProperties = {
  background: 'var(--color-popover)',
  border: '1px solid var(--glass-border-strong)',
  color: 'var(--color-foreground)',
  boxShadow: 'var(--glass-shadow-strong)',
}

const TOASTER_OPTIONS = {
  duration: 4000,
  style: TOASTER_STYLE,
} as const

function App() {
  const resolvedTheme = useThemeStore((state) => state.resolved)
  const motionMode = useMotionStore((state) => state.mode)

  return (
    <ErrorBoundary>
      <ThemeWatcher />
      <MotionWatcher />
      <MotionConfig
        reducedMotion={motionMode === 'reduced' ? 'always' : 'never'}
        skipAnimations={motionMode === 'reduced'}
      >
      <QueryClientProvider client={queryClient}>
        <AuthInitializer>
          <PreferencesProvider>
            <BrowserRouter basename={import.meta.env.BASE_URL}>
              <ChunkErrorBoundary>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  {/* Public routes */}
                  <Route path="/" element={<LandingPage />} />
                  <Route path="/demo" element={<DemoEntryPage />} />
                  <Route path="/auth/callback/:provider" element={<OAuthCallbackPage />} />

                  {/* Protected routes with layout */}
                  <Route
                    path="/*"
                    element={<AuthenticatedLayout />}
                  >
                    <Route path="home" element={<Navigate replace to={ROUTES.DASHBOARD} />} />
                    <Route path={toRelativePath(ROUTES.DASHBOARD)} element={<DashboardPage />} />
                    <Route path={toRelativePath(ROUTES.OVERVIEW)} element={<OverviewPage />} />
                    <Route path={toRelativePath(ROUTES.UPLOAD)} element={<UploadSyncPage />} />
                    <Route path={toRelativePath(ROUTES.SETTINGS)} element={<SettingsPage />} />
                    <Route path={toRelativePath(ROUTES.TRANSACTIONS)} element={<TransactionsPage />} />
                    <Route path={toRelativePath(ROUTES.INVESTMENT_ANALYTICS)} element={<InvestmentAnalyticsPage />} />
                    <Route path={toRelativePath(ROUTES.MUTUAL_FUND_PROJECTION)} element={<MutualFundProjectionPage />} />
                    <Route path={toRelativePath(ROUTES.RETURNS_ANALYSIS)} element={<ReturnsAnalysisPage />} />
                    <Route path={toRelativePath(ROUTES.TAX_PLANNING)} element={<TaxPlanningPage />} />
                    <Route path={toRelativePath(ROUTES.GST_ANALYSIS)} element={<GSTAnalysisPage />} />
                    <Route path={toRelativePath(ROUTES.NET_WORTH)} element={<NetWorthPage />} />
                    <Route path={toRelativePath(ROUTES.SPENDING_ANALYSIS)} element={<SpendingAnalysisPage />} />
                    <Route path={toRelativePath(ROUTES.MERCHANT_INTELLIGENCE)} element={<MerchantIntelligencePage />} />
                    <Route path={toRelativePath(ROUTES.INCOME_ANALYSIS)} element={<IncomeAnalysisPage />} />
                    <Route path={toRelativePath(ROUTES.INCOME_EXPENSE_FLOW)} element={<IncomeExpenseFlowPage />} />
                    <Route path={toRelativePath(ROUTES.TRENDS_FORECASTS)} element={<TrendsForecastsPage />} />
                    <Route path={toRelativePath(ROUTES.COMPARISON)} element={<ComparisonPage />} />
                    <Route path={toRelativePath(ROUTES.BUDGETS)} element={<BudgetPage />} />
                    <Route path={toRelativePath(ROUTES.YEAR_IN_REVIEW)} element={<YearInReviewPage />} />
                    <Route path={toRelativePath(ROUTES.ANOMALIES)} element={<AnomalyReviewPage />} />
                    <Route path={toRelativePath(ROUTES.DATA_HEALTH)} element={<DataHealthPage />} />
                    <Route path={toRelativePath(ROUTES.GOALS)} element={<GoalsPage />} />
                    <Route path={toRelativePath(ROUTES.SUBSCRIPTIONS)} element={<SubscriptionTrackerPage />} />
                    <Route path={toRelativePath(ROUTES.BILL_CALENDAR)} element={<BillCalendarPage />} />
                    <Route path={toRelativePath(ROUTES.FIRE_CALCULATOR)} element={<FIRECalculatorPage />} />
                    <Route path={toRelativePath(ROUTES.MORE)} element={<MorePage />} />
                    {/* 404 catch-all for unmatched routes */}
                    <Route path="*" element={<NotFoundPage />} />
                  </Route>
                </Routes>
              </Suspense>
              </ChunkErrorBoundary>
            </BrowserRouter>
            <Toaster
              position="bottom-right"
              theme={resolvedTheme}
              toastOptions={TOASTER_OPTIONS}
            />
          </PreferencesProvider>
        </AuthInitializer>
      </QueryClientProvider>
      </MotionConfig>
    </ErrorBoundary>
  )
}

export default App
