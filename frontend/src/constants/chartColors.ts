/**
 * Shared chart color palettes for consistent styling across all charts.
 *
 * All colors derive from rawColors (which reads CSS variables at runtime),
 * so changing index.css propagates to charts automatically.
 */

import { rawColors } from './colors'

const c = rawColors.ios
const f = rawColors.financial

// Primary chart color palette
export const CHART_COLORS = [
  c.purple,
  c.indigo,
  c.blue,
  c.teal,
  c.green,
  c.greenVibrant,
  c.yellow,
  c.orange,
  c.red,
  c.pink,
  c.blueVibrant,
  c.purpleVibrant,
] as const

// Alternative palette with warmer tones
export const CHART_COLORS_WARM = [
  c.red,
  c.orange,
  c.yellow,
  c.greenVibrant,
  c.green,
  c.teal,
  c.blue,
  c.indigo,
  c.purple,
  c.purpleVibrant,
  c.pink,
  c.blueVibrant,
] as const

// Income-focused palette
export const INCOME_COLORS = [
  c.green,
  c.teal,
  c.blue,
  c.purple,
  c.pink,
  c.orange,
] as const

// Semantic colors for charts
export const SEMANTIC_COLORS = {
  income:     f.income,
  expense:    f.expense,
  savings:    f.savings,
  transfer:   f.transfer,
  investment: f.investment,
  positive:   f.income,
  negative:   f.expense,
  neutral:    '#9ca3af',
  muted:      '#6b7280',
} as const

// Chart axis and grid colors
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
