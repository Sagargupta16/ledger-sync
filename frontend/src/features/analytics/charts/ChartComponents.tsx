// @ts-nocheck
/* eslint-disable react-hooks/exhaustive-deps */

// Re-export for backward compatibility
export { commonChartOptions, doughnutOptions } from "./chartHelpers";

// All charts refactored into individual files for better maintainability

// REFACTORED: CumulativeCategoryTrendChart (line chart) moved to individual/CumulativeCategoryTrendChart.tsx
export { CumulativeCategoryTrendChart } from "./individual/CumulativeCategoryTrendChart";
// REFACTORED: DayWeekSpendingPatternsChart moved to individual/DayWeekSpendingPatternsChart.tsx
export { DayWeekSpendingPatternsChart } from "./individual/DayWeekSpendingPatternsChart";
// REFACTORED: NetWorthTrendChart moved to individual/NetWorthTrendChart.tsx
export { NetWorthTrendChart } from "./individual/NetWorthTrendChart";

// REFACTORED: SpendingForecastChart moved to individual/SpendingForecastChart.tsx
export { SpendingForecastChart } from "./individual/SpendingForecastChart";
// REFACTORED: YearOverYearComparisonChart moved to individual/YearOverYearComparisonChart.tsx
export { YearOverYearComparisonChart } from "./individual/YearOverYearComparisonChart";

export { TreemapChart } from "./TreemapChart";
