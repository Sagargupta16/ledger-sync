/**
 * Analytics V2 -- planning: budgets, financial goals, and the 50/30/20
 * budget-rule aggregation.
 */

import { apiClient } from './client'
import { getWrapped } from './analyticsV2Request'

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
  /**
   * Nullable on the wire, and `created_at` below with it -- the serializer
   * derives both from the same column. `financial_goals.created_at` was created
   * `nullable=True` in `20260203_1700_add_analytics_tables.py` and never
   * altered (only `transactions.created_at` was, in the 20260302 migration), so
   * any row written before the model-level default serializes as `null`.
   * Declaring these non-null let `GoalCard` pass `null` straight into
   * `parseLocalDate`, which threw on `.slice` and unmounted the whole card.
   */
  start_date: string | null
  target_date: string | null
  is_achieved: boolean
  achieved_date: string | null
  notes: string | null
  created_at: string | null
  updated_at: string | null
}

export interface CreateGoalRequest {
  name: string
  goal_type: string
  target_amount: number
  target_date: string | null
  notes?: string | null
}

export interface UpdateGoalRequest {
  name?: string
  goal_type?: string
  target_amount?: number
  current_amount?: number
  target_date?: string | null
  notes?: string | null
}

/** `{ success, <id> }` acknowledgement from the create endpoints. */
export interface CreateBudgetResult {
  success: boolean
  budget_id: number
}

export interface CreateGoalResult {
  success: boolean
  goal_id: number
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
  /** Includes the month in progress. */
  total_amount: number
  /** Complete-month total / `period.months`; 0 when there is no complete month. */
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
    /** COMPLETE calendar months in the range (empty months count, the month
     *  in progress does not); 0 when the range sits inside the current month. */
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

export const planningApi = {
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

  async createGoal(data: CreateGoalRequest) {
    const response = await apiClient.post<CreateGoalResult>('/api/analytics/v2/goals', data)
    return response.data
  },

  async updateGoal(goalId: number, data: UpdateGoalRequest) {
    const response = await apiClient.patch<FinancialGoal>(`/api/analytics/v2/goals/${goalId}`, data)
    return response.data
  },

  async deleteGoal(goalId: number) {
    const response = await apiClient.delete<{ success: boolean }>(`/api/analytics/v2/goals/${goalId}`)
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
