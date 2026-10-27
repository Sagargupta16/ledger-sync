/**
 * Year naming. The Income-tax Act 2025 replaced the 1961 Act from 1 April 2026
 * and calls the twelve months a "tax year" instead of "previous year" (CBDT
 * FAQ Q8-Q9, https://www.incometax.gov.in/iec/foportal/help/all-topics/e-filing-services/objective-and-scope-new-act,
 * read 2026-10-26). Years before it keep their FY labels.
 */

/** Start year of the first tax year under the Income-tax Act 2025. */
const FIRST_TAX_YEAR_UNDER_ACT_2025 = 2026

/** Whether the year is governed by the Income-tax Act 2025 rather than the 1961 Act. */
export const isAct2025Year = (fyStartYear: number): boolean =>
  fyStartYear >= FIRST_TAX_YEAR_UNDER_ACT_2025

/** "2026-27": the key a year's saved deductions are stored under. */
export const taxYearKey = (fyStartYear: number): string =>
  `${fyStartYear}-${String((fyStartYear + 1) % 100).padStart(2, '0')}`

/** "Tax Year 2026-27" under the Income-tax Act 2025, "FY 2025-26" before it. */
export const formatTaxYearLabel = (fyStartYear: number): string =>
  `${isAct2025Year(fyStartYear) ? 'Tax Year' : 'FY'} ${taxYearKey(fyStartYear)}`
