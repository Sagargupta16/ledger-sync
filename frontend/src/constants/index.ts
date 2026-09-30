// Re-export shared constants
export * from './chartColors'
export * from './accountTypes'
export * from './colors'
export * from './chartConfig'
export * from './currencies'

export const ROUTES = {
  HOME: '/',
  DEMO: '/demo',
  DASHBOARD: '/dashboard',
  OVERVIEW: '/overview',

  // Data Management
  UPLOAD: '/upload',
  SETTINGS: '/settings',
  DATA_HEALTH: '/data-health',

  // Transactions
  TRANSACTIONS: '/transactions',

  // Investments
  INVESTMENT_ANALYTICS: '/investments/analytics',
  MUTUAL_FUND_PROJECTION: '/investments/sip-projection',
  RETURNS_ANALYSIS: '/investments/returns',

  // Tax
  TAX_PLANNING: '/tax',
  GST_ANALYSIS: '/tax/gst',

  // Net Worth
  NET_WORTH: '/net-worth',

  // Spending Analysis
  SPENDING_ANALYSIS: '/spending',
  MERCHANT_INTELLIGENCE: '/merchants',
  INCOME_ANALYSIS: '/income',
  INCOME_EXPENSE_FLOW: '/income-expense-flow',
  COMPARISON: '/comparison',
  BUDGETS: '/budgets',
  YEAR_IN_REVIEW: '/year-in-review',

  // Trends & Forecasts
  TRENDS_FORECASTS: '/forecasts',

  // FIRE & Retirement
  FIRE_CALCULATOR: '/fire-calculator',

  // Monitoring
  ANOMALIES: '/anomalies',
  GOALS: '/goals',
  SUBSCRIPTIONS: '/subscriptions',
  BILL_CALENDAR: '/bill-calendar',

  // Mobile
  MORE: '/more',
} as const

const _apiBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined

// Local development uses Vite's same-origin /api proxy. Set VITE_API_BASE_URL
// at build time only when production uses a separate API host.
export const API_BASE_URL = _apiBaseUrl || ''
