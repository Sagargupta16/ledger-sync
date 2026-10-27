/**
 * CAS import and the mutual-fund holdings it creates.
 *
 * `POST /api/upload/cas` takes the original CAS PDF and its password as
 * multipart form data. The server parses it in memory: neither the PDF nor the
 * password is stored or logged, only folios, schemes, units and transactions.
 * `GET /api/mf-holdings` values every scheme at AMFI's latest NAV (fetched at
 * most once a day after 10:30 IST) with cost, gain and XIRR on a 365-day year.
 */

import { apiClient } from './client'

export type CasSource = 'CAMS' | 'KFINTECH' | 'NSDL' | 'CDSL'

/**
 * Why a holding has no XIRR. `no_transactions`: a summary or demat CAS lists
 * holdings only. `opening_balance`: the statement starts after the first
 * purchase. `no_nav`: nothing gave a NAV to value it today. `no_solution`: the
 * flows have no rate.
 */
export type XirrNote = 'no_transactions' | 'opening_balance' | 'no_nav' | 'no_solution'

export interface CasImportResult {
  source: CasSource
  /** `DETAILED` or `SUMMARY`; null for an NSDL or CDSL CAS. */
  cas_type: string | null
  statement_from: string | null
  statement_to: string | null
  folios: number
  /** Every scheme stored, fully redeemed ones included. */
  schemes: number
  /** Schemes with units left. */
  holdings: number
  transactions: number
  /** Holdings from the previous import of the same kind that this one replaced. */
  replaced: number
  /** What the parser flagged: a scheme it skipped, or rows that do not add up to the unit balance. */
  warnings: string[]
}

export interface MfHolding {
  id: number
  source: CasSource
  folio: string | null
  amc: string | null
  scheme_name: string
  isin: string | null
  amfi_code: string | null
  scheme_type: string | null
  units: number
  nav: number | null
  /** `YYYY-MM-DD` the NAV is for. */
  nav_date: string | null
  /** AMFI's daily file, or the statement's own NAV when AMFI had none. */
  nav_source: 'amfi' | 'statement' | null
  current_value: number | null
  cost: number | null
  gain: number | null
  /** Already x100. */
  gain_pct: number | null
  /** Annualised percent on a 365-day year. */
  xirr: number | null
  /** First cash flow, so a holding under a year old can be labelled. */
  xirr_since: string | null
  xirr_note: XirrNote | null
}

export interface MfHoldingsSummary {
  current_value: number
  cost: number | null
  gain: number | null
  gain_pct: number | null
  /** Over every scheme with a complete history, fully redeemed ones included. */
  xirr: number | null
  xirr_since: string | null
  xirr_schemes: number
  holdings: number
  closed: number
  /** Held schemes that Cost and Gain cover: those with both a value and a cost. */
  cost_schemes: number
  /** Held schemes with no NAV at all, which add nothing to the market value. */
  unpriced_schemes: number
}

export interface MfNavStatus {
  /** ISO UTC instant of the newest AMFI check of these schemes. */
  checked_at: string | null
  newest_nav_date: string | null
  /** True when today's refresh failed or was skipped. */
  stale: boolean
  message: string | null
}

export interface MfImportInfo {
  source: CasSource
  cas_type: string | null
  statement_from: string | null
  statement_to: string | null
  imported_at: string
  schemes: number
}

export interface MfHoldingsResponse {
  /** Schemes with units left, largest value first. */
  holdings: MfHolding[]
  summary: MfHoldingsSummary
  nav: MfNavStatus
  imports: MfImportInfo[]
}

// Vercel refuses a body over 4.5 MB before the API runs; keep room for the form.
export const MAX_CAS_BYTES = 4_400_000
// Parsing a long detailed CAS can take several seconds on a cold server.
const IMPORT_TIMEOUT_MS = 120_000
// A read may download AMFI's 1.5 MB NAV file first.
const HOLDINGS_TIMEOUT_MS = 60_000

/**
 * Throw on anything that is not a holdings payload. A demo-mode catch-all
 * answers `[]` for an unknown route, and the page would crash reading
 * `.summary` off that instead of showing its own error.
 */
function assertHoldings(payload: unknown): MfHoldingsResponse {
  const value = payload as Partial<MfHoldingsResponse> | null
  if (!value || !Array.isArray(value.holdings) || typeof value.summary !== 'object' || !value.nav) {
    throw new TypeError('mf-holdings returned an unexpected payload')
  }
  return value as MfHoldingsResponse
}

export const casService = {
  importCas: async (file: File, password: string): Promise<CasImportResult> => {
    if (file.size > MAX_CAS_BYTES) {
      throw new Error('This PDF is over 4.4 MB, more than the server accepts.')
    }
    const form = new FormData()
    form.append('file', file, file.name || 'cas.pdf')
    form.append('password', password)
    // The explicit type stops axios turning the form into JSON (the client's
    // default type); the browser then sets the real boundary.
    const response = await apiClient.post<CasImportResult>('/api/upload/cas', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: IMPORT_TIMEOUT_MS,
    })
    return response.data
  },

  getHoldings: async (): Promise<MfHoldingsResponse> => {
    const response = await apiClient.get<unknown>('/api/mf-holdings', {
      timeout: HOLDINGS_TIMEOUT_MS,
    })
    return assertHoldings(response.data)
  },
}
