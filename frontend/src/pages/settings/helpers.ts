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

// Keyword-to-classification lookup tables (ordered by priority).
//
// Credit-card keywords are intentionally generous -- cards in India are often
// branded ("Swiggy HDFC", "Amazon Pay ICICI", "Flipkart Axis", "Jupiter Edge",
// "OneCard", "Slice", "Uni"). Bank names overlap heavily with card names, so
// we disambiguate later using the account's balance sign.
const ACCOUNT_CLASSIFICATION_RULES: Array<{ keywords: string[]; endsWith?: string[]; classification: string }> = [
  {
    keywords: [
      'credit card', ' cc', 'cc ', 'amex', 'diners',
      'jupiter edge', 'onecard', 'slice', ' uni ',
      'millennia', 'simplyclick', 'simply click', 'regalia',
      'swiggy hdfc', 'amazon pay icici', 'amazon pay ', 'flipkart axis',
    ],
    classification: 'Credit Cards',
  },
  {
    keywords: [
      'epf', 'ppf', 'nps', 'mutual fund', ' mf', 'groww', 'zerodha', 'kuvera',
      'stock', 'demat', 'shares', 'fixed deposit', ' fd', 'investment', 'gold', 'crypto',
    ],
    endsWith: [' mf', ' fd'],
    classification: 'Investments',
  },
  { keywords: ['loan', 'debt', 'emi', 'mortgage'], classification: 'Loans/Lended' },
  {
    keywords: [
      'bank', 'checking', 'salary', 'savings', 'saving',
      'hdfc', 'icici', 'sbi', 'axis', 'kotak', 'bob', 'pnb', 'canara', 'idfc',
      'yes bank', 'indusind', 'rbl', 'federal', 'bandhan', 'union bank', 'jupiter',
    ],
    classification: 'Bank Accounts',
  },
  { keywords: ['cash', 'wallet'], classification: 'Cash' },
]

function matchClassification(lower: string, rules: Array<{ keywords: string[]; endsWith?: string[]; classification: string }>): string | null {
  for (const rule of rules) {
    if (rule.keywords.some((kw) => lower.includes(kw))) return rule.classification
    if (rule.endsWith?.some((kw) => lower.endsWith(kw))) return rule.classification
  }
  return null
}

export interface AccountStats {
  balance: number
  transactions: number
}

/**
 * Apply balance-sign heuristics for accounts that keyword matching couldn't
 * classify, or where keywords conflict with the observed behavior.
 *
 * Rationale -- in Indian personal-finance software:
 *   - Credit cards typically show a negative balance (what you owe the bank)
 *   - Bank accounts, cash, and investments show positive balances
 *   - Dormant accounts (0 balance, very few transactions) don't need a strong
 *     guess; "Other Wallets" is the honest default
 *
 * Keyword rules always win when they match. This pass only fires for names
 * the keyword layer left at "Other Wallets". That keeps the behaviour
 * backwards-compatible for users whose accounts followed the old convention.
 */
function refineWithBalance(
  keywordGuess: string,
  stats: AccountStats | undefined,
): string {
  if (keywordGuess !== 'Other Wallets' || !stats) return keywordGuess
  if (stats.transactions === 0) return keywordGuess

  // Consistent liability signal -- default to Credit Cards rather than Loans
  // because cards outnumber personal loans for most users; loans also usually
  // have the word "loan" in the name and would already have matched.
  if (stats.balance < 0) return 'Credit Cards'

  // Positive balance with meaningful activity -- most likely a bank/wallet
  // that just doesn't match any of our keyword dictionaries. Picking
  // "Bank Accounts" over "Cash" because real users rarely have large cash
  // holdings but often have bank accounts with non-obvious names.
  if (stats.balance > 0 && stats.transactions >= 3) return 'Bank Accounts'

  return keywordGuess
}

/**
 * Derive default account classifications.
 *
 * Two-pass heuristic:
 *   1. Match each account name against the keyword rule table.
 *   2. For anything still "Other Wallets", look at the account's observed
 *      balance + transaction count (if provided) and use balance sign as a
 *      fallback signal.
 *
 * `accountStats` is optional so existing call sites that only have names
 * keep working unchanged; the balance-based refinement simply doesn't fire.
 */
export function getDefaultClassifications(
  accountNames: string[],
  accountStats?: Record<string, AccountStats>,
): Record<string, string> {
  const defaults: Record<string, string> = {}
  for (const name of accountNames) {
    const keywordGuess =
      matchClassification(name.toLowerCase(), ACCOUNT_CLASSIFICATION_RULES) ?? 'Other Wallets'
    defaults[name] = refineWithBalance(keywordGuess, accountStats?.[name])
  }
  return defaults
}

const INCOME_CLASSIFICATION_RULES: Array<{ keywords: string[]; bucket: 'taxable' | 'investment' | 'non_taxable' | 'other' }> = [
  { keywords: ['salary', 'stipend', 'bonus', 'freelance', 'gig work', 'consulting', 'rsus', 'self employment', 'rental', 'employment income'], bucket: 'taxable' },
  { keywords: ['dividend', 'interest', 'capital gain', 'f&o', 'stock market', 'investment', 'mutual fund', 'trading'], bucket: 'investment' },
  { keywords: ['cashback', 'refund', 'reward', 'reimbursement', 'deposit return'], bucket: 'non_taxable' },
  { keywords: ['gift', 'prize', 'pocket money', 'epf contribution', 'one-time', 'other', 'modified balancing'], bucket: 'other' },
]

/**
 * Classify income subcategory items (format: "Category::Subcategory") into
 * tax-based buckets using keyword matching. Returns defaults only for items
 * not already classified by the user.
 */
export function getDefaultIncomeClassifications(
  allIncomeCategories: Record<string, string[]>,
  existing: {
    taxable: string[]
    investment: string[]
    non_taxable: string[]
    other: string[]
  },
): { taxable: string[]; investment: string[]; non_taxable: string[]; other: string[] } {
  const alreadyClassified = new Set([
    ...existing.taxable, ...existing.investment,
    ...existing.non_taxable, ...existing.other,
  ])

  const result = {
    taxable: [...existing.taxable],
    investment: [...existing.investment],
    non_taxable: [...existing.non_taxable],
    other: [...existing.other],
  }

  for (const [cat, subs] of Object.entries(allIncomeCategories)) {
    for (const sub of subs) {
      const item = `${cat}::${sub}`
      if (alreadyClassified.has(item)) continue

      const subLower = sub.toLowerCase()
      const catLower = cat.toLowerCase()
      // Check subcategory first (specific), then category (broad) to avoid
      // broad keywords like 'employment income' swallowing specific subcategories
      const matched =
        INCOME_CLASSIFICATION_RULES.find((rule) => rule.keywords.some((kw) => subLower.includes(kw))) ??
        INCOME_CLASSIFICATION_RULES.find((rule) => rule.keywords.some((kw) => catLower.includes(kw)))
      if (matched) result[matched.bucket].push(item)
    }
  }

  return result
}

const INVESTMENT_MAPPING_RULES: Array<{ keywords: string[]; endsWith?: string[]; type: string }> = [
  { keywords: ['epf', 'ppf', 'nps'], type: 'ppf_epf' },
  { keywords: ['mutual fund', ' mf', 'groww', 'kuvera'], endsWith: [' mf'], type: 'mutual_funds' },
  { keywords: ['stock', 'demat', 'shares', 'zerodha'], type: 'stocks' },
  { keywords: ['fixed deposit', ' fd'], endsWith: [' fd'], type: 'fixed_deposits' },
  { keywords: ['gold'], type: 'gold' },
  { keywords: ['crypto'], type: 'crypto' },
  { keywords: ['real estate', 'property'], type: 'real_estate' },
]

/** Derive default investment type mappings from account names by keyword matching */
export function getDefaultInvestmentMappings(accountNames: string[]): Record<string, string> {
  const mappings: Record<string, string> = {}
  for (const name of accountNames) {
    const lower = name.toLowerCase()
    const matched = INVESTMENT_MAPPING_RULES.find(
      (rule) => rule.keywords.some((kw) => lower.includes(kw)) || rule.endsWith?.some((kw) => lower.endsWith(kw)),
    )
    mappings[name] = matched?.type ?? 'other'
  }
  return mappings
}

/** Safely coerce stored value (may be JSON string or array) to string[] */
export function normalizeArray(value: string[] | string): string[] {
  if (Array.isArray(value)) return value
  if (typeof value === 'string' && value.length > 0) {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

export function getStoredWidgets(): string[] {
  try {
    const raw = localStorage.getItem('ledger-sync-visible-widgets')
    if (raw) return JSON.parse(raw)
  } catch {
    // localStorage unavailable or corrupted
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
