/**
 * Single source of truth for expense category colours across the dashboard.
 *
 * Why this file exists
 * --------------------
 * The audit caught the same "Food & Dining" category rendering different
 * colours across pages (orange on Bill Calendar, whatever-fell-out-of-the-
 * palette-index on Spending Analysis and the Dashboard's Top Categories
 * widget). Users had to re-decode the legend on every page.
 *
 * Anything that displays an expense-category breakdown should pass the
 * map below to ``CategoryBreakdown``'s ``colorMap`` prop, or call
 * ``getExpenseCategoryColor(name)`` directly. Unknown categories fall
 * back to a deterministic hash-based colour from the chart palette so
 * they stay stable across renders/runs.
 *
 * What's NOT in here
 * ------------------
 * - Income categories live in ``lib/preferencesUtils.ts``
 *   (``INCOME_CATEGORY_COLORS``)
 * - Investment categories live in ``pages/investment-analytics/
 *   investmentUtils.ts`` (``CATEGORY_COLORS``)
 * - Account-type gradients live in ``pages/settings/types.ts``
 *   (``CATEGORY_COLORS``)
 *
 * Each of those covers a different taxonomy, so they stay separate.
 */

import { CHART_COLORS } from './chartColors'
import { rawColors, onRawColorsRefresh } from './colors'

/**
 * Canonical expense category -> colour map.
 *
 * Keys must match the canonical category names that come back from the
 * backend (``Transaction.category``). Add a new entry here when you
 * introduce a new category; never inline a colour at a chart callsite.
 *
 * Built from ``rawColors.app`` and rebuilt IN PLACE on theme toggle (see the
 * ``onRawColorsRefresh`` listener below) so category hues track the active
 * theme while the exported object identity stays stable for importers.
 */
function buildExpenseCategoryColors(): Record<string, string> {
  const c = rawColors.app
  return {
    // --- existing colours preserved from pages/bill-calendar/types.ts ---
    // (kept identical so production users see the same colours they're used to)
    'Bills & Utilities': c.blue,
    Entertainment: c.purple,
    'Entertainment & Recreations': c.purple, // alias seen in production data
    'Food & Dining': c.orange,
    Insurance: c.teal,
    Shopping: c.pink,
    Transportation: c.yellow,
    'Health & Fitness': c.green,
    Education: c.indigo,

    // --- additional categories from essentialCategories defaults ---
    // (preferencesStore.ts seeds: Housing, Healthcare, Transportation,
    // Food & Dining, Education, Family, Utilities)
    Housing: c.indigo,
    Healthcare: c.green, // mirrors "Health & Fitness"
    Family: c.pink,
    Utilities: c.blue, // alias of "Bills & Utilities"
  }
}

export const EXPENSE_CATEGORY_COLORS: Record<string, string> = buildExpenseCategoryColors()

// Rebuild category hues in place after a theme toggle re-resolves rawColors.
onRawColorsRefresh(() => Object.assign(EXPENSE_CATEGORY_COLORS, buildExpenseCategoryColors()))

/**
 * Deterministic per-category colour with a stable fallback.
 *
 * - If the category is in ``EXPENSE_CATEGORY_COLORS``, return that
 *   semantic colour.
 * - Otherwise, hash the name and pick from ``CHART_COLORS``. This means
 *   an unknown category gets the **same** colour every time it appears,
 *   so users don't see it shift between renders.
 */
export function getExpenseCategoryColor(category: string): string {
  const explicit = EXPENSE_CATEGORY_COLORS[category]
  if (explicit) return explicit

  // djb2-style hash over the category name; lightweight and deterministic.
  let hash = 5381
  for (let i = 0; i < category.length; i++) {
    hash = (hash * 33) ^ (category.codePointAt(i) ?? 0)
  }
  const idx = Math.abs(hash) % CHART_COLORS.length
  return CHART_COLORS[idx]
}
