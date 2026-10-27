/**
 * Demo `GET /api/mf-holdings`: a made-up CAS portfolio priced at "yesterday's"
 * NAV, in the exact shape `api/cas_holdings.py` builds.
 *
 * Demo mode cannot import a CAS, so this stands in for one: four CAMS/KFintech
 * schemes from a detailed CAS (two with a full history and an XIRR, one whose
 * statement starts with an opening balance) and one demat scheme from a CDSL
 * CAS, which lists holdings only. Units, NAVs and rates are illustrative; each ISIN
 * and AMFI code pair is a real one from AMFI's NAVAll.txt (checked 2026-10-27).
 */

import { addDaysToKey, addMonthsToKey, getTodayKey } from '@/lib/dateUtils'
import type { MfHolding, MfHoldingsResponse, XirrNote } from '@/services/api/cas'

interface DemoScheme {
  readonly source: MfHolding['source']
  readonly folio: string | null
  readonly amc: string | null
  readonly scheme_name: string
  readonly isin: string
  readonly amfi_code: string
  readonly scheme_type: string
  readonly units: number
  readonly nav: number
  readonly cost: number
  readonly xirr: number | null
  /** Months back to the first purchase, for `xirr_since`. */
  readonly sinceMonths: number | null
  readonly note: XirrNote | null
}

const SCHEMES: readonly DemoScheme[] = [
  {
    source: 'CAMS', folio: '10293847 / 61', amc: 'PPFAS Mutual Fund',
    scheme_name: 'Parag Parikh Flexi Cap Fund - Direct Plan - Growth', isin: 'INF879O01027',
    amfi_code: '122639', scheme_type: 'EQUITY', units: 1523.441, nav: 89.3, cost: 98000,
    xirr: 18.4, sinceMonths: 38, note: null,
  },
  {
    source: 'CAMS', folio: '55102938', amc: 'HDFC Mutual Fund',
    scheme_name: 'HDFC Nifty 50 Index Fund - Direct Plan - Growth', isin: 'INF179K01WM1',
    amfi_code: '119063', scheme_type: 'EQUITY', units: 412.118, nav: 248.35, cost: 90000,
    xirr: 12.1, sinceMonths: 30, note: null,
  },
  {
    source: 'CAMS', folio: '91827364', amc: 'Axis Mutual Fund',
    scheme_name: 'Axis ELSS Tax Saver Fund - Direct Plan - Growth', isin: 'INF846K01EW2',
    amfi_code: '120503', scheme_type: 'EQUITY', units: 980.5, nav: 103.49, cost: 95000,
    xirr: null, sinceMonths: null, note: 'opening_balance',
  },
  {
    source: 'CDSL', folio: null, amc: null,
    scheme_name: 'ICICI Prudential Liquid Fund - Direct Plan - Growth', isin: 'INF109K01Q49',
    amfi_code: '120197', scheme_type: 'DEBT', units: 25.3, nav: 392.11, cost: 9500,
    xirr: null, sinceMonths: null, note: 'no_transactions',
  },
]

const round2 = (value: number) => Math.round(value * 100) / 100

export function generateDemoMfHoldings(): MfHoldingsResponse {
  const today = getTodayKey()
  const navDate = addDaysToKey(today, -1)
  const holdings = SCHEMES.map((scheme, index): MfHolding => {
    const value = round2(scheme.units * scheme.nav)
    const gain = round2(value - scheme.cost)
    return {
      id: index + 1,
      source: scheme.source,
      folio: scheme.folio,
      amc: scheme.amc,
      scheme_name: scheme.scheme_name,
      isin: scheme.isin,
      amfi_code: scheme.amfi_code,
      scheme_type: scheme.scheme_type,
      units: scheme.units,
      nav: scheme.nav,
      nav_date: navDate,
      nav_source: 'amfi',
      current_value: value,
      cost: scheme.cost,
      gain,
      gain_pct: (gain / scheme.cost) * 100,
      xirr: scheme.xirr,
      xirr_since: scheme.sinceMonths === null ? null : addMonthsToKey(today, -scheme.sinceMonths),
      xirr_note: scheme.note,
    }
  }).sort((a, b) => (b.current_value ?? 0) - (a.current_value ?? 0))

  const currentValue = round2(holdings.reduce((sum, h) => sum + (h.current_value ?? 0), 0))
  const cost = holdings.reduce((sum, h) => sum + (h.cost ?? 0), 0)
  const gain = round2(currentValue - cost)
  return {
    holdings,
    summary: {
      current_value: currentValue,
      cost,
      gain,
      gain_pct: (gain / cost) * 100,
      xirr: 15.6,
      xirr_since: addMonthsToKey(today, -38),
      xirr_schemes: 3,
      holdings: holdings.length,
      closed: 1,
      cost_schemes: holdings.length,
      unpriced_schemes: 0,
    },
    nav: {
      checked_at: new Date().toISOString(),
      newest_nav_date: navDate,
      stale: false,
      message: null,
    },
    imports: [
      {
        source: 'CAMS', cas_type: 'DETAILED', statement_from: '2015-04-01',
        statement_to: addDaysToKey(today, -27), imported_at: new Date().toISOString(), schemes: 4,
      },
      {
        source: 'CDSL', cas_type: null, statement_from: addMonthsToKey(today, -1),
        statement_to: addDaysToKey(today, -27), imported_at: new Date().toISOString(), schemes: 1,
      },
    ],
  }
}
