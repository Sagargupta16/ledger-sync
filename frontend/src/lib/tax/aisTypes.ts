/** The shapes `/tax/ais` shows: classified AIS lines (`aisClassify.ts`) and the ledger rows they are matched against (`aisReconcile.ts`). */

export type AisHead = 'salary' | 'interest' | 'dividend' | 'rent' | 'business' | 'capital_gains' | 'other'

export interface AisLine {
  key: string
  /** The AIS part the line came from, such as "TDS/TCS Information". */
  part: string
  head: AisHead
  /** TDS/TCS section ("194A") or information code ("SFT-016"); empty when the export names none. */
  code: string
  description: string
  source: string
  date: string | null
  /** Gross amount paid, credited or transacted, in INR. */
  amount: number
  /** TDS or TCS on the line; null when its table has no tax column. */
  tax: number | null
  /** Units or shares, on securities and mutual fund lines. */
  quantity: number | null
}

export interface AisAnnexure {
  key: string
  source: string
  description: string
  fields: { label: string; value: string }[]
}

export interface AisSections {
  tds: AisLine[]
  tcs: AisLine[]
  /** SFT and other-information interest; TDS interest lines stay in `tds`. */
  interest: AisLine[]
  dividends: AisLine[]
  securities: AisLine[]
  salaryAnnexure: AisAnnexure[]
  other: AisLine[]
}

export interface ReconLedgerRow {
  id: string
  date: string
  amount: number
  category: string
  subcategory: string
  account: string
  note: string
  /** Income head read from the category, subcategory or note; null when none applies. */
  kind: AisHead | null
}
