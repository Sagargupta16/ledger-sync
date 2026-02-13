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
  income: '#34c759',      // ios-green (was #10b981)
  expense: '#ff6b6b',     // ios-red (was #ef4444)
  savings: '#a78bfa',     // ios-purple (unchanged)
  transfer: '#5ac8f5',    // ios-teal (was #06b6d4)
  investment: '#5aa3ff',  // ios-blue (was #3b82f6)
  positive: '#34c759',    // ios-green (was #22c55e)
  negative: '#ff6b6b',    // ios-red (was #ef4444)
  neutral: '#9ca3af',     // gray-400 (unchanged)
  muted: '#6b7280',       // gray-500 (unchanged)
} as const

// Standardized chart axis and grid colors
export const CHART_AXIS_COLOR = '#9ca3af'
export const CHART_GRID_COLOR = '#374151'

// Get color by index with wrap-around
export const getChartColor = (index: number): string => {
  return CHART_COLORS[index % CHART_COLORS.length]
}

// Get warm color by index with wrap-around
export const getWarmColor = (index: number): string => {
  return CHART_COLORS_WARM[index % CHART_COLORS_WARM.length]
}
