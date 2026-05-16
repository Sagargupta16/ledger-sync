import type { UserPreferences } from '@/services/api/preferences'

import { ESSENTIAL_CATEGORIES } from './demoHelpers'

function fyLabel(startYear: number): string {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`
}

function buildDemoSalaryStructure(): Record<
  string,
  {
    base_salary_annual: number
    hra_annual: number | null
    bonus_annual: number
    epf_monthly: number
    nps_monthly: number
    special_allowance_annual: number
    other_taxable_annual: number
  }
> {
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()
  const currentFYStart = month >= 4 ? year : year - 1

  return {
    [fyLabel(currentFYStart)]: {
      base_salary_annual: 960000,
      hra_annual: 480000,
      bonus_annual: 150000,
      epf_monthly: 1800,
      nps_monthly: 0,
      special_allowance_annual: 320000,
      other_taxable_annual: 0,
    },
    [fyLabel(currentFYStart - 1)]: {
      base_salary_annual: 840000,
      hra_annual: 420000,
      bonus_annual: 120000,
      epf_monthly: 1800,
      nps_monthly: 0,
      special_allowance_annual: 280000,
      other_taxable_annual: 0,
    },
  }
}

function buildDemoRsuGrants(): Array<{
  id: string
  stock_name: string
  stock_price: number
  grant_date: string | null
  notes: string | null
  vestings: Array<{ date: string; quantity: number }>
}> {
  const now = new Date()
  const grantDate = new Date(now.getFullYear() - 1, now.getMonth() - 6, 15)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)

  return [
    {
      id: 'demo-rsu-1',
      stock_name: 'TechCorp Inc.',
      stock_price: 2800,
      grant_date: fmt(grantDate),
      notes: 'Joining grant -- 4-year vest',
      vestings: [
        {
          date: fmt(new Date(grantDate.getFullYear() + 1, grantDate.getMonth(), 15)),
          quantity: 25,
        },
        {
          date: fmt(new Date(grantDate.getFullYear() + 2, grantDate.getMonth(), 15)),
          quantity: 25,
        },
        {
          date: fmt(new Date(grantDate.getFullYear() + 3, grantDate.getMonth(), 15)),
          quantity: 25,
        },
        {
          date: fmt(new Date(grantDate.getFullYear() + 4, grantDate.getMonth(), 15)),
          quantity: 25,
        },
      ],
    },
  ]
}

export function generateDemoPreferences(): UserPreferences {
  const now = new Date()
  const earningStart = new Date(now.getFullYear() - 2, now.getMonth(), 1).toISOString().slice(0, 10)

  return {
    id: -1,
    fiscal_year_start_month: 4,
    essential_categories: ESSENTIAL_CATEGORIES,
    investment_account_mappings: {
      'Groww Mutual Funds': 'mutual_funds',
      'Groww Stocks': 'stocks',
      'PPF Account': 'ppf_epf',
      'EPF Account': 'ppf_epf',
      'SBI FD': 'fixed_deposits',
    },
    taxable_income_categories: [
      'Employment Income::Salary',
      'Employment Income::Bonuses',
      'Employment Income::Stipend',
    ],
    investment_returns_categories: [
      'Investment Income::Dividends',
      'Investment Income::Interest',
      'Investment Income::Stock Market Profit',
    ],
    non_taxable_income_categories: [
      'Refund & Cashbacks::Credit Card Cashbacks',
      'Refund & Cashbacks::Other Cashbacks',
      'Refund & Cashbacks::Product Refunds',
    ],
    other_income_categories: [
      'Other Income::Gifts',
      'Employment Income::EPF Contribution',
      'Employment Income::Expense Reimbursement',
    ],
    default_budget_alert_threshold: 80,
    auto_create_budgets: false,
    budget_rollover_enabled: false,
    number_format: 'indian',
    currency_symbol: '₹',
    currency_symbol_position: 'before',
    default_time_range: 'all_time',
    display_currency: 'INR',
    anomaly_expense_threshold: 200,
    anomaly_types_enabled: ['high_expense', 'unusual_category', 'large_transfer', 'budget_exceeded'],
    auto_dismiss_recurring_anomalies: true,
    recurring_min_confidence: 50,
    recurring_auto_confirm_occurrences: 3,
    needs_target_percent: 50,
    wants_target_percent: 30,
    savings_target_percent: 20,
    credit_card_limits: {
      'Swiggy HDFC Credit Card': 200000,
      'Amazon Pay ICICI Credit Card': 150000,
      'Flipkart Axis Credit Card': 100000,
    },
    earning_start_date: earningStart,
    use_earning_start_date: true,
    fixed_expense_categories: ['Housing', 'Family'],
    savings_goal_percent: 20,
    monthly_investment_target: 50000,
    payday: 1,
    preferred_tax_regime: 'new',
    excluded_accounts: [],
    notify_budget_alerts: true,
    notify_anomalies: true,
    notify_upcoming_bills: true,
    notify_days_ahead: 7,
    salary_structure: buildDemoSalaryStructure(),
    rsu_grants: buildDemoRsuGrants(),
    growth_assumptions: {
      base_salary_growth_pct: 10,
      bonus_growth_pct: 8,
      epf_scales_with_base: true,
      nps_growth_pct: 0,
      stock_price_appreciation_pct: 12,
      projection_years: 3,
    },
    ai_provider: null,
    ai_model: null,
    created_at: null,
    updated_at: null,
  }
}
