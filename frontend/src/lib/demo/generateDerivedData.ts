/**
 * Barrel re-export. The implementations live in topic-split files
 * (demoHelpers, demoPreferences, demoCalculations, demoAnalyticsV2)
 * to keep each file under the 500-LOC ceiling.
 */
export { generateDemoPreferences } from './demoPreferences'
export {
  generateDemoAccountBalances,
  generateDemoBehavior,
  generateDemoCategoryBreakdown,
  generateDemoKPIs,
  generateDemoMasterCategories,
  generateDemoMonthlyAggregation,
  generateDemoOverview,
  generateDemoTotals,
  generateDemoTrends,
} from './demoCalculations'
export {
  generateDemoAnomalies,
  generateDemoBudgets,
  generateDemoCategoryTrends,
  generateDemoFYSummaries,
  generateDemoGoals,
  generateDemoMonthlySummaries,
  generateDemoNetWorth,
  generateDemoRecurring,
} from './demoAnalyticsV2'
// Data health lives with the other computed reads: its quality counts mirror the
// server's `_ledger_quality`, which matches a SET of placeholder notes and
// catch-all categories rather than one literal each.
export { generateDemoDataHealth } from './demoComputedReads'
