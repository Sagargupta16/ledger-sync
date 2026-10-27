/**
 * Return filing deadlines for an individual whose accounts need no audit.
 * Statutory dates only (CBDT can extend them); a computation aid, not tax
 * advice.
 *
 * AY 2026-27 (FY 2025-26) falls under the Income-tax Act 1961 as amended by
 * Finance Act 2026: community/itr-agent data/fy2025-26.json `deadlines`,
 * `deadlineCitations` and `lateFee234F` (s.139(1) 31 July, or 31 August for a
 * non-audit return with business or professional income and 31 October with an
 * audit; s.139(4) 31 December; s.139(5) to the end of the AY with the s.234I
 * fee after 31 December). The Memorandum to the Finance Bill 2026
 * (https://www.indiabudget.gov.in/doc/memo.pdf) applies the 12-month revision
 * window to AY 2026-27.
 *
 * Tax Year 2026-27 onward falls under the Income-tax Act 2025: s.263(1) due
 * 31 July after the year, s.263(4) belated up to 9 months after it, s.263(5)
 * revised up to 12 months after it with a fee after 9 months (s.428(b)), and
 * s.121 carries a loss forward only from a return filed by the due date (owner
 * PDF, Wayback snapshot 2026-06-12, see lib/tax/advanceTaxRules.ts). The Budget
 * speech of 2026-02-01 (https://www.indiabudget.gov.in/doc/Budget_Speech.pdf)
 * kept 31 July for ITR-1 and ITR-2; no source read here gives the 2025 Act date
 * for a return with business income, so that case gets a caveat, not a date.
 */
import { formatTaxYearLabel, isAct2025Year, taxYearKey } from '@/lib/tax-config'
import type { Transaction } from '@/types'

export interface FilingDeadline {
  key: 'due' | 'belated' | 'revised'
  /** `YYYY-MM-DD` */
  date: string
  label: string
  /** Section that sets the date. */
  basis: string
  note: string
}

export interface FilingCalendarYear {
  yearLabel: string
  act: string
  /** Who the dates are for, e.g. "an individual with no business income and no audit". */
  scope: string
  deadlines: FilingDeadline[]
  /** Set when the year's income may need a date this calendar does not show. */
  caveat: string | null
}

/** AY 2026-27 (FY 2025-26) is the first year covered; earlier windows have closed. */
export const FIRST_FILING_CALENDAR_YEAR = 2025

const NO_BUSINESS_SCOPE = 'an individual with no business income and no audit'

/** A category or subcategory naming business, self-employment, freelance, professional, consulting or gig work. */
const BUSINESS_INCOME_PATTERN = /\b(?:business|self[\s-]?employ\w*|freelanc\w*|professional|consult\w*|gig)\b/i

/** Whether any of the year's taxable income rows reads as business or professional income. */
export const hasBusinessIncome = (rows: readonly Transaction[]): boolean =>
  rows.some((tx) => BUSINESS_INCOME_PATTERN.test(tx.category) || BUSINESS_INCOME_PATTERN.test(tx.subcategory ?? ''))

const LATE_FEE_NOTE = 'Filing later adds a late fee, and s.234A interest on any tax still unpaid.'

/**
 * The return, belated and revised deadlines for the tax year starting 1 April
 * of `taxYearStart`. `businessIncome` moves the AY 2026-27 due date to 31
 * August and adds a caveat from Tax Year 2026-27.
 */
export function filingDeadlines(taxYearStart: number, businessIncome = false): FilingCalendarYear | null {
  if (taxYearStart < FIRST_FILING_CALENDAR_YEAR) return null
  const endYear = taxYearStart + 1
  if (!isAct2025Year(taxYearStart)) {
    return {
      yearLabel: `AY ${taxYearKey(endYear)} (${formatTaxYearLabel(taxYearStart)})`,
      act: 'Income-tax Act 1961, as amended by Finance Act 2026',
      scope: businessIncome ? 'an individual with business or professional income and no audit' : NO_BUSINESS_SCOPE,
      caveat: null,
      deadlines: [
        businessIncome
          ? {
            key: 'due', date: `${endYear}-08-31`, label: 'Return due', basis: 's.139(1)',
            note: `Finance Act 2026 moved this date to 31 August for business or professional income (31 October with an audit). ${LATE_FEE_NOTE}`,
          }
          : { key: 'due', date: `${endYear}-07-31`, label: 'Return due', basis: 's.139(1)', note: LATE_FEE_NOTE },
        {
          key: 'belated', date: `${endYear}-12-31`, label: 'Last day for a belated return', basis: 's.139(4)',
          note: 'Late fee under s.234F: INR 5,000, or INR 1,000 when total income is up to INR 5 lakh.',
        },
        {
          key: 'revised', date: `${endYear + 1}-03-31`, label: 'Last day to revise the return', basis: 's.139(5)',
          note: 'Finance Act 2026 allows 12 months; a revision after the belated-return date carries the s.234I fee.',
        },
      ],
    }
  }
  return {
    yearLabel: formatTaxYearLabel(taxYearStart),
    act: 'Income-tax Act 2025',
    scope: NO_BUSINESS_SCOPE,
    caveat: businessIncome
      ? 'Business or professional income is recorded for this year. The 31 July due date is for a return without it; a return with business income can be due later, and this calendar does not cover that date.'
      : null,
    deadlines: [
      {
        key: 'due', date: `${endYear}-07-31`, label: 'Return due', basis: 's.263(1)',
        note: 'Budget 2026 kept 31 July for ITR-1 and ITR-2. Losses carry forward only from a return filed by this date (s.121).',
      },
      {
        key: 'belated', date: `${endYear}-12-31`, label: 'Last day for a belated return', basis: 's.263(4)',
        note: 'Up to 9 months after the tax year.',
      },
      {
        key: 'revised', date: `${endYear + 1}-03-31`, label: 'Last day to revise the return', basis: 's.263(5)',
        note: 'Up to 12 months after the tax year; a revision after the belated-return date carries a fee of INR 1,000 or INR 5,000 (s.428(b)).',
      },
    ],
  }
}
