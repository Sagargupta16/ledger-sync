/**
 * Bare fiscal-year labels ("2026-27") for the salary-structure grid.
 *
 * These are the STORAGE keys of `preferences.salary_structure`, so they stay
 * bare -- unlike the "FY 2026-27" display labels the tax engine returns.
 *
 * Every function takes `fyStartMonth` explicitly, defaulting to
 * `FY_START_MONTH` only as a last resort. They used to hardcode April: a user
 * who set `fiscal_year_start_month` to anything else got salary rows filed
 * under a different FY than `getFYFromDate` (the tax engine) resolves the same
 * date to, so the projection silently rescaled the base salary and the FY
 * badges on RSU vestings disagreed with the tax page. Callers read the real
 * value from `selectFiscalYearStartMonth`.
 */

import { FY_START_MONTH, getFYFromDate } from '@/lib/taxCalculator'
import { getTodayKey } from '@/lib/dateUtils'

export function parseBareStartYear(fy: string): number {
  return Number.parseInt(fy.split('-')[0] || '0', 10)
}

/** Strip the "FY " prefix the tax engine emits: "FY 2026-27" -> "2026-27". */
function toBareLabel(fyDisplayLabel: string): string {
  return fyDisplayLabel.replace(/^FY\s+/, '')
}

export function currentFYLabel(fyStartMonth: number = FY_START_MONTH): string {
  // `getTodayKey()`, not `new Date()` getters -- see dateUtils. Delegating to
  // `getFYFromDate` keeps this in lockstep with the tax engine's own boundary.
  return toBareLabel(getFYFromDate(getTodayKey(), fyStartMonth))
}

export function nextFY(fy: string): string {
  const start = parseBareStartYear(fy) + 1
  const end = (start + 1) % 100
  return `${start}-${String(end).padStart(2, '0')}`
}

export function dateToFY(dateStr: string, fyStartMonth: number = FY_START_MONTH): string {
  if (!/^\d{4}-\d{2}/.test(dateStr) && Number.isNaN(new Date(dateStr).getTime())) return ''
  return toBareLabel(getFYFromDate(dateStr, fyStartMonth))
}
