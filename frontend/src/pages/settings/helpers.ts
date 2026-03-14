/**
 * Constants and helper functions for the Settings page.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const PAYDAY_OPTIONS = Array.from({ length: 31 }, (_, i) => i + 1)

export const DAYS_AHEAD_OPTIONS = [
  { value: 3, label: '3 days' },
  { value: 5, label: '5 days' },
  { value: 7, label: '7 days' },
  { value: 14, label: '14 days' },
]

export const DASHBOARD_WIDGETS = [
  { key: 'savings_rate', label: 'Savings Rate' },
  { key: 'top_spending', label: 'Top Spending Category' },
  { key: 'top_income', label: 'Top Income Source' },
  { key: 'cashback', label: 'Net Cashback Earned' },
  { key: 'total_transactions', label: 'Total Transactions' },
  { key: 'biggest_transaction', label: 'Biggest Transaction' },
  { key: 'median_transaction', label: 'Median Transaction' },
  { key: 'daily_spending', label: 'Average Daily Spending' },
  { key: 'weekend_spending', label: 'Weekend Spending' },
  { key: 'peak_day', label: 'Peak Spending Day' },
  { key: 'burn_rate', label: 'Monthly Burn Rate' },
  { key: 'spending_diversity', label: 'Spending Diversity' },
  { key: 'avg_transaction', label: 'Avg Transaction Amount' },
  { key: 'total_transfers', label: 'Total Internal Transfers' },
] as const

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/** Derive default account classifications from account names by keyword matching */
export function getDefaultClassifications(accountNames: string[]): Record<string, string> {
  const defaults: Record<string, string> = {}
  accountNames.forEach((name) => {
    const lower = name.toLowerCase()
    if (lower.includes('credit card') || lower.includes('cc ') || lower.includes('amex')) {
      defaults[name] = 'Credit Cards'
    } else if (lower.includes('bank') || lower.includes('checking') || lower.includes('salary')) {
      defaults[name] = 'Bank Accounts'
    } else if (lower.includes('cash') || lower.includes('wallet')) {
      defaults[name] = 'Cash'
    } else if (lower.includes('investment') || lower.includes('mutual') || lower.includes('stock')) {
      defaults[name] = 'Investments'
    } else if (lower.includes('loan') || lower.includes('debt')) {
      defaults[name] = 'Loans/Lended'
    } else {
      defaults[name] = 'Other Wallets'
    }
  })
  return defaults
}

/** Safely coerce stored value (may be JSON string or array) to string[] */
export function normalizeArray(value: string[] | string): string[] {
  if (Array.isArray(value)) return value
  if (typeof value === 'string' && value.length > 0) {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch (e) {
      console.warn('[normalizeArray] Failed to parse JSON:', e)
      return []
    }
  }
  return []
}

export function getStoredWidgets(): string[] {
  try {
    const raw = localStorage.getItem('ledger-sync-visible-widgets')
    if (raw) return JSON.parse(raw)
  } catch (e) {
    console.warn('[getStoredWidgets] Failed to read localStorage:', e)
  }
  return DASHBOARD_WIDGETS.map((w) => w.key)
}

export function getStoredTheme(): 'dark' | 'system' {
  return (localStorage.getItem('ledger-sync-theme') as 'dark' | 'system') || 'dark'
}

/** Build a deep-cloned LocalPrefs from server preferences data */
export function buildInitialLocalPrefs(p: Record<string, unknown>): Record<string, unknown> {
  return {
    fiscal_year_start_month: p.fiscal_year_start_month,
    essential_categories: [...((p.essential_categories as string[]) || [])],
    investment_account_mappings: { ...(p.investment_account_mappings as Record<string, string>) },
    taxable_income_categories: [...((p.taxable_income_categories as string[]) || [])],
    investment_returns_categories: [...((p.investment_returns_categories as string[]) || [])],
    non_taxable_income_categories: [...((p.non_taxable_income_categories as string[]) || [])],
    other_income_categories: [...((p.other_income_categories as string[]) || [])],
    default_budget_alert_threshold: p.default_budget_alert_threshold,
    auto_create_budgets: p.auto_create_budgets,
    budget_rollover_enabled: p.budget_rollover_enabled,
    number_format: p.number_format,
    currency_symbol: p.currency_symbol,
    currency_symbol_position: p.currency_symbol_position,
    default_time_range: p.default_time_range,
    anomaly_expense_threshold: p.anomaly_expense_threshold,
    anomaly_types_enabled: [...((p.anomaly_types_enabled as string[]) || [])],
    auto_dismiss_recurring_anomalies: p.auto_dismiss_recurring_anomalies,
    recurring_min_confidence: p.recurring_min_confidence,
    recurring_auto_confirm_occurrences: p.recurring_auto_confirm_occurrences,
    needs_target_percent: p.needs_target_percent ?? 50,
    wants_target_percent: p.wants_target_percent ?? 30,
    savings_target_percent: p.savings_target_percent ?? 20,
    credit_card_limits: { ...(p.credit_card_limits as Record<string, number>) },
    earning_start_date: p.earning_start_date ?? null,
    use_earning_start_date: p.use_earning_start_date ?? false,
    fixed_expense_categories: Array.isArray(p.fixed_expense_categories)
      ? [...p.fixed_expense_categories]
      : (p.fixed_expense_categories ?? []),
    savings_goal_percent: p.savings_goal_percent ?? 20,
    monthly_investment_target: p.monthly_investment_target ?? 0,
    payday: p.payday ?? 1,
    preferred_tax_regime: p.preferred_tax_regime ?? 'new',
    excluded_accounts: Array.isArray(p.excluded_accounts)
      ? [...p.excluded_accounts]
      : (p.excluded_accounts ?? []),
    notify_budget_alerts: p.notify_budget_alerts ?? true,
    notify_anomalies: p.notify_anomalies ?? true,
    notify_upcoming_bills: p.notify_upcoming_bills ?? true,
    notify_days_ahead: p.notify_days_ahead ?? 7,
  }
}
