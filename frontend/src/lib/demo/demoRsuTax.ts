/**
 * Demo answers for `/api/rsu-tax`: a made-up US employer stock vesting twice a
 * year, priced by a smooth synthetic series and converted at a synthetic rupee
 * rate. Nothing here is market data. The rules match the backend's
 * (`core/foreign_assets_schedule.py`) in miniature so the demo screens stay
 * coherent. Demo mode blocks every write, so there are no saved FX records.
 */

import { addDaysToKey, getTodayKey } from '@/lib/dateUtils'
import { conversionRule, previousMonthEnd } from '@/lib/rsuTaxFx'
import type {
  FastDsReport,
  ForeignAssetEvent,
  ForeignAssetLot,
  LotLedger,
  ScheduleFaReport,
  ScheduleFaRow,
  VestClose,
} from '@/services/api/rsuTax'
import type { Transaction } from '@/types'

const SYMBOL = 'TCRP'
const GROSS = 16
const RECEIVED = 11
const EPOCH = Date.UTC(2023, 0, 1)
const DAY_MS = 86_400_000
const FAST_DS_DATE = '2026-03-31'
const RATE_BASIS = 'Synthetic demo rate (the live app uses the ECB reference rate of the day)'

const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits
const dayIndex = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return Math.round((Date.UTC(y, m - 1, d) - EPOCH) / DAY_MS)
}
const keyOf = (index: number) => addDaysToKey('2023-01-01', index)
const price = (key: string) => round(150 + 0.06 * dayIndex(key) + 18 * Math.sin(dayIndex(key) / 37))
const rate = (key: string) => round(82 + 0.009 * dayIndex(key) + 0.4 * Math.sin(dayIndex(key) / 23), 4)
const isTradingDay = (key: string) => ![0, 6].includes(new Date(`${key}T00:00:00Z`).getUTCDay())

function demoRecords(today: string): { lots: ForeignAssetLot[]; events: ForeignAssetEvent[] } {
  const year = Number(today.slice(0, 4))
  const dates = [year - 2, year - 1, year].flatMap((y) => [`${y}-05-15`, `${y}-11-16`]).filter((d) => d <= today)
  const saleDate = `${year - 1}-03-12`
  const sold = saleDate <= today ? 5 : 0
  const lots = dates.map((date, index): ForeignAssetLot => {
    const perShare = round(price(date) * rate(date))
    const lotSold = index === 0 ? sold : 0
    return {
      lot_id: `demo-lot-${index + 1}`, grant_id: 'demo-rsu-1', symbol: SYMBOL, currency: 'USD', acquired_on: date,
      gross_quantity: GROSS, held_quantity: RECEIVED, quantity_estimated: false,
      sold_quantity: lotSold, remaining_quantity: RECEIVED - lotSold, split_factor: 1, splits: [], fx_source: 'ecb',
      tax_value_inr: round(perShare * GROSS), ecb_value_inr: round(perShare * GROSS), difference_inr: 0,
      cost_per_share_inr: perShare, initial_value_inr: round(perShare * RECEIVED),
      conversion_rule: conversionRule(date), specified_date: previousMonthEnd(date), flags: ['fx_approximate'],
    }
  })
  const common = { currency: 'USD', fx_rate: null, fx_date: null, amount_inr: null, notes: null, issue: null }
  const events: ForeignAssetEvent[] = []
  if (sold > 0) {
    events.push({ ...common, id: 1, kind: 'sale', lot_id: 'demo-lot-1', symbol: SYMBOL, event_date: saleDate,
      quantity: sold, gross_amount: round(sold * price(saleDate)), tax_withheld: null })
  }
  const dividendDate = `${year - 1}-06-20`
  if (dividendDate <= today) {
    events.push({ ...common, id: 2, kind: 'dividend', lot_id: null, symbol: SYMBOL, event_date: dividendDate,
      quantity: null, gross_amount: 12.4, tax_withheld: 3.1 })
  }
  return { lots, events }
}

function sharesHeld(lot: ForeignAssetLot, events: ForeignAssetEvent[], day: string, sameDay: boolean): number {
  if (day < lot.acquired_on) return 0
  const sold = events
    .filter((e) => e.kind === 'sale' && e.lot_id === lot.lot_id && (sameDay ? e.event_date <= day : e.event_date < day))
    .reduce((total, e) => total + (e.quantity ?? 0), 0)
  return Math.max(0, lot.held_quantity - sold)
}

function lastTradingDay(key: string): string {
  let index = dayIndex(key)
  while (!isTradingDay(keyOf(index))) index -= 1
  return keyOf(index)
}

function demoRow(lot: ForeignAssetLot, events: ForeignAssetEvent[], start: string, end: string): ScheduleFaRow | null {
  const first = lot.acquired_on > start ? lot.acquired_on : start
  const opening = sharesHeld(lot, events, first, false)
  if (lot.acquired_on > end || opening <= 0) return null
  let peak = { inr: 0, quote: 0, date: first, rate: rate(first) }
  for (let index = dayIndex(first); index <= dayIndex(end); index += 1) {
    const day = keyOf(index)
    const quote = sharesHeld(lot, events, day, false) * price(day)
    if (isTradingDay(day) && quote * rate(day) > peak.inr) peak = { inr: quote * rate(day), quote, date: day, rate: rate(day) }
  }
  const closingDay = lastTradingDay(end)
  const closing = sharesHeld(lot, events, end, true) * price(closingDay)
  const sales = events.filter((e) => e.kind === 'sale' && e.lot_id === lot.lot_id && e.event_date >= start && e.event_date <= end)
  return {
    lot_id: lot.lot_id, symbol: SYMBOL, entity_name: 'TechCorp Inc.', country: 'United States of America',
    nature: 'Company', currency: 'USD', acquired_on: lot.acquired_on, shares_at_start: opening,
    shares_at_end: sharesHeld(lot, events, end, true), fx_source: 'ecb',
    initial_value_inr: Math.round((lot.cost_per_share_inr ?? 0) * opening),
    peak_value_inr: Math.round(peak.inr), peak_value_quote: round(peak.quote), peak_date: peak.date, peak_rate: peak.rate,
    closing_value_inr: Math.round(closing * rate(end)), closing_value_quote: round(closing),
    closing_price_date: closing > 0 ? closingDay : null, closing_rate: closing > 0 ? rate(end) : null,
    dividends_inr: 0, dividends_quote: 0, tax_withheld_inr: 0, tax_withheld_quote: 0,
    sale_proceeds_inr: Math.round(sales.reduce((t, e) => t + e.gross_amount * rate(e.event_date), 0)),
    sale_proceeds_quote: round(sales.reduce((t, e) => t + e.gross_amount, 0)),
    flags: [...lot.flags],
  }
}

/** The backend's `return_label` (core/foreign_assets_reports.py), word for word. */
function returnLabel(year: number): string {
  const yy = (offset: number) => String((year + offset) % 100).padStart(2, '0')
  if (year <= 2025) {
    return `AY ${year + 1}-${yy(2)} ITR-2 Schedule FA, calendar year 1 Jan to 31 Dec ${year} (Income-tax Act 1961)`
  }
  return `Calendar year ${year}. The tax year ${year}-${yy(1)} return under the Income-tax Act 2025 is not published, so its reporting window is unconfirmed`
}

function demoSchedule(year: number, today: string): ScheduleFaReport {
  const start = `${year}-01-01`
  const end = `${year}-12-31` < today ? `${year}-12-31` : today
  const { lots, events } = demoRecords(today)
  const rows = lots.map((lot) => demoRow(lot, events, start, end)).filter((row): row is ScheduleFaRow => row !== null)
  for (const dividend of events.filter((e) => e.kind === 'dividend' && e.event_date >= start && e.event_date <= end)) {
    const held = rows.map((row) => sharesHeld(lots.find((lot) => lot.lot_id === row.lot_id) as ForeignAssetLot, events, dividend.event_date, false))
    const total = held.reduce((t, shares) => t + shares, 0)
    rows.forEach((row, index) => {
      const part = total > 0 ? held[index] / total : 0
      row.dividends_quote = round(row.dividends_quote + dividend.gross_amount * part)
      row.dividends_inr += Math.round(dividend.gross_amount * part * rate(dividend.event_date))
      row.tax_withheld_quote = round(row.tax_withheld_quote + (dividend.tax_withheld ?? 0) * part)
      row.tax_withheld_inr += Math.round((dividend.tax_withheld ?? 0) * part * rate(dividend.event_date))
    })
  }
  const sum = (pick: (row: ScheduleFaRow) => number | null) => rows.reduce((t, row) => t + (pick(row) ?? 0), 0)
  return {
    calendar_year: year, period_start: start, period_end: end, in_progress: end < `${year}-12-31`,
    return_label: returnLabel(year), rate_basis: RATE_BASIS, rows, warnings: [],
    totals: {
      initial_value_inr: sum((r) => r.initial_value_inr), closing_value_inr: sum((r) => r.closing_value_inr),
      dividends_inr: sum((r) => r.dividends_inr), tax_withheld_inr: sum((r) => r.tax_withheld_inr),
      sale_proceeds_inr: sum((r) => r.sale_proceeds_inr),
    },
  }
}

function demoFastDs(today: string): FastDsReport {
  const { lots, events } = demoRecords(today)
  const quoteDay = lastTradingDay(FAST_DS_DATE)
  const rows = lots
    .map((lot) => ({ lot, shares: sharesHeld(lot, events, FAST_DS_DATE, true) }))
    .filter(({ lot, shares }) => lot.acquired_on <= FAST_DS_DATE && shares > 0)
    .map(({ lot, shares }) => {
      const cost = Math.round((lot.cost_per_share_inr ?? 0) * shares)
      const market = Math.round(shares * price(quoteDay) * rate(FAST_DS_DATE))
      return {
        lot_id: lot.lot_id, symbol: SYMBOL, currency: 'USD', acquired_on: lot.acquired_on, shares, cost_inr: cost,
        quote_date: quoteDay, average_quote: price(quoteDay), market_value_quote: round(shares * price(quoteDay)),
        rate: rate(FAST_DS_DATE), rate_date: FAST_DS_DATE, market_value_inr: market,
        value_inr: Math.max(cost, market), basis: market > cost ? ('market' as const) : ('cost' as const),
        flags: [...lot.flags],
      }
    })
  const daysLeft = dayIndex('2026-12-31') - dayIndex(today)
  return {
    valuation_date: FAST_DS_DATE, deadline: '2026-12-31', days_left: daysLeft, rate_basis: RATE_BASIS, rows,
    total_value_inr: rows.reduce((t, row) => t + row.value_inr, 0), complete: true, warnings: [],
  }
}

/** The demo stock never splits, so its vest-date close is the synthetic price as is. */
function demoVestClose(url: string, today: string): VestClose {
  const index = Number(/demo-lot-(\d+)/.exec(url)?.[1] ?? 1) - 1
  const lot = demoRecords(today).lots[index]
  const day = lastTradingDay(lot?.acquired_on ?? today)
  return { symbol: SYMBOL, currency: 'USD', price: price(day), as_of: day, adjusted_price: price(day), split_factor: 1 }
}

/** One resolver for every `/api/rsu-tax/` GET; register it under that URL substring. */
export function resolveDemoRsuTax(_txs: Transaction[], params: Record<string, unknown>, url: string): unknown {
  const today = getTodayKey()
  if (url.includes('/rsu-tax/lots')) {
    const { lots, events } = demoRecords(today)
    const ledger: LotLedger = {
      lots, events, symbols: [SYMBOL], current_year: Number(today.slice(0, 4)), warnings: [],
      first_year: lots.length > 0 ? Number(lots[0].acquired_on.slice(0, 4)) : null,
    }
    return ledger
  }
  if (url.includes('/rsu-tax/vest-close/')) return demoVestClose(url, today)
  if (url.includes('/rsu-tax/schedule-fa')) {
    const year = Number(params.year)
    return demoSchedule(Number.isInteger(year) ? year : Number(today.slice(0, 4)) - 1, today)
  }
  if (url.includes('/rsu-tax/fast-ds')) return demoFastDs(today)
  return []
}
