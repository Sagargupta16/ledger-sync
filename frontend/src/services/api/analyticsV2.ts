/**
 * Analytics V2 API Service
 *
 * Provides access to the new pre-calculated analytics data:
 * - Monthly summaries
 * - Category trends
 * - Transfer flows
 * - Recurring transactions
 * - Merchant intelligence
 * - Net worth snapshots
 * - Fiscal year summaries
 * - Anomalies
 * - Budgets
 * - Financial goals
 */

import { apiClient } from './client'

// Types — these match the actual JSON shapes returned by the backend API

export interface MonthlySummary {
  period: string
  year: number
  month: number
  income: {
    total: number
    salary: number
    investment: number
    other: number
    count: number
    change_pct: number | null
  }
  expenses: {
    total: number
    essential: number
    discretionary: number
    count: number
    change_pct: number | null
  }
  transfers: {
    out: number
    in: number
    net_investment: number
    count: number
  }
  savings: {
    net: number
    rate: number
  }
  expense_ratio: number
  total_transactions: number
  last_calculated: string | null
}

export interface CategoryTrend {
  period: string
  category: string
  subcategory: string | null
  type: string | null
  total: number
  count: number
  avg: number
  max: number
  min: number
  pct_of_monthly: number | null
  mom_change: number
  mom_change_pct: number | null
}

export interface TransferFlow {
  from: string
  to: string
  total: number
  count: number
  avg: number
  last_date: string | null
  last_amount: number | null
  from_type: string | null
  to_type: string | null
}

export interface RecurringTransaction {
  id: number
  name: string
  category: string
  subcategory: string | null
  account: string
  type: string | null
  frequency: string | null
  expected_amount: number
  variance: number
  expected_day: number | null
  confidence: number
  occurrences: number
  last_occurrence: string | null
  next_expected: string | null
  times_missed: number
  is_active: boolean
  is_confirmed: boolean
  /**
   * 'commitment' = owed on a calendar date (rent, salary, Netflix).
   * 'habit' = repeats but is discretionary (the daily lunch, the weekly fruit run).
   *
   * Gap regularity cannot tell the two apart, so any surface that means "fixed
   * cost", "bill" or "missed payment" must filter to 'commitment'.
   */
  pattern_kind: string
}

export interface MerchantIntelligence {
  merchant: string
  category: string
  subcategory: string | null
  total_spent: number
  transaction_count: number
  avg_transaction: number
  first_transaction: string | null
  last_transaction: string | null
  months_active: number | null
  avg_days_between: number | null
  is_recurring: boolean
}

export interface NetWorthSnapshot {
  date: string
  assets: {
    cash_and_bank: number
    investments: number
    mutual_funds: number
    stocks: number
    fixed_deposits: number
    ppf_epf: number
    other: number
    total: number
  }
  liabilities: {
    credit_cards: number
    loans: number
    other: number
    total: number
  }
  net_worth: number
  change: number
  change_pct: number | null
}

export interface FYSummary {
  fiscal_year: string
  period: string
  income: {
    total: number
    salary: number
    bonus: number
    investment: number
    other: number
  }
  expenses: {
    total: number
    tax_paid: number
  }
  investments_made: number
  savings: {
    net: number
    rate: number
  }
  yoy: {
    income: number | null
    expenses: number | null
    savings: number | null
  }
  is_complete: boolean
}

/**
 * Every member of the backend `AnomalyType` enum, in declaration order --
 * `backend/src/ledger_sync/db/_models/enums.py`. The column is
 * `Enum(AnomalyType)`, so these are the only values the wire can carry.
 *
 * Single source of truth for the vocabulary: the union used to list five of the
 * seven, and the page's icon/label maps were keyed off that union, so a
 * `duplicate_suspected` or `missing_recurring` row would have indexed those maps
 * to `undefined` -- an `undefined` spread into a className, and a crash on the
 * severity style whose `.bg` is read straight away.
 */
export const ANOMALY_TYPE_VALUES = [
  'high_expense',
  'unusual_category',
  'large_transfer',
  'duplicate_suspected',
  'missing_recurring',
  'budget_exceeded',
  'closed_account_activity',
] as const

export type AnomalyTypeValue = (typeof ANOMALY_TYPE_VALUES)[number]

/**
 * The subset of the enum any detector actually constructs today.
 *
 * `core/analytics/anomalies.py` only ever appends `HIGH_EXPENSE` (the
 * high-expense-month and large-transaction detectors both use it),
 * `CLOSED_ACCOUNT_ACTIVITY`, and `BUDGET_EXCEEDED`. The other four members exist
 * in the enum with no producer, so a filter chip for them can never return a
 * row. Anything that offers the user a choice must offer THIS list; anything
 * that renders a value the server sent must handle the full enum.
 */
export const EMITTED_ANOMALY_TYPES = [
  'high_expense',
  'budget_exceeded',
  'closed_account_activity',
] as const satisfies readonly AnomalyTypeValue[]

/**
 * Severities in descending order, which is also display order.
 *
 * `severity` is a free-text `String(20)` column, not an enum, so this list is a
 * best-known set rather than a guarantee -- read paths must tolerate a value
 * outside it. `low` stays here because it is readable from the wire (demo mode
 * seeds one, and the column would accept a legacy row), even though no detector
 * writes it.
 */
export const ANOMALY_SEVERITY_VALUES = ['high', 'medium', 'low'] as const

export type AnomalySeverityValue = (typeof ANOMALY_SEVERITY_VALUES)[number]

/**
 * The severities the detectors actually write: `anomalies.py` grades every
 * finding `"high"` or `"medium"` and nothing else. A `Low` filter option
 * therefore returned an empty list 100% of the time, and a `Low` count tile read
 * zero forever.
 */
export const EMITTED_ANOMALY_SEVERITIES = [
  'high',
  'medium',
] as const satisfies readonly AnomalySeverityValue[]

export interface Anomaly {
  id: number
  anomaly_type: AnomalyTypeValue
  severity: AnomalySeverityValue
  description: string
  transaction_id: string | null
  period_key: string | null
  expected_value: number | null
  actual_value: number | null
  deviation_pct: number | null
  detected_at: string
  is_reviewed: boolean
  is_dismissed: boolean
  review_notes: string | null
  reviewed_at: string | null
}

export interface Budget {
  id: number
  category: string
  subcategory: string | null
  monthly_limit: number
  current_spent: number
  remaining: number
  usage_pct: number
  alert_threshold: number
  avg_actual: number
  months_over: number
  months_under: number
}

/**
 * Goal types the UI offers. NOT a closed wire vocabulary.
 *
 * `FinancialGoal.goal_type` is an unvalidated `String(50)` column
 * (`db/_models/planning.py`) and `CreateGoalRequest.goal_type` is a bare
 * `str = "savings"` with no validator, so the API accepts and returns any string.
 * Rendering therefore has to go through a total lookup with a fallback (see
 * `pages/goals/constants.ts`) -- indexing a `Record<GoalTypeValue, string>` with
 * a stored value from outside this list yielded `undefined`, which the goal chip
 * interpolated into `backgroundColor: "undefined20"`: an invalid CSS colour the
 * browser drops, so the chip lost its background and its text colour with it.
 */
export const GOAL_TYPE_VALUES = [
  'savings',
  'debt_payoff',
  'investment',
  'expense_reduction',
  'income_increase',
  'custom',
] as const

export type GoalTypeValue = (typeof GOAL_TYPE_VALUES)[number]

export interface FinancialGoal {
  id: number
  name: string
  /** One of `GOAL_TYPE_VALUES` for anything this app created, but see above:
   *  the column accepts any string, so treat it as widened on read. */
  goal_type: string
  target_amount: number
  current_amount: number
  progress_pct: number
  start_date: string
  target_date: string | null
  is_achieved: boolean
  achieved_date: string | null
  notes: string | null
  created_at: string
  updated_at: string | null
}

export interface DailySummary {
  date: string
  income: number
  expense: number
  net: number
  income_count: number
  expense_count: number
  transfer_count: number
  total_transactions: number
  top_category: string | null
}

export interface InvestmentHolding {
  id: number
  account: string
  investment_type: string
  instrument_name: string | null
  invested_amount: number
  current_value: number
  realized_gains: number
  unrealized_gains: number
  is_active: boolean
  last_updated: string | null
}

export interface CohortBucket {
  /** day_of_week: 0=Sun..6=Sat; day_of_month: 1..31; month_of_year: 1..12 */
  bucket: number
  total: number
  occurrences: number
  /** total / occurrences, precomputed with the occurrence-correct divisor */
  avg: number
}

export interface CohortSpendingData {
  day_of_week: CohortBucket[]
  day_of_month: CohortBucket[]
  month_of_year: CohortBucket[]
}

/**
 * Freshness + data-quality facts about the user's ledger.
 *
 * Every other endpoint answers "what do my numbers say"; this one answers
 * "should I trust them yet". Nulls mean "nothing imported yet" rather than
 * zero, so an empty ledger reads as unknown instead of as clean.
 */
export interface DataHealth {
  /** ISO timestamp of the most recent import, null when none has run. */
  last_import_at: string | null
  /** Whole days since that import, null when none has run. */
  days_stale: number | null
  last_import_file_name: string | null
  /**
   * Row counts from the most recent `import_logs` entry. All null together when
   * no import has ever run on the account.
   *
   * `rows_skipped` does NOT mean rejected: the reconciler returns "skipped" for
   * a row that matched an existing transaction with no field changes, so a
   * re-upload of the same workbook reports nearly every row as skipped (the real
   * local ledger: 8,024 processed, 62 inserted, 7,962 skipped).
   */
  rows_processed: number | null
  rows_inserted: number | null
  rows_updated: number | null
  rows_skipped: number | null
  /**
   * ISO timestamp of the newest rollup recomputation, null when none has run.
   *
   * Distinct from `last_import_at`: importing raw rows and recomputing the
   * pre-aggregated tables are two steps, and the second is allowed to fail
   * without failing the first (the rows are already committed, and a Neon
   * statement timeout must not reject good data).
   */
  rollups_calculated_at: string | null
  /**
   * True when an import landed that the rollups have not absorbed.
   *
   * Every analytics page reads rollups rather than raw transactions, so this
   * being true means the whole workspace is serving the PREVIOUS import's
   * numbers. On the real local ledger it ran 22 days unnoticed: July expenses
   * displayed 74,523.22 against a true 107,651.65.
   */
  rollups_stale: boolean
  transaction_count: number
  /** Oldest transaction date (`YYYY-MM-DD`), null on an empty ledger. */
  earliest_date: string | null
  /** Newest transaction date (`YYYY-MM-DD`), null on an empty ledger. */
  latest_date: string | null
  /** Rows dated after today -- accepted by the importer without a flag. */
  future_dated_count: number
  /** Rows whose note is a placeholder such as the literal "Unknown". */
  placeholder_note_count: number
  /** Rows parked in the catch-all category (e.g. "Miscellaneous"). */
  uncategorized_count: number
}

// API functions

// All V2 list endpoints wrap data in { data: T[], count: number, ... }
interface WrappedResponse<T> {
  data: T[]
  count: number
}

/**
 * The write endpoints answer with a small `{ success, <id> }` acknowledgement.
 *
 * Declared rather than left implicit: without the generic on `apiClient.post`,
 * axios infers `any`, so `response.data` was returned as `any` and every caller
 * downstream lost checking on a value it is entitled to read (the created id is
 * the only way to link a mutation back to its row).
 */
export interface AnomalyReviewResult {
  success: boolean
  anomaly_id: number
}

export interface CreateBudgetResult {
  success: boolean
  budget_id: number
}

export interface CreateGoalResult {
  success: boolean
  goal_id: number
}

/**
 * GET a V2 list endpoint and unwrap the `{ data, count }` envelope down to
 * the bare `T[]`. Every list endpoint shares this shape, so this keeps the
 * unwrap in one place instead of repeating `response.data.data` per method.
 */
async function getWrapped<T>(url: string, params?: Record<string, unknown>): Promise<T[]> {
  const response = await apiClient.get<WrappedResponse<T>>(url, { params })
  return response.data.data
}

/**
 * Ledger-quality counts, which the endpoint always returns as numbers (they are
 * `COUNT(*)` results, zero on an empty ledger). The import-log counts are
 * deliberately excluded: they are null together when no import has ever run.
 */
const DATA_HEALTH_COUNT_FIELDS = [
  'transaction_count',
  'future_dated_count',
  'placeholder_note_count',
  'uncategorized_count',
] as const satisfies readonly (keyof DataHealth)[]

/**
 * Narrow an unknown payload to `DataHealth`, throwing when it is not one.
 *
 * This endpoint is the ONE place in the app whose job is to say "do not trust
 * the other screens". A malformed payload rendered as zeroes would read as
 * "your data is perfect", which is the exact lie the page exists to prevent, so
 * a bad shape has to surface as the error state instead. It is reachable in
 * practice: demo mode resolves unknown `/analytics/v2/*` paths through a generic
 * `{ data: [], count: 0 }` catch-all.
 */
function assertDataHealth(payload: unknown): DataHealth {
  if (typeof payload !== 'object' || payload === null) {
    throw new TypeError('data-health returned a non-object payload')
  }
  const row = payload as Record<string, unknown>
  const missing = DATA_HEALTH_COUNT_FIELDS.filter((field) => typeof row[field] !== 'number')
  if (missing.length > 0) {
    throw new TypeError(`data-health payload is missing counts: ${missing.join(', ')}`)
  }
  return payload as DataHealth
}

export const analyticsV2Service = {
  // Daily Summaries
  getDailySummaries(params?: { start_date?: string; end_date?: string; limit?: number }) {
    return getWrapped<DailySummary>('/api/analytics/v2/daily-summaries', params)
  },

  // Cohort Spending (day-of-week / day-of-month / month-of-year averages)
  async getCohortSpending(): Promise<CohortSpendingData> {
    const response = await apiClient.get<{ data: CohortSpendingData }>(
      '/api/analytics/v2/cohort-spending',
    )
    return response.data.data
  },

  // Data Health (import freshness + data-quality counts)
  async getDataHealth(): Promise<DataHealth> {
    const response = await apiClient.get<unknown>('/api/analytics/v2/data-health')
    return assertDataHealth(response.data)
  },

  // Investment Holdings
  getInvestmentHoldings(params?: { active_only?: boolean }) {
    return getWrapped<InvestmentHolding>('/api/analytics/v2/investment-holdings', params)
  },

  // Monthly Summaries
  //
  // `offset` is NOT declared by the handler (`summaries.py::get_monthly_summaries`
  // takes start_period / end_period / limit) and FastAPI discards a param it does
  // not declare -- no 422, no warning, HTTP 200 with the value dropped. Paging by
  // `offset` here looked like paging and returned page one every time. Same class
  // of dead param as `sort`/`sort_order` on `/api/transactions`, guarded by
  // `services/api/__tests__/analyticsParamContract.test.ts`.
  getMonthlySummaries(params?: { limit?: number }) {
    return getWrapped<MonthlySummary>('/api/analytics/v2/monthly-summaries', params)
  },

  // Category Trends
  //
  // The handler declares category / transaction_type / start_period / end_period
  // / limit. `subcategory` and `offset` were both silently dropped -- so a
  // subcategory-filtered read answered with every subcategory in the category.
  getCategoryTrends(params?: { category?: string; limit?: number }) {
    return getWrapped<CategoryTrend>('/api/analytics/v2/category-trends', params)
  },

  // Transfer Flows
  //
  // The handler declares only min_amount / min_count -- no paging at all, so
  // both `limit` and `offset` were dropped and the response was always the full
  // flow list.
  getTransferFlows() {
    return getWrapped<TransferFlow>('/api/analytics/v2/transfer-flows')
  },

  // Recurring Transactions
  //
  // The handler declares active_only / min_confidence / pattern_kind. `limit`
  // and `offset` were dropped.
  getRecurringTransactions(params?: {
    active_only?: boolean
    min_confidence?: number
    pattern_kind?: string
  }) {
    return getWrapped<RecurringTransaction>('/api/analytics/v2/recurring-transactions', params)
  },

  async updateRecurringTransaction(
    id: number,
    body: {
      pattern_name?: string
      frequency?: string
      expected_amount?: number
      is_confirmed?: boolean
      is_active?: boolean
      pattern_kind?: string
    },
  ) {
    const response = await apiClient.patch<{ status: string; id: number }>(
      `/api/analytics/v2/recurring-transactions/${id}`,
      body,
    )
    return response.data
  },

  async createRecurringTransaction(body: {
    name: string
    type: string
    frequency: string
    amount: number
    category?: string
    expected_day?: number
  }) {
    const response = await apiClient.post<{ status: string; id: number }>(
      '/api/analytics/v2/recurring-transactions',
      body,
    )
    return response.data
  },

  async deleteRecurringTransaction(id: number) {
    const response = await apiClient.delete<{ status: string; id: number }>(
      `/api/analytics/v2/recurring-transactions/${id}`,
    )
    return response.data
  },

  // Merchant Intelligence
  //
  // The handler declares min_transactions / recurring_only / label_kind / limit.
  // `offset` was dropped.
  getMerchantIntelligence(params?: {
    min_transactions?: number
    recurring_only?: boolean
    limit?: number
  }) {
    return getWrapped<MerchantIntelligence>('/api/analytics/v2/merchant-intelligence', params)
  },

  // Net Worth
  //
  // The handler declares only `limit`. `offset` was dropped.
  getNetWorthSnapshots(params?: { limit?: number }) {
    return getWrapped<NetWorthSnapshot>('/api/analytics/v2/net-worth', params)
  },

  // Fiscal Year Summaries
  //
  // The handler declares NO query params -- it returns every fiscal year. Both
  // `limit` and `offset` were dropped.
  getFYSummaries() {
    return getWrapped<FYSummary>('/api/analytics/v2/fy-summaries')
  },

  // Anomalies
  //
  // `type` is the handler's Query alias for `anomaly_type`, so the wire name is
  // correct. The handler declares type / severity / include_reviewed / limit;
  // `offset` was dropped.
  getAnomalies(params?: {
    type?: string
    severity?: string
    include_reviewed?: boolean
    limit?: number
  }) {
    return getWrapped<Anomaly>('/api/analytics/v2/anomalies', params)
  },

  async reviewAnomaly(anomalyId: number, data: { dismiss: boolean; notes?: string }) {
    // JSON BODY, not query params. The endpoint declares `body:
    // ReviewAnomalyRequest`, so posting a null body with `params: data` was
    // rejected 422 `{"loc": ["body"], "msg": "Field required"}` on every call --
    // the Review and Dismiss buttons on /anomalies could never succeed.
    // Reproduced against the real app at 2026-07-27 and pinned in
    // backend/tests/integration/test_anomaly_review.py.
    const response = await apiClient.post<AnomalyReviewResult>(
      `/api/analytics/v2/anomalies/${anomalyId}/review`,
      data,
    )
    return response.data
  },

  // Budgets
  getBudgets(params?: { active_only?: boolean }) {
    return getWrapped<Budget>('/api/analytics/v2/budgets', params)
  },

  async createBudget(data: {
    category: string
    subcategory?: string
    monthly_limit: number
    alert_threshold?: number
  }) {
    const response = await apiClient.post<CreateBudgetResult>('/api/analytics/v2/budgets', data)
    return response.data
  },

  // Goals
  getGoals(params?: { goal_type?: string; include_achieved?: boolean }) {
    return getWrapped<FinancialGoal>('/api/analytics/v2/goals', params)
  },

  async createGoal(data: {
    name: string
    goal_type: string
    target_amount: number
    target_date: string
    notes?: string
  }) {
    const response = await apiClient.post<CreateGoalResult>('/api/analytics/v2/goals', data)
    return response.data
  },

  // 50/30/20 budget-rule aggregation
  async getSpendingRule(params?: {
    start_date?: string
    end_date?: string
  }): Promise<SpendingRuleResponse> {
    const response = await apiClient.get<SpendingRuleResponse>(
      '/api/analytics/v2/spending-rule',
      { params },
    )
    return response.data
  },
}

// ─── 50/30/20 budget-rule types ────────────────────────────────────────────

export type SpendingBucket = 'needs' | 'wants' | 'savings'

export interface SpendingRuleSubRow {
  /** Subcategory label (e.g. "Office Cafeteria"), or "(no subcategory)" when null. */
  name: string
  amount: number
}

export interface SpendingRuleCategoryRow {
  category: string
  /** Backward-compat placeholder; always null under the category-grouped shape.
   *  Per-sub detail lives in `top_subs` (up to 3, sorted by amount desc). */
  subcategory: string | null
  bucket: SpendingBucket
  total_amount: number
  avg_monthly: number
  txn_count: number
  months_seen: number
  /** Top 3 subcategories by amount within this category. Empty for categories
   *  whose only sub is null (e.g. relabeled TRANSFER rows). */
  top_subs: readonly SpendingRuleSubRow[]
}

export interface SpendingRuleBucket {
  amount: number
  pct_of_income: number
  /** Signed: positive = on the good side of target
   *  (under-cap for Needs/Wants, over-floor for Savings). */
  score_delta: number
}

export interface SpendingRuleResponse {
  period: {
    start: string
    end: string
    months: number
  }
  income_total: number
  expense_total: number
  /**
   * NET amount moved into the investment perimeter (allocations minus
   * redemptions) -- the same number the Savings bucket and column report.
   * Header card uses this.
   */
  savings_amount: number
  /**
   * Income that was neither spent nor moved into the investment perimeter --
   * money that simply stayed in a bank account. Published so the three buckets
   * plus this reconcile to `income_total` exactly; without it the three cards
   * visibly fail to add to 100% with no name for the gap. Negative when spending
   * plus investing outran income, which is a real outcome and not clamped.
   */
  unallocated_amount: number
  /** `unallocated_amount` as a share of income. The four shares sum to 100. */
  unallocated_pct_of_income: number
  targets: {
    needs: number
    wants: number
    savings: number
  }
  buckets: Record<SpendingBucket, SpendingRuleBucket>
  categories: SpendingRuleCategoryRow[]
}
