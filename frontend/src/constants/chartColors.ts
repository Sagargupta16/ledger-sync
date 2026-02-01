/**
 * Shared chart color palettes for consistent styling across all charts
 */

// Primary chart color palette - used for most visualizations
export const CHART_COLORS = [
  '#8b5cf6', // violet-500
  '#6366f1', // indigo-500
  '#3b82f6', // blue-500
  '#0ea5e9', // sky-500
  '#06b6d4', // cyan-500
  '#14b8a6', // teal-500
  '#10b981', // emerald-500
  '#22c55e', // green-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#ec4899', // pink-500
  '#f97316', // orange-500
] as const

// Alternative palette with warmer tones - used for income/expense charts
export const CHART_COLORS_WARM = [
  '#ef4444', // red-500
  '#f97316', // orange-500
  '#f59e0b', // amber-500
  '#84cc16', // lime-500
  '#22c55e', // green-500
  '#14b8a6', // teal-500
  '#06b6d4', // cyan-500
  '#3b82f6', // blue-500
  '#6366f1', // indigo-500
  '#8b5cf6', // violet-500
  '#a855f7', // purple-500
  '#ec4899', // pink-500
] as const

// Income-focused green palette
export const INCOME_COLORS = [
  '#10b981', // emerald-500
  '#06b6d4', // cyan-500
  '#3b82f6', // blue-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#f59e0b', // amber-500
] as const

// Semantic colors for specific use cases
export const SEMANTIC_COLORS = {
  income: '#10b981',      // emerald-500
  expense: '#ef4444',     // red-500
  savings: '#a855f7',     // purple-500
  transfer: '#06b6d4',    // cyan-500
  investment: '#3b82f6',  // blue-500
  positive: '#22c55e',    // green-500
  negative: '#ef4444',    // red-500
  neutral: '#9ca3af',     // gray-400
} as const

// Get color by index with wrap-around
export const getChartColor = (index: number): string => {
  return CHART_COLORS[index % CHART_COLORS.length]
}

// Get warm color by index with wrap-around
export const getWarmColor = (index: number): string => {
  return CHART_COLORS_WARM[index % CHART_COLORS_WARM.length]
}
