import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/queryClient'
import { Toaster } from 'sonner'
import { ROUTES } from '@/constants'
import AppLayout from '@/components/layout/AppLayout'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { PreferencesProvider } from '@/components/shared/PreferencesProvider'

// Pages
import {
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

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <PreferencesProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<AppLayout />}>
                <Route index element={<Navigate to={ROUTES.DASHBOARD} replace />} />
                <Route path={ROUTES.DASHBOARD} element={<DashboardPage />} />
                <Route path={ROUTES.UPLOAD} element={<UploadSyncPage />} />
                <Route path={ROUTES.SETTINGS} element={<SettingsPage />} />
                <Route path={ROUTES.TRANSACTIONS} element={<TransactionsPage />} />
                <Route path={ROUTES.INVESTMENT_ANALYTICS} element={<InvestmentAnalyticsPage />} />
                <Route path={ROUTES.MUTUAL_FUND_PROJECTION} element={<MutualFundProjectionPage />} />
                <Route path={ROUTES.RETURNS_ANALYSIS} element={<ReturnsAnalysisPage />} />
                <Route path={ROUTES.TAX_PLANNING} element={<TaxPlanningPage />} />
                <Route path={ROUTES.NET_WORTH} element={<NetWorthPage />} />
                <Route path={ROUTES.SPENDING_ANALYSIS} element={<SpendingAnalysisPage />} />
                <Route path={ROUTES.INCOME_ANALYSIS} element={<IncomeAnalysisPage />} />
                <Route path={ROUTES.INCOME_EXPENSE_FLOW} element={<IncomeExpenseFlowPage />} />
                <Route path={ROUTES.TRENDS_FORECASTS} element={<TrendsForecastsPage />} />
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
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

export default App
