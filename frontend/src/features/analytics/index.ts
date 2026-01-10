/**
 * Analytics Feature - Unified Module
 *
 * Consolidates charts, KPIs, and analytics components into a single feature.
 * This follows the frontend simplification guide recommendations.
 */

// Charts Module (consolidated from features/charts)
export * from "./charts";
// Components (native to analytics)
export {
  CreditCardFoodOptimizer,
  FamilyHousingManager,
  InvestmentPerformanceTracker,
  TaxPlanningDashboard,
} from "./components";
// Hooks (native to analytics)
export { useAdvancedAnalytics } from "./hooks/useAdvancedAnalytics";
// KPI Module (consolidated from features/kpi)
export * from "./kpi";
