/**
 * Bare fiscal-year labels ("2026-27") for the salary-structure grid.
 *
 * These are the STORAGE keys of `preferences.salary_structure`, so they keep
 * the two-year "2026-27" form for every start month -- including a January
 * fiscal year, whose display label is the one-year "FY 2026". Saved rows are
 * keyed this way, and changing the form would orphan them. Anything that
 * matches a storage key against a display label compares START YEARS, never
 * strings; {@link fyDisplayLabel} renders a key the way the rest of the app
 * labels that year.
 *
 * Every function takes `fyStartMonth` explicitly, defaulting to
 * `FY_START_MONTH` only as a last resort. They used to hardcode April: a user
 * who set `fiscal_year_start_month` to anything else got salary rows filed
 * under a different FY than `getFYFromDate` (the tax engine) resolves the same
 * date to, so the projection silently rescaled the base salary and the FY
 * badges on RSU vestings disagreed with the tax page. Callers read the real
 * value from `selectFiscalYearStartMonth`.
 */

import { FY_START_MONTH } from '@/lib/taxCalculator'
import { formatFYLabel, getFYFromDate, getTodayKey, parseFYLabelStartYear } from '@/lib/dateUtils'

export function parseBareStartYear(fy: string): number {
  return Number.parseInt(fy.split('-')[0] || '0', 10)
}

/** Storage key of the fiscal year starting in `startYear`: always "YYYY-YY". */
function storageKey(startYear: number): string {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`
}

/** Storage key for a tax-engine display label: "FY 2026-27" or "FY 2026" -> "2026-27". */
function toStorageKey(fyDisplayLabel: string): string {
  const startYear = parseFYLabelStartYear(fyDisplayLabel)
  return startYear === null ? '' : storageKey(startYear)
}

/** Display label for a storage key: "FY 2026-27", or "FY 2026" for a January start. */
export function fyDisplayLabel(fy: string, fyStartMonth: number = FY_START_MONTH): string {
  return formatFYLabel(parseBareStartYear(fy), fyStartMonth)
}

export function currentFYLabel(fyStartMonth: number = FY_START_MONTH): string {
  // `getTodayKey()`, not `new Date()` getters -- see dateUtils. Delegating to
  // `getFYFromDate` keeps this in lockstep with the tax engine's own boundary.
  return toStorageKey(getFYFromDate(getTodayKey(), fyStartMonth))
}

export function nextFY(fy: string): string {
  return storageKey(parseBareStartYear(fy) + 1)
}

export function dateToFY(dateStr: string, fyStartMonth: number = FY_START_MONTH): string {
  if (!/^\d{4}-\d{2}/.test(dateStr) && Number.isNaN(new Date(dateStr).getTime())) return ''
  return toStorageKey(getFYFromDate(dateStr, fyStartMonth))
}
