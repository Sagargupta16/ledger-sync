// Re-export shared constants
export * from './chartColors'
export * from './accountTypes'
export * from './colors'

export const ROUTES = {
  HOME: '/',
  DASHBOARD: '/dashboard',
  
  // Data Management
  UPLOAD: '/upload',
  SETTINGS: '/settings',
  
  // Transactions
  TRANSACTIONS: '/transactions',
  
  // Investments
  INVESTMENT_ANALYTICS: '/investments/analytics',
  MUTUAL_FUND_PROJECTION: '/investments/sip-projection',
  RETURNS_ANALYSIS: '/investments/returns',
  
  // Tax Planning
  TAX_PLANNING: '/tax',
  
  // Net Worth
  NET_WORTH: '/net-worth',
  
  // Spending Analysis
  SPENDING_ANALYSIS: '/spending',
  INCOME_ANALYSIS: '/income',
  INCOME_EXPENSE_FLOW: '/income-expense-flow',
  COMPARISON: '/comparison',
  BUDGETS: '/budgets',
  YEAR_IN_REVIEW: '/year-in-review',
  
  // Trends & Forecasts
  TRENDS_FORECASTS: '/forecasts',

  // Insights & Monitoring
  ANOMALIES: '/anomalies',
  GOALS: '/goals',
  INSIGHTS: '/insights',
} as const

const _apiBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined

if (!_apiBaseUrl && !import.meta.env.DEV) {
  console.warn(
    '[ledger-sync] VITE_API_BASE_URL is not set. Falling back to http://localhost:8000. ' +
    'This is expected in development but should be configured in production.'
  )
}

export const API_BASE_URL = _apiBaseUrl || 'http://localhost:8000'

export const API_ENDPOINTS = {
  // Upload
  UPLOAD: '/api/upload',
  
  // Transactions
  TRANSACTIONS: '/api/transactions',
  TRANSACTIONS_SEARCH: '/api/transactions/search',
  
  // Meta
  META_ACCOUNTS: '/api/meta/accounts',
  META_FILTERS: '/api/meta/filters',
  
  // Analytics
  ANALYTICS_KPIS: '/api/analytics/kpis',
  ANALYTICS_CHARTS_INCOME_EXPENSE: '/api/analytics/charts/income-expense',
  ANALYTICS_CHARTS_CATEGORIES: '/api/analytics/charts/categories',
  ANALYTICS_CHARTS_MONTHLY_TRENDS: '/api/analytics/charts/monthly-trends',
  
  // Calculations
  CALCULATIONS_TOTALS: '/api/calculations/totals',
  CALCULATIONS_ACCOUNT_BALANCES: '/api/calculations/account-balances',
  CALCULATIONS_CATEGORY_BREAKDOWN: '/api/calculations/category-breakdown',
  CALCULATIONS_MONTHLY_AGGREGATION: '/api/calculations/monthly-aggregation',
  CALCULATIONS_DAILY_NET_WORTH: '/api/calculations/daily-net-worth',
} as const
