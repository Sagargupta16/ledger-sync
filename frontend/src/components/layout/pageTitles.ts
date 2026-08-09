/**
 * Browser-tab and workspace-header title per route.
 *
 * Its own module rather than a const inside `AppLayout` for two reasons: a test
 * asserts it covers every routed page, and exporting a non-component from a
 * component file breaks Fast Refresh (`react-refresh/only-export-components`).
 *
 * A page added to the router but not here fails quietly -- the header falls back
 * to the generic "Ledger Sync" and the browser tab loses its page name, which is
 * exactly how `/data-health` and `/merchants` shipped untitled. `pageTitles.test.ts`
 * keys off `ROUTES`, so adding a route is enough to fail the test.
 */
export const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/overview': 'Overview',
  '/transactions': 'Transactions',
  '/subscriptions': 'Recurring',
  '/bill-calendar': 'Bill Calendar',
  '/spending': 'Expense Analysis',
  '/income': 'Income Analysis',
  '/income-expense-flow': 'Cash Flow',
  '/comparison': 'Comparison',
  '/year-in-review': 'Year in Review',
  '/merchants': 'Merchant Intelligence',
  '/data-health': 'Data Health',
  '/budgets': 'Budget Rule',
  '/goals': 'Financial Goals',
  '/fire-calculator': 'FIRE Calculator',
  '/anomalies': 'Anomaly Review',
  '/net-worth': 'Net Worth',
  '/forecasts': 'Trends & Forecasts',
  '/investments/analytics': 'Investment Analytics',
  '/investments/sip-projection': 'Projections',
  '/investments/returns': 'Returns Analysis',
  '/tax': 'Income Tax',
  '/tax/gst': 'Indirect Tax (GST)',
  '/upload': 'Upload & Sync',
  '/settings': 'Settings',
  '/more': 'More',
  '/demo': 'Demo',
}
