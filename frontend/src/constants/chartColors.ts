/**
 * Shared chart color palettes for consistent styling across all charts.
 *
 * All colors derive from rawColors (which reads CSS variables at runtime),
 * so changing index.css propagates to charts automatically.
 */

import { rawColors } from './colors'

const c = rawColors.app
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

/**
 * Canonical labels for the income / expense / savings trio.
 *
 * Use these in chart legends, KPI titles, and any other display copy
 * that references one of these series so the wording stays uniform.
 */
export const SEMANTIC_LABELS = {
  income: 'Income',
  expense: 'Expense',
  savings: 'Savings',
  savingsRate: 'Savings Rate',
} as const

/**
 * Canonical render order when income / expense / savings appear together
 * (legends, stacked bars, KPI rows). Iterate this so every chart agrees.
 */
export const SERIES_ORDER = [
  SEMANTIC_LABELS.income,
  SEMANTIC_LABELS.expense,
  SEMANTIC_LABELS.savings,
] as const

/**
 * Canonical Tailwind text-colour class for a transaction-type label.
 *
 * Mirrors ``SEMANTIC_COLORS`` so a future hue change only needs to update
 * one place. Used by transaction tables, recent-transactions widgets, and
 * anywhere else income / expense / transfer text wants the right tint.
 */
export function getSemanticTextClass(type: string): string {
  if (type === 'Income') return 'text-app-green'
  if (type === 'Expense') return 'text-app-red'
  if (type === 'Transfer' || type === 'Transfer-In' || type === 'Transfer-Out') {
    return 'text-app-teal'
  }
  return 'text-text-secondary'
}

/**
 * Canonical Tailwind badge classes (background + text + border) for a
 * transaction-type pill. Used by upload preview, transaction lists, etc.
 */
export function getSemanticBadgeClass(type: string): string {
  if (type === 'Income') return 'bg-app-green/20 text-app-green border-app-green/30'
  if (type === 'Expense') return 'bg-app-red/20 text-app-red border-app-red/30'
  if (type === 'Transfer-Out') return 'bg-app-orange/20 text-app-orange border-app-orange/30'
  if (type === 'Transfer-In') return 'bg-app-blue/20 text-app-blue border-app-blue/30'
  if (type === 'Transfer') return 'bg-app-teal/20 text-app-teal border-app-teal/30'
  return 'bg-white/10 text-text-secondary border-white/10'
}

// Chart axis and grid colors
export const CHART_AXIS_COLOR = '#9ca3af'
export const CHART_GRID_COLOR = '#2a2a2e'

// Get color by index with wrap-around
export const getChartColor = (index: number): string => {
  return CHART_COLORS[index % CHART_COLORS.length]
}

// Get warm color by index with wrap-around
export const getWarmColor = (index: number): string => {
  return CHART_COLORS_WARM[index % CHART_COLORS_WARM.length]
}

// ─── Chart neutral palette (zinc scale for axes, labels, grids) ─────────────

export const CHART_TEXT = {
  primary: '#fafafa',     // zinc-50  — primary labels, tooltips
  secondary: '#f5f5f7',   // near zinc-50 — bar labels
  muted: '#a1a1aa',       // zinc-400 — tooltip labels, secondary text
  subtle: '#71717a',      // zinc-500 — axis ticks, grid text, peak labels
  dim: '#52525b',         // zinc-600 — secondary axis ticks
} as const

export const CHART_SURFACE = {
  tooltipBg: 'rgba(26, 26, 28, 0.95)',
  tooltipBorder: 'rgba(255, 255, 255, 0.08)',
  tooltipShadow: 'rgba(0, 0, 0, 0.4)',
  gridLine: 'rgba(255, 255, 255, 0.04)',
  axisLine: 'rgba(255, 255, 255, 0.06)',
  cursor: 'rgba(255, 255, 255, 0.06)',
  polarGrid: 'rgba(255, 255, 255, 0.06)',
  referenceLine: 'rgba(255, 255, 255, 0.15)',
  referenceLineStrong: 'rgba(255, 255, 255, 0.2)',
  activeStroke: 'rgba(255, 255, 255, 0.3)',
  svgStroke: 'rgba(255, 255, 255, 0.08)',
  overlayBg: 'rgba(0, 0, 0, 0.5)',
} as const

export const CHART_INPUT = {
  bg: 'rgba(44, 44, 46, 0.6)',
  border: 'rgba(58, 58, 60, 0.6)',
} as const
