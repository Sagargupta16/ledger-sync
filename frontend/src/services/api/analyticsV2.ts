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
 *
 * This module is the public entry point. The endpoints and their types live in
 * per-domain siblings (`analyticsV2Summaries`, `analyticsV2DataHealth`,
 * `analyticsV2Recurring`, `analyticsV2Anomalies`, `analyticsV2Planning`) and are
 * re-exported here so every importer keeps using `@/services/api/analyticsV2`.
 */

import { anomaliesApi } from './analyticsV2Anomalies'
import { dataHealthApi } from './analyticsV2DataHealth'
import { planningApi } from './analyticsV2Planning'
import { recurringApi } from './analyticsV2Recurring'
import { summariesApi } from './analyticsV2Summaries'

export type {
  CategoryTrend,
  CohortBucket,
  CohortSpendingData,
  DailySummary,
  FYSummary,
  InvestmentHolding,
  MerchantIntelligence,
  MonthlySummary,
  NetWorthSnapshot,
  TransferFlow,
} from './analyticsV2Summaries'
export type { DataHealth } from './analyticsV2DataHealth'
export type { RecurringTransaction } from './analyticsV2Recurring'
export {
  ANOMALY_SEVERITY_VALUES,
  ANOMALY_TYPE_VALUES,
  EMITTED_ANOMALY_SEVERITIES,
  EMITTED_ANOMALY_TYPES,
} from './analyticsV2Anomalies'
export type {
  Anomaly,
  AnomalyReviewResult,
  AnomalySeverityValue,
  AnomalyTypeValue,
} from './analyticsV2Anomalies'
export { GOAL_TYPE_VALUES } from './analyticsV2Planning'
export type {
  Budget,
  CreateBudgetResult,
  CreateGoalRequest,
  CreateGoalResult,
  FinancialGoal,
  GoalTypeValue,
  SpendingBucket,
  SpendingRuleBucket,
  SpendingRuleCategoryRow,
  SpendingRuleResponse,
  SpendingRuleSubRow,
  UpdateGoalRequest,
} from './analyticsV2Planning'

export const analyticsV2Service = {
  ...summariesApi,
  ...dataHealthApi,
  ...recurringApi,
  ...anomaliesApi,
  ...planningApi,
}
