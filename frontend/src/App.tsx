import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/queryClient'
import { Toaster } from 'sonner'
import { ROUTES } from '@/constants'
import AppLayout from '@/components/layout/AppLayout'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { PreferencesProvider } from '@/components/shared/PreferencesProvider'
import { ProtectedRoute } from '@/components/shared/ProtectedRoute'
import { useAuthStore } from '@/store/authStore'

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
    <output className="flex items-center justify-center min-h-[50vh]" aria-label="Loading page">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-ios-blue/30 border-t-ios-blue rounded-full animate-spin" />
        <span className="text-sm text-muted-foreground">Loading...</span>
      </div>
    </output>
  )
}

// Auth initializer component
function AuthInitializer({ children }: Readonly<{ children: React.ReactNode }>) {
  const { setLoading, isAuthenticated, accessToken } = useAuthStore()

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(false)
    }, 100)

    return () => clearTimeout(timer)
  }, [setLoading, isAuthenticated, accessToken])

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
      <output className="min-h-screen flex items-center justify-center bg-black" aria-label="Authenticating">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-ios-blue/30 border-t-ios-blue rounded-full animate-spin" />
          <span className="text-sm text-muted-foreground">Loading...</span>
        </div>
      </output>
    )
  }

  return <HomePage />
}

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
                    <Route path={ROUTES.DASHBOARD.slice(1)} element={<DashboardPage />} />
                    <Route path={ROUTES.UPLOAD.slice(1)} element={<UploadSyncPage />} />
                    <Route path={ROUTES.SETTINGS.slice(1)} element={<SettingsPage />} />
                    <Route path={ROUTES.TRANSACTIONS.slice(1)} element={<TransactionsPage />} />
                    <Route path={ROUTES.INVESTMENT_ANALYTICS.slice(1)} element={<InvestmentAnalyticsPage />} />
                    <Route path={ROUTES.MUTUAL_FUND_PROJECTION.slice(1)} element={<MutualFundProjectionPage />} />
                    <Route path={ROUTES.RETURNS_ANALYSIS.slice(1)} element={<ReturnsAnalysisPage />} />
                    <Route path={ROUTES.TAX_PLANNING.slice(1)} element={<TaxPlanningPage />} />
                    <Route path={ROUTES.NET_WORTH.slice(1)} element={<NetWorthPage />} />
                    <Route path={ROUTES.SPENDING_ANALYSIS.slice(1)} element={<SpendingAnalysisPage />} />
                    <Route path={ROUTES.INCOME_ANALYSIS.slice(1)} element={<IncomeAnalysisPage />} />
                    <Route path={ROUTES.INCOME_EXPENSE_FLOW.slice(1)} element={<IncomeExpenseFlowPage />} />
                    <Route path={ROUTES.TRENDS_FORECASTS.slice(1)} element={<TrendsForecastsPage />} />
                    <Route path={ROUTES.COMPARISON.slice(1)} element={<ComparisonPage />} />
                    <Route path={ROUTES.BUDGETS.slice(1)} element={<BudgetPage />} />
                    <Route path={ROUTES.YEAR_IN_REVIEW.slice(1)} element={<YearInReviewPage />} />
                  </Route>
                </Routes>
              </Suspense>
            </BrowserRouter>
            <Toaster
              position="bottom-right"
              theme="dark"
              toastOptions={{
                duration: 4000,
                style: {
                  background: 'rgba(20, 20, 25, 0.95)',
                  backdropFilter: 'blur(12px)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#ffffff',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
                },
              }}
            />
          </PreferencesProvider>
        </AuthInitializer>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

export default App
