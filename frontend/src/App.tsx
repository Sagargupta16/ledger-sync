import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/queryClient'
import { Toaster } from 'sonner'
import { ROUTES } from '@/constants'
import AppLayout from '@/components/layout/AppLayout'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { PreferencesProvider } from '@/components/shared/PreferencesProvider'
import { ProtectedRoute } from '@/components/shared/ProtectedRoute'
import { useAuthStore } from '@/store/authStore'
import { useAuthInit } from '@/hooks/api/useAuth'

// Eagerly loaded — core pages the user hits immediately
import HomePage from '@/pages/HomePage'
import DashboardPage from '@/pages/DashboardPage'

// Lazy-loaded — heavier pages, prefetched in background after initial load
const pageImports = {
  UploadSyncPage: () => import('@/pages/UploadSyncPage'),
  TransactionsPage: () => import('@/pages/TransactionsPage'),
  InvestmentAnalyticsPage: () => import('@/pages/InvestmentAnalyticsPage'),
  MutualFundProjectionPage: () => import('@/pages/MutualFundProjectionPage'),
  ReturnsAnalysisPage: () => import('@/pages/ReturnsAnalysisPage'),
  TaxPlanningPage: () => import('@/pages/TaxPlanningPage'),
  NetWorthPage: () => import('@/pages/NetWorthPage'),
  SpendingAnalysisPage: () => import('@/pages/SpendingAnalysisPage'),
  IncomeAnalysisPage: () => import('@/pages/IncomeAnalysisPage'),
  IncomeExpenseFlowPage: () => import('@/pages/IncomeExpenseFlowPage'),
  TrendsForecastsPage: () => import('@/pages/TrendsForecastsPage'),
  ComparisonPage: () => import('@/pages/ComparisonPage'),
  BudgetPage: () => import('@/pages/BudgetPage'),
  YearInReviewPage: () => import('@/pages/YearInReviewPage'),
  SettingsPage: () => import('@/pages/SettingsPage'),
  AnomalyReviewPage: () => import('@/pages/AnomalyReviewPage'),
  GoalsPage: () => import('@/pages/GoalsPage'),
  InsightsPage: () => import('@/pages/InsightsPage'),
  SubscriptionTrackerPage: () => import('@/pages/SubscriptionTrackerPage'),
  BillCalendarPage: () => import('@/pages/BillCalendarPage'),
}

const UploadSyncPage = lazy(pageImports.UploadSyncPage)
const TransactionsPage = lazy(pageImports.TransactionsPage)
const InvestmentAnalyticsPage = lazy(pageImports.InvestmentAnalyticsPage)
const MutualFundProjectionPage = lazy(pageImports.MutualFundProjectionPage)
const ReturnsAnalysisPage = lazy(pageImports.ReturnsAnalysisPage)
const TaxPlanningPage = lazy(pageImports.TaxPlanningPage)
const NetWorthPage = lazy(pageImports.NetWorthPage)
const SpendingAnalysisPage = lazy(pageImports.SpendingAnalysisPage)
const IncomeAnalysisPage = lazy(pageImports.IncomeAnalysisPage)
const IncomeExpenseFlowPage = lazy(pageImports.IncomeExpenseFlowPage)
const TrendsForecastsPage = lazy(pageImports.TrendsForecastsPage)
const ComparisonPage = lazy(pageImports.ComparisonPage)
const BudgetPage = lazy(pageImports.BudgetPage)
const YearInReviewPage = lazy(pageImports.YearInReviewPage)
const SettingsPage = lazy(pageImports.SettingsPage)
const AnomalyReviewPage = lazy(pageImports.AnomalyReviewPage)
const GoalsPage = lazy(pageImports.GoalsPage)
const InsightsPage = lazy(pageImports.InsightsPage)
const SubscriptionTrackerPage = lazy(pageImports.SubscriptionTrackerPage)
const BillCalendarPage = lazy(pageImports.BillCalendarPage)

/**
 * Prefetch all lazy page chunks in the background after initial load.
 * Uses requestIdleCallback so it doesn't block the main thread.
 */
function prefetchAllPages() {
  const prefetch = () => {
    for (const loader of Object.values(pageImports)) {
      loader()
    }
  }

  if ('requestIdleCallback' in globalThis) {
    requestIdleCallback(prefetch)
  } else {
    setTimeout(prefetch, 2000)
  }
}

/**
 * Minimal Suspense fallback — only shows after 150ms delay
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
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-ios-blue/30 border-t-ios-blue rounded-full animate-spin" />
        <span className="text-sm text-muted-foreground">Loading...</span>
      </div>
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
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <div className="text-center space-y-4">
        <h1 className="text-6xl font-bold text-white">404</h1>
        <p className="text-xl text-muted-foreground">Page not found</p>
        <Link
          to={ROUTES.DASHBOARD}
          className="inline-block px-6 py-3 bg-gradient-to-r from-primary to-secondary text-white rounded-lg hover:shadow-lg transition-colors"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  )
}

// Auth initializer component
function AuthInitializer({ children }: Readonly<{ children: React.ReactNode }>) {
  // useAuthInit verifies the token with the server and sets loading to false when done.
  // This replaces the arbitrary setTimeout approach.
  useAuthInit()

  // Prefetch all lazy page chunks once auth is resolved
  useEffect(() => {
    prefetchAllPages()
  }, [])

  return <>{children}</>
}

// Landing page that shows HomePage
function LandingPage() {
  const { isLoading } = useAuthStore()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black" aria-label="Authenticating">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-ios-blue/30 border-t-ios-blue rounded-full animate-spin" />
          <span className="text-sm text-muted-foreground">Loading...</span>
        </div>
      </div>
    )
  }

  return <HomePage />
}

/** Extracted style object for the Toaster component (avoids recreating on every render) */
const TOASTER_STYLE: React.CSSProperties = {
  background: 'rgba(20, 20, 25, 0.95)',
  backdropFilter: 'blur(12px)',
  border: '1px solid rgba(255, 255, 255, 0.15)',
  color: '#ffffff',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
}

const TOASTER_OPTIONS = {
  duration: 4000,
  style: TOASTER_STYLE,
} as const

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthInitializer>
          <PreferencesProvider>
            <BrowserRouter>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  {/* Public route - Landing/Auth */}
                  <Route path="/" element={<LandingPage />} />

                  {/* Protected routes with layout */}
                  <Route
                    path="/*"
                    element={
                      <ProtectedRoute>
                        <AppLayout />
                      </ProtectedRoute>
                    }
                  >
                    <Route path="home" element={<HomePage />} />
                    <Route path={toRelativePath(ROUTES.DASHBOARD)} element={<DashboardPage />} />
                    <Route path={toRelativePath(ROUTES.UPLOAD)} element={<UploadSyncPage />} />
                    <Route path={toRelativePath(ROUTES.SETTINGS)} element={<SettingsPage />} />
                    <Route path={toRelativePath(ROUTES.TRANSACTIONS)} element={<TransactionsPage />} />
                    <Route path={toRelativePath(ROUTES.INVESTMENT_ANALYTICS)} element={<InvestmentAnalyticsPage />} />
                    <Route path={toRelativePath(ROUTES.MUTUAL_FUND_PROJECTION)} element={<MutualFundProjectionPage />} />
                    <Route path={toRelativePath(ROUTES.RETURNS_ANALYSIS)} element={<ReturnsAnalysisPage />} />
                    <Route path={toRelativePath(ROUTES.TAX_PLANNING)} element={<TaxPlanningPage />} />
                    <Route path={toRelativePath(ROUTES.NET_WORTH)} element={<NetWorthPage />} />
                    <Route path={toRelativePath(ROUTES.SPENDING_ANALYSIS)} element={<SpendingAnalysisPage />} />
                    <Route path={toRelativePath(ROUTES.INCOME_ANALYSIS)} element={<IncomeAnalysisPage />} />
                    <Route path={toRelativePath(ROUTES.INCOME_EXPENSE_FLOW)} element={<IncomeExpenseFlowPage />} />
                    <Route path={toRelativePath(ROUTES.TRENDS_FORECASTS)} element={<TrendsForecastsPage />} />
                    <Route path={toRelativePath(ROUTES.COMPARISON)} element={<ComparisonPage />} />
                    <Route path={toRelativePath(ROUTES.BUDGETS)} element={<BudgetPage />} />
                    <Route path={toRelativePath(ROUTES.YEAR_IN_REVIEW)} element={<YearInReviewPage />} />
                    <Route path={toRelativePath(ROUTES.ANOMALIES)} element={<AnomalyReviewPage />} />
                    <Route path={toRelativePath(ROUTES.GOALS)} element={<GoalsPage />} />
                    <Route path={toRelativePath(ROUTES.INSIGHTS)} element={<InsightsPage />} />
                    <Route path={toRelativePath(ROUTES.SUBSCRIPTIONS)} element={<SubscriptionTrackerPage />} />
                    <Route path={toRelativePath(ROUTES.BILL_CALENDAR)} element={<BillCalendarPage />} />
                    {/* 404 catch-all for unmatched routes */}
                    <Route path="*" element={<NotFoundPage />} />
                  </Route>
                </Routes>
              </Suspense>
            </BrowserRouter>
            <Toaster
              position="bottom-right"
              theme="dark"
              toastOptions={TOASTER_OPTIONS}
            />
          </PreferencesProvider>
        </AuthInitializer>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

export default App
