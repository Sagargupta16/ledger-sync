import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/queryClient'
import { Toaster } from 'sonner'
import { ROUTES } from '@/constants'
import AppLayout from '@/components/layout/AppLayout'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { ChunkErrorBoundary } from '@/components/shared/ChunkErrorBoundary'
import { PreferencesProvider } from '@/components/shared/PreferencesProvider'
import { ProtectedRoute } from '@/components/shared/ProtectedRoute'
import { useAuthStore } from '@/store/authStore'
import { useAuthInit } from '@/hooks/api/useAuth'

// Eagerly loaded — core pages the user hits immediately
import HomePage from '@/pages/HomePage'
import DashboardPage from '@/pages/DashboardPage'
import OAuthCallbackPage from '@/pages/OAuthCallbackPage'
import DemoEntryPage from '@/pages/DemoEntryPage'

// Lazy-loaded — heavier pages, prefetched in background after initial load
const pageImports = {
  UploadSyncPage: () => import('@/pages/UploadSyncPage'),
  TransactionsPage: () => import('@/pages/TransactionsPage'),
  InvestmentAnalyticsPage: () => import('@/pages/InvestmentAnalyticsPage'),
  MutualFundProjectionPage: () => import('@/pages/MutualFundProjectionPage'),
  ReturnsAnalysisPage: () => import('@/pages/ReturnsAnalysisPage'),
  TaxPlanningPage: () => import('@/pages/tax-planning/TaxPlanningPage'),
  GSTAnalysisPage: () => import('@/pages/GSTAnalysisPage'),
  NetWorthPage: () => import('@/pages/NetWorthPage'),
  SpendingAnalysisPage: () => import('@/pages/SpendingAnalysisPage'),
  IncomeAnalysisPage: () => import('@/pages/IncomeAnalysisPage'),
  IncomeExpenseFlowPage: () => import('@/pages/income-expense-flow/IncomeExpenseFlowPage'),
  TrendsForecastsPage: () => import('@/pages/trends-forecasts/TrendsForecastsPage'),
  ComparisonPage: () => import('@/pages/comparison/ComparisonPage'),
  BudgetPage: () => import('@/pages/BudgetPage'),
  YearInReviewPage: () => import('@/pages/year-in-review/YearInReviewPage'),
  SettingsPage: () => import('@/pages/settings/SettingsPage'),
  AnomalyReviewPage: () => import('@/pages/AnomalyReviewPage'),
  GoalsPage: () => import('@/pages/goals/GoalsPage'),
  InsightsPage: () => import('@/pages/InsightsPage'),
  SubscriptionTrackerPage: () => import('@/pages/subscription-tracker/SubscriptionTrackerPage'),
  BillCalendarPage: () => import('@/pages/bill-calendar/BillCalendarPage'),
  FIRECalculatorPage: () => import('@/pages/FIRECalculatorPage'),
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
const FIRECalculatorPage = lazy(pageImports.FIRECalculatorPage)

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

/** Reusable loading spinner */
function Spinner({ label = 'Loading...', className = '' }: Readonly<{ label?: string; className?: string }>) {
  return (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      <div className="w-8 h-8 border-2 border-app-blue/30 border-t-app-blue rounded-full animate-spin" />
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  )
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

  // Prefetch all lazy page chunks once (after auth is resolved)
  const prefetchedRef = useRef(false)
  useEffect(() => {
    if (!prefetchedRef.current) {
      prefetchedRef.current = true
      prefetchAllPages()
    }
  }, [])

  return <>{children}</>
}

// Landing page that shows HomePage
function LandingPage() {
  const { isLoading } = useAuthStore()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black" aria-label="Authenticating">
        <Spinner />
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
                    <Route path={toRelativePath(ROUTES.GST_ANALYSIS)} element={<GSTAnalysisPage />} />
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
                    <Route path={toRelativePath(ROUTES.FIRE_CALCULATOR)} element={<FIRECalculatorPage />} />
                    {/* 404 catch-all for unmatched routes */}
                    <Route path="*" element={<NotFoundPage />} />
                  </Route>
                </Routes>
              </Suspense>
              </ChunkErrorBoundary>
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
