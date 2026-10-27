/**
 * Advance-tax rules for an Indian tax year (1 April to 31 March): the INR
 * 10,000 gate, the four cumulative instalment dates and the sections that set
 * them. A computation aid, not tax advice.
 *
 * Ported from community/itr-agent (MIT, same author), not re-derived:
 * src/engine/advance-tax.ts `scheduleAdvanceTax`, src/engine/interest.ts
 * `interest234B` / `interest234C` / `floor100`, and the `advanceTax`,
 * `interest` and `rounding` blocks of data/fy2025-26.json. Checked against the
 * Income-tax Act 2025 as amended by Finance Act 2026, ss.403-408 and s.425
 * (owner PDF, Wayback snapshot 2026-06-12:
 * https://web.archive.org/web/20260612085646id_/https://www.incometaxindia.gov.in/documents/d/guest/income_tax_act_2025_as_amended_by_fa_act_2026-pdf):
 *
 * - Payable when the year's tax after TDS and TCS is INR 10,000 or more
 *   (1961 Act s.208; 2025 Act ss.403-408).
 * - Cumulative instalments: 15% by 15 Jun, 45% by 15 Sep, 75% by 15 Dec and
 *   100% by 15 Mar (1961 Act s.211; 2025 Act s.408).
 * - Deferment interest (1961 Act s.234C; 2025 Act s.425): 1% a month on the
 *   shortfall, 3 months at each of the first three dates and 1 month at March;
 *   nil in June when 12% was paid and in September when 36% was.
 * - Default interest (1961 Act s.234B, in ./advanceTaxInterest.ts): 1% a
 *   month from 1 April after the year while advance tax paid is under 90% of
 *   the tax after TDS and TCS, until a self-assessment payment clears the
 *   balance.
 * - Rule 119A: the principal is floored to a multiple of INR 100 and a part
 *   month counts as a full month. Payments are summed in whole paise.
 *
 * Not modelled (said so in the UI): the proviso excusing a shortfall caused by
 * capital gains or dividends paid in a later instalment, the single 15 March
 * instalment for presumptive income, and the exemption for resident seniors
 * (60+) with no business income.
 */
import { isAct2025Year } from '@/lib/tax-config'

/** Advance tax applies at or above this net liability, in INR. */
export const ADVANCE_TAX_THRESHOLD = 10_000

/** First year planned: FY 2020-21, the first year the app's tax rules cover. */
export const FIRST_ADVANCE_TAX_YEAR = 2020

/** Default interest applies while advance tax paid is under this share of the year's tax, in %. */
export const DEFAULT_INTEREST_PAID_PCT = 90

const DUE_DAY = 15

export interface InstalmentRule {
  readonly month: number
  readonly cumulativePct: number
  /** Paying this share of the year's advance tax by the date zeroes its interest. */
  readonly safeHarbourPct: number | null
  /** Months of deferment interest charged on a shortfall at this date. */
  readonly interestMonths: number
}

export const INSTALMENT_RULES: readonly InstalmentRule[] = [
  { month: 6, cumulativePct: 15, safeHarbourPct: 12, interestMonths: 3 },
  { month: 9, cumulativePct: 45, safeHarbourPct: 36, interestMonths: 3 },
  { month: 12, cumulativePct: 75, safeHarbourPct: null, interestMonths: 3 },
  { month: 3, cumulativePct: 100, safeHarbourPct: null, interestMonths: 1 },
]

export interface AdvanceTaxDueDate {
  /** `YYYY-MM-DD` */
  date: string
  label: string
  /** Share of the year's advance tax due by `date`, 0-100 (15, 45, 75, 100). */
  cumulativePct: number
}

/** The four dates of the tax year starting 1 April of `taxYearStart` (Tax Year 2026-27 is 2026), oldest first. */
export function advanceTaxDueDates(taxYearStart: number): AdvanceTaxDueDate[] {
  return INSTALMENT_RULES.map((rule, index) => {
    const year = rule.month < 4 ? taxYearStart + 1 : taxYearStart
    return {
      date: `${year}-${String(rule.month).padStart(2, '0')}-${DUE_DAY}`,
      label: `Advance tax ${index + 1} of 4 (${rule.cumulativePct}% cumulative)`,
      cumulativePct: rule.cumulativePct,
    }
  })
}

export interface AdvanceTaxLaw { act: string; defermentSection: string; defaultSection: string }

/** Section numbers for the year: the 2025 Act applies from Tax Year 2026-27. */
export function advanceTaxLaw(taxYearStart: number): AdvanceTaxLaw {
  return isAct2025Year(taxYearStart)
    ? { act: 'Income-tax Act 2025, ss.403-408 and s.425', defermentSection: 's.425', defaultSection: 'old s.234B' }
    : { act: 'Income-tax Act 1961, ss.207-211, 234B and 234C', defermentSection: 's.234C', defaultSection: 's.234B' }
}
