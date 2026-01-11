/**
 * Charts Module - Unified Export
 * All chart components consolidated from the charts feature
 */

// All chart components
export * from "./BasicCharts";
export * from "./ChartComponents";
// Chart utilities
export * from "./chartHelpers";
export * from "./EnhancedCharts";
export { EnhancedSpendingByAccountChart } from "./EnhancedSpendingByAccountChart";
export { CumulativeCategoryTrendChart } from "./individual/CumulativeCategoryTrendChart";
export { DayWeekSpendingPatternsChart } from "./individual/DayWeekSpendingPatternsChart";
// Individual refactored charts (NEW - Clean separation!)
export { NetWorthTrendChart } from "./individual/NetWorthTrendChart";
export { SpendingForecastChart } from "./individual/SpendingForecastChart";
export { YearOverYearComparisonChart } from "./individual/YearOverYearComparisonChart";
export { SmartInsightsPanel } from "./SmartInsightsPanel";
// Shared components & utilities (NEW - Reusable!)
export * from "./shared";
export { default as TreemapChart } from "./TreemapChart";
export * from "./TrendCharts";
// Chart hooks
export * from "./useChartData";
export * from "./useChartHooks";
