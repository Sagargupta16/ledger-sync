import type { Transaction } from '@/types'
import type { SavedView } from '@/services/api/savedViews'
import type {
  WatchMeasure,
  WatchPeriod,
  WatchTile,
  WatchTilesResponse,
} from '@/services/api/watchTiles'
import { addMonthsToMonthKey, daysInMonth, getTodayKey } from '@/lib/dateUtils'

import { generateDemoSavedViews } from './demoAccountReads'
import { sum } from './demoHelpers'
import { filterDemoTransactions } from './demoTxFilters'

/**
 * Demo answer for `GET /api/saved-views/tiles`.
 *
 * Demo mode blocks every write, so pins cannot be made there; instead the demo
 * saved views are shown as already pinned, in this order. Each tile filters the
 * demo ledger with `filterDemoTransactions`, the predicate behind the demo
 * Transactions table, so a demo tile sums exactly what its view lists.
 */
const DEMO_PINNED_VIEW_IDS = [3, 2, 1]
const DEMO_MAX_PINS = 8
const TREND_MONTHS = 6

const MEASURE_TYPES: Record<WatchMeasure, Transaction['type']> = {
  expense: 'Expense',
  income: 'Income',
  transfer: 'Transfer',
}

const round = (value: number, digits: number) => Number(value.toFixed(digits))

/** The backend's `tile_period`: the same days of last month clamp to its length. */
function demoWatchPeriod(today: string): WatchPeriod {
  const month = today.slice(0, 7)
  const previous = addMonthsToMonthKey(month, -1)
  const sameDay = Math.min(Number(today.slice(8, 10)), daysInMonth(previous))
  return {
    today,
    month_start: `${month}-01`,
    previous_start: `${previous}-01`,
    previous_end: `${previous}-${String(sameDay).padStart(2, '0')}`,
    trend_months: Array.from({ length: TREND_MONTHS }, (_, i) =>
      addMonthsToMonthKey(month, i - TREND_MONTHS)),
  }
}

/** A view's type filter names its measure; no type filter means spending. */
function measureOf(type: unknown): WatchMeasure {
  const lower = typeof type === 'string' ? type.toLowerCase() : ''
  return lower === 'income' || lower === 'transfer' ? lower : 'expense'
}

const total = (rows: Transaction[]) => round(sum(rows.map((t) => t.amount)), 2)

function demoTile(txs: Transaction[], view: SavedView, position: number, period: WatchPeriod): WatchTile {
  const measure = measureOf(view.filters.type)
  const listed = filterDemoTransactions(txs, view.filters)
  const rows = listed.filter((t) => t.type === MEASURE_TYPES[measure])
  const between = (from: string, to: string) => rows.filter((t) => t.date >= from && t.date <= to)
  // Demo rows can be dated later this month; month to date stops at today.
  const monthRows = between(period.month_start, period.today)
  const monthToDate = total(monthRows)
  const previous = total(between(period.previous_start, period.previous_end))
  const windowStart = `${period.trend_months[0]}-01`
  return {
    view_id: view.id,
    name: view.name,
    position,
    measure,
    filters_valid: true,
    has_date_range: Boolean(view.filters.start_date || view.filters.end_date),
    // As on the backend: an untyped view that also lists income or transfers in these months.
    other_types_present: !view.filters.type && listed.some(
      (t) => t.type !== MEASURE_TYPES[measure] && t.date >= windowStart && t.date <= period.today),
    month_to_date: monthToDate,
    previous_same_period: previous,
    change_pct: previous === 0 ? null : round(((monthToDate - previous) / previous) * 100, 1),
    transaction_count: monthRows.length,
    trend: period.trend_months.map((month) => ({
      month,
      amount: total(rows.filter((t) => t.date.startsWith(month))),
    })),
  }
}

export function generateDemoWatchTiles(txs: Transaction[]): WatchTilesResponse {
  const period = demoWatchPeriod(getTodayKey())
  const views = generateDemoSavedViews()
  const tiles = DEMO_PINNED_VIEW_IDS.flatMap((id) => {
    const view = views.find((candidate) => candidate.id === id)
    return view ? [view] : []
  }).map((view, position) => demoTile(txs, view, position, period))
  return { period, tiles, suggestions: [], suggestions_month: null, max_pins: DEMO_MAX_PINS }
}
