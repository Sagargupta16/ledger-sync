/**
 * Where the Income-tax Act 2025 puts the provisions this page names by their
 * 1961 Act sections, so a Tax Year 2026-27 label reads "s.123 (old 80C)".
 *
 * Each reference was checked against the text of the Act as amended by Finance
 * Act 2026, read from the Wayback copy of the incometaxindia.gov.in PDF
 * (snapshot 2026-06-12, read 2026-10-26 and rechecked 2026-10-27; the owner
 * host refuses fetchers):
 * https://web.archive.org/web/20260612085646id_/https://www.incometaxindia.gov.in/documents/d/guest/income_tax_act_2025_as_amended_by_fa_act_2026-pdf
 * s.19(1) Table Sl. No. 2 is the standard deduction, s.202 the default regime,
 * s.123 the 1.5L deduction, s.124(3) the extra 50K for own NPS contributions,
 * s.126 health insurance, s.22(1)(b) home-loan interest (its 2L cap is
 * s.22(2)(a)), and Schedule III (Table: Sl. No. 11) the rent allowance
 * exemption, which s.202(2)(a)(i) withholds in the default regime. `title` is
 * a plain description, not the statutory heading.
 */

import { isAct2025Year } from './taxYear'

interface TaxSection {
  /** The 2025 Act reference: a section, or a Schedule entry. */
  readonly newRef: string
  readonly oldSection: string
  readonly title: string
}

const TAX_SECTIONS = {
  '16(ia)': { newRef: 's.19', oldSection: '16(ia)', title: 'Standard deduction from salary' },
  '115BAC': { newRef: 's.202', oldSection: '115BAC', title: 'Default (new) tax regime' },
  '80C': { newRef: 's.123', oldSection: '80C', title: 'Life insurance, provident fund, PPF, ELSS and similar payments' },
  '80CCD(1B)': { newRef: 's.124(3)', oldSection: '80CCD(1B)', title: 'Own contribution to the National Pension System' },
  '80D': { newRef: 's.126', oldSection: '80D', title: 'Health insurance premiums' },
  HRA: { newRef: 'Schedule III Sl. No. 11', oldSection: '10(13A)', title: 'House rent allowance exemption' },
  '24(b)': { newRef: 's.22', oldSection: '24(b)', title: 'Interest on a home loan' },
} as const satisfies Record<string, TaxSection>

type TaxSectionKey = keyof typeof TAX_SECTIONS

/** "s.123 (old 80C)" from Tax Year 2026-27, "Sec 80C" before it. */
export function formatSectionRef(key: TaxSectionKey, fyStartYear: number): string {
  const { newRef, oldSection } = TAX_SECTIONS[key]
  return isAct2025Year(fyStartYear) ? `${newRef} (old ${oldSection})` : `Sec ${oldSection}`
}

/** Hover text: the reference and what it covers. */
export function sectionTooltip(key: TaxSectionKey, fyStartYear: number): string {
  return `${formatSectionRef(key, fyStartYear)}: ${TAX_SECTIONS[key].title}`
}

interface DeductionField {
  /** Stored section key (the 1961 Act name the page has always used). */
  readonly key: TaxSectionKey
  /** Fixed label in place of the section reference. */
  readonly label?: string
  readonly hint: string
  /** Largest amount the input accepts. */
  readonly max: number
  /** `max` is a legal limit, so the input shows how much of it is left. */
  readonly headroom: boolean
}

/** The old-regime deduction inputs on /tax, in display order. */
export const OLD_REGIME_DEDUCTIONS = [
  { key: '80C', hint: 'PPF, ELSS, LIC (max 1.5L)', max: 150_000, headroom: true },
  // Own NPS contributions, on top of the 1.5L cap; many salaried users miss it.
  { key: '80CCD(1B)', hint: 'Extra NPS (max 50K, over 80C)', max: 50_000, headroom: true },
  // 25K each for self and parents, 50K for a senior citizen (s.126(2), (4) and
  // (8)), so 1L at most. The page does not ask ages, so it shows no headroom bar.
  { key: '80D', hint: 'Health Insurance (25K each for you and parents; 50K if 60+)', max: 100_000, headroom: false },
  { key: 'HRA', label: 'HRA', hint: 'House Rent Allowance', max: 500_000, headroom: false },
  { key: '24(b)', hint: 'Home Loan Interest (max 2L)', max: 200_000, headroom: true },
] as const satisfies readonly DeductionField[]

export type DeductionKey = (typeof OLD_REGIME_DEDUCTIONS)[number]['key']

/** Input label for a deduction field in the given year. */
export function deductionLabel(field: DeductionField, fyStartYear: number): string {
  return field.label ?? formatSectionRef(field.key, fyStartYear)
}
