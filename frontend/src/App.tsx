import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/queryClient'
import { Toaster } from 'sonner'
import { ROUTES } from '@/constants'
import AppLayout from '@/components/layout/AppLayout'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { PreferencesProvider } from '@/components/shared/PreferencesProvider'
import { ProtectedRoute } from '@/components/shared/ProtectedRoute'
import { useAuthStore } from '@/store/authStore'
import { useEffect } from 'react'

// Pages
import {
  HomePage,
  DashboardPage,
  UploadSyncPage,
  TransactionsPage,
  InvestmentAnalyticsPage,
  MutualFundProjectionPage,
  ReturnsAnalysisPage,
  TaxPlanningPage,
  NetWorthPage,
  SpendingAnalysisPage,
  IncomeAnalysisPage,
  IncomeExpenseFlowPage,
  TrendsForecastsPage,
  SettingsPage,
} from '@/pages'

// Auth initializer component
function AuthInitializer({ children }: { children: React.ReactNode }) {
  const { setLoading, isAuthenticated, accessToken } = useAuthStore()

  useEffect(() => {
    // If we have a token stored, validate it by trying to fetch user
    // This is handled in the API interceptors, just set loading to false
    const timer = setTimeout(() => {
      setLoading(false)
    }, 100)

    return () => clearTimeout(timer)
  }, [setLoading, isAuthenticated, accessToken])

  return <>{children}</>
}

// Landing page that redirects authenticated users
function LandingPage() {
  const { isAuthenticated, isLoading } = useAuthStore()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="animate-pulse text-white">Loading...</div>
      </div>
    )
  }

  // Show HomePage for everyone (it handles auth state internally)
  return <HomePage />
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthInitializer>
          <PreferencesProvider>
            <BrowserRouter>
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
                </Route>
              </Routes>
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
