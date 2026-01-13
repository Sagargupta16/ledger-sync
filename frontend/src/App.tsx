import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/queryClient'
import { Toaster } from 'sonner'
import { ROUTES } from '@/constants'
import AppLayout from '@/components/layout/AppLayout'

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
  TrendsForecastsPage,
  SettingsPage,
} from '@/pages'

function App() {
  return (
    <QueryClientProvider client={queryClient}>
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
            <Route path={ROUTES.TRENDS_FORECASTS} element={<TrendsForecastsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </QueryClientProvider>
  )
}

export default App
