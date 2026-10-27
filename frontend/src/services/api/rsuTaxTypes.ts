/**
 * Shapes of `/api/rsu-tax`. Every figure is a computation aid for an Indian
 * return, not tax advice. Rupee amounts are always INR, whatever the display
 * currency, because the return is filed in rupees. Sale and dividend amounts
 * are in the stock's own trading currency.
 */

export type FxSource = 'ecb' | 'sbi_ttbr' | 'employer'

/** How one saved vest's perquisite becomes rupees. */
export interface VestFx {
  vesting_id: string
  fx_source: FxSource
  /** Rupees per one unit of `quote_currency`. */
  fx_rate: number | null
  fx_date: string | null
  /** Fair market value per share on the vest date, in `quote_currency`. */
  quote_price: number | null
  quote_currency: string
  /** The employer's perquisite for the whole gross vest, in rupees. */
  employer_perquisite_inr: number | null
  updated_at: string
}

export interface VestFxInput {
  quote_price: number | null
  quote_currency?: string
  fx_rate: number | null
  fx_date: string | null
  employer_perquisite_inr: number | null
}

/** The real close on or just before a vest date, with any later split undone. */
export interface VestClose {
  symbol: string
  currency: string
  price: number
  as_of: string
  /** Yahoo's figure for that day, on today's share count. */
  adjusted_price: number
  /** Shares today per share on `as_of`: 20 after one later 20-for-1 split. */
  split_factor: number
}

export type ForeignAssetEventKind = 'sale' | 'dividend'

/** Why a sale or dividend reaches no Schedule FA row. */
export type ForeignAssetEventIssue = 'unlinked' | 'before_vest' | 'unknown_stock' | 'no_shares_held' | 'indian_stock'

export interface ForeignAssetEvent {
  id: number
  kind: ForeignAssetEventKind
  /** The vest a sale came from; null for dividends and for sales whose vest was deleted. */
  lot_id: string | null
  symbol: string
  event_date: string
  /** Shares sold, as the broker shows them on the sale date. */
  quantity: number | null
  gross_amount: number
  tax_withheld: number | null
  /** The stock's trading currency, once its prices have loaded. */
  currency: string | null
  fx_rate: number | null
  fx_date: string | null
  /** Only when a rate was entered; the reports fill an ECB approximation. */
  amount_inr: number | null
  notes: string | null
  issue: ForeignAssetEventIssue | null
}

export interface ForeignAssetEventInput {
  kind: ForeignAssetEventKind
  lot_id?: string | null
  symbol?: string | null
  event_date: string
  quantity?: number | null
  gross_amount: number
  tax_withheld?: number | null
  fx_rate?: number | null
  fx_date?: string | null
  notes?: string | null
}

/** A sale moves to another vest; a dividend to another of the user's stocks. */
export type ForeignAssetEventLink = { lot_id: string } | { symbol: string }

export interface StockSplit {
  ex_date: string
  /** "20:1" for a 20-for-1 split. */
  ratio: string
}

export interface ForeignAssetLot {
  lot_id: string
  grant_id: string
  symbol: string
  currency: string | null
  acquired_on: string
  /** Counts at the vest: the gross vest and the units received after tax. */
  gross_quantity: number
  held_quantity: number
  quantity_estimated: boolean
  /** Counts on today's share count, after any split since the vest. */
  sold_quantity: number
  remaining_quantity: number
  /** Shares today per share at the vest. */
  split_factor: number
  splits: StockSplit[]
  fx_source: FxSource
  tax_value_inr: number | null
  ecb_value_inr: number | null
  difference_inr: number | null
  /** Per share at the vest. */
  cost_per_share_inr: number | null
  initial_value_inr: number | null
  conversion_rule: string
  specified_date: string
  flags: string[]
}

export interface LotLedger {
  lots: ForeignAssetLot[]
  events: ForeignAssetEvent[]
  symbols: string[]
  first_year: number | null
  current_year: number
  warnings: string[]
}

/** One Schedule FA Table A3 row (foreign equity interest), in whole rupees. */
export interface ScheduleFaRow {
  lot_id: string
  symbol: string
  entity_name: string
  country: string
  nature: string
  currency: string
  acquired_on: string
  shares_at_start: number
  shares_at_end: number
  fx_source: FxSource
  initial_value_inr: number | null
  peak_value_inr: number | null
  peak_value_quote: number | null
  peak_date: string | null
  peak_rate: number | null
  closing_value_inr: number | null
  closing_value_quote: number | null
  closing_price_date: string | null
  closing_rate: number | null
  dividends_inr: number
  dividends_quote: number
  tax_withheld_inr: number
  tax_withheld_quote: number
  sale_proceeds_inr: number
  sale_proceeds_quote: number
  flags: string[]
}

export interface ScheduleFaReport {
  calendar_year: number
  period_start: string
  period_end: string
  in_progress: boolean
  return_label: string
  rate_basis: string
  rows: ScheduleFaRow[]
  totals: {
    initial_value_inr: number
    closing_value_inr: number
    dividends_inr: number
    tax_withheld_inr: number
    sale_proceeds_inr: number
  }
  warnings: string[]
}

export interface FastDsRow {
  lot_id: string
  symbol: string
  currency: string
  acquired_on: string
  shares: number
  cost_inr: number | null
  quote_date: string | null
  average_quote: number | null
  market_value_quote: number | null
  rate: number | null
  rate_date: string | null
  market_value_inr: number | null
  value_inr: number | null
  basis: 'cost' | 'market' | null
  flags: string[]
}

export interface FastDsReport {
  valuation_date: string
  deadline: string
  /** Zero on the deadline day itself, negative once it has passed. */
  days_left: number
  rate_basis: string
  rows: FastDsRow[]
  total_value_inr: number
  complete: boolean
  warnings: string[]
}
