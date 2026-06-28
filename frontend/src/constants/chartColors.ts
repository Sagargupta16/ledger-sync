/**
 * Shared chart color palettes for consistent styling across all charts.
 *
 * All colors derive from rawColors (which reads CSS variables at runtime),
 * so changing index.css propagates to charts automatically.
 */

import { rawColors, onRawColorsRefresh } from './colors'

// Palette builders read rawColors.app/financial fresh each call, so the arrays
// can be rebuilt in place on theme toggle (see refreshChartConstants). The
// elements are primitive hex strings captured at build time -- rebuilding is
// what keeps series colors tracking the active theme.
const buildChartColors = () => {
  const c = rawColors.app
  return [
    c.purple, c.indigo, c.blue, c.teal, c.green, c.greenVibrant,
    c.yellow, c.orange, c.red, c.pink, c.blueVibrant, c.purpleVibrant,
  ]
}

const buildChartColorsWarm = () => {
  const c = rawColors.app
  return [
    c.red, c.orange, c.yellow, c.greenVibrant, c.green, c.teal,
    c.blue, c.indigo, c.purple, c.purpleVibrant, c.pink, c.blueVibrant,
  ]
}

const buildIncomeColors = () => {
  const c = rawColors.app
  return [c.green, c.teal, c.blue, c.purple, c.pink, c.orange]
}

// Mutable arrays (stable identity for importers) rebuilt in place on theme
// toggle. Spread-fill is via refreshChartConstants() -> rebuildPalette().
// Primary chart color palette
export const CHART_COLORS: string[] = buildChartColors()

// Alternative palette with warmer tones
export const CHART_COLORS_WARM: string[] = buildChartColorsWarm()

// Income-focused palette
export const INCOME_COLORS: string[] = buildIncomeColors()

// Semantic colors for charts. Values resolve from rawColors at module load and
// are rebuilt in place by refreshChartConstants() on theme toggle, so the keys
// stay stable for all consumers while the underlying colors track the theme.
export const SEMANTIC_COLORS = {
  income:     rawColors.financial.income,
  expense:    rawColors.financial.expense,
  savings:    rawColors.financial.savings,
  transfer:   rawColors.financial.transfer,
  investment: rawColors.financial.investment,
  positive:   rawColors.financial.income,
  negative:   rawColors.financial.expense,
  neutral:    rawColors.chart.neutral,
  muted:      rawColors.chart.muted,
}

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

/**
 * Status semantics. Use these instead of hand-rolled red/green/orange/blue
 * Tailwind classes for "this thing succeeded / failed / is risky / is
 * informational." Maps to the ``--color-success / -warning / -error / -info``
 * CSS custom properties declared in ``index.css`` so a future palette swap
 * touches one file, not dozens.
 *
 * Tailwind v4 auto-generates ``text-success``, ``bg-warning``, ``border-error``
 * etc. utilities from those tokens. Prefer those classes directly when you
 * just need a single utility; use the helpers below when you need the full
 * "background + text + border" trio for a badge / inline alert / pill.
 */
export type Status = 'success' | 'warning' | 'error' | 'info'

/** Tailwind text class for a status semantics. */
export function getStatusTextClass(status: Status): string {
  if (status === 'success') return 'text-success'
  if (status === 'warning') return 'text-warning'
  if (status === 'error') return 'text-error'
  return 'text-info'
}

/**
 * Tailwind badge classes (background + text + border) for inline status
 * indicators. Background uses /10 alpha, border /20, matching the existing
 * convention from ``getSemanticBadgeClass``.
 */
export function getStatusBadgeClass(status: Status): string {
  if (status === 'success') return 'bg-success/10 text-success border-success/20'
  if (status === 'warning') return 'bg-warning/10 text-warning border-warning/20'
  if (status === 'error') return 'bg-error/10 text-error border-error/20'
  return 'bg-info/10 text-info border-info/20'
}

// Chart axis and grid colors. `let` (not const) so the ESM live binding updates
// for importers when refreshChartConstants() reassigns them on theme toggle.
export let CHART_AXIS_COLOR = rawColors.chart.axisColor
export let CHART_GRID_COLOR = rawColors.chart.gridSolid

// Get color by index with wrap-around
export const getChartColor = (index: number): string => {
  return CHART_COLORS[index % CHART_COLORS.length]
}

// Get warm color by index with wrap-around
export const getWarmColor = (index: number): string => {
  return CHART_COLORS_WARM[index % CHART_COLORS_WARM.length]
}

// ─── Chart neutral palette (theme-aware via rawColors.chart) ────────────────
//
// Values resolve from the --chart-* CSS tokens through rawColors.chart at
// module load. They are NOT `as const`: refreshChartConstants() reassigns each
// prop in place on theme toggle so every consumer (which reads e.g.
// CHART_TEXT.subtle) sees the active theme's color without changing the object
// identity it imported. `tooltipShadow`/`overlayBg` stay literal black washes
// (a drop shadow / scrim works in both themes).

export const CHART_TEXT = {
  primary: rawColors.chart.textPrimary,     // primary labels, tooltips
  secondary: rawColors.chart.textSecondary, // bar labels
  muted: rawColors.chart.textMuted,         // tooltip labels, secondary text
  subtle: rawColors.chart.textSubtle,       // axis ticks, grid text, peak labels
  dim: rawColors.chart.textDim,             // secondary axis ticks
}

export const CHART_SURFACE = {
  tooltipBg: rawColors.chart.tooltipBg,
  tooltipBorder: rawColors.chart.tooltipBorder,
  tooltipShadow: 'rgba(0, 0, 0, 0.4)',
  gridLine: rawColors.chart.grid,
  axisLine: rawColors.chart.axisLine,
  cursor: rawColors.chart.cursor,
  polarGrid: rawColors.chart.axisLine,
  referenceLine: rawColors.chart.referenceLine,
  referenceLineStrong: rawColors.chart.referenceLineStrong,
  activeStroke: rawColors.chart.activeStroke,
  svgStroke: rawColors.chart.svgStroke,
  overlayBg: 'rgba(0, 0, 0, 0.5)',
}

export const CHART_INPUT = {
  bg: rawColors.chart.inputBg,
  border: rawColors.chart.inputBorder,
}

/**
 * Re-sync the derived chart constants from the (already-rebuilt) `rawColors`
 * after a theme toggle. Mutates each exported object in place + reassigns the
 * `let`-bound primitives so ESM live bindings update for every importer.
 * Registered with colors.ts so refreshRawColors() drives it.
 */
function rebuildPalette(target: string[], next: string[]): void {
  target.length = 0
  target.push(...next)
}

function refreshChartConstants(): void {
  rebuildPalette(CHART_COLORS, buildChartColors())
  rebuildPalette(CHART_COLORS_WARM, buildChartColorsWarm())
  rebuildPalette(INCOME_COLORS, buildIncomeColors())

  CHART_TEXT.primary = rawColors.chart.textPrimary
  CHART_TEXT.secondary = rawColors.chart.textSecondary
  CHART_TEXT.muted = rawColors.chart.textMuted
  CHART_TEXT.subtle = rawColors.chart.textSubtle
  CHART_TEXT.dim = rawColors.chart.textDim

  CHART_SURFACE.tooltipBg = rawColors.chart.tooltipBg
  CHART_SURFACE.tooltipBorder = rawColors.chart.tooltipBorder
  CHART_SURFACE.gridLine = rawColors.chart.grid
  CHART_SURFACE.axisLine = rawColors.chart.axisLine
  CHART_SURFACE.cursor = rawColors.chart.cursor
  CHART_SURFACE.polarGrid = rawColors.chart.axisLine
  CHART_SURFACE.referenceLine = rawColors.chart.referenceLine
  CHART_SURFACE.referenceLineStrong = rawColors.chart.referenceLineStrong
  CHART_SURFACE.activeStroke = rawColors.chart.activeStroke
  CHART_SURFACE.svgStroke = rawColors.chart.svgStroke

  CHART_INPUT.bg = rawColors.chart.inputBg
  CHART_INPUT.border = rawColors.chart.inputBorder

  CHART_AXIS_COLOR = rawColors.chart.axisColor
  CHART_GRID_COLOR = rawColors.chart.gridSolid

  SEMANTIC_COLORS.income = rawColors.financial.income
  SEMANTIC_COLORS.expense = rawColors.financial.expense
  SEMANTIC_COLORS.savings = rawColors.financial.savings
  SEMANTIC_COLORS.transfer = rawColors.financial.transfer
  SEMANTIC_COLORS.investment = rawColors.financial.investment
  SEMANTIC_COLORS.positive = rawColors.financial.income
  SEMANTIC_COLORS.negative = rawColors.financial.expense
  SEMANTIC_COLORS.neutral = rawColors.chart.neutral
  SEMANTIC_COLORS.muted = rawColors.chart.muted
}

onRawColorsRefresh(refreshChartConstants)
