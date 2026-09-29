/**
 * GST Calculator - Estimates indirect tax (GST) paid on expenses
 *
 * Applies assumed GST rates per expense category to back-calculate
 * the GST component from consumer (inclusive) prices.
 *
 * Formula: GST = amount × rate / (100 + rate)
 * (Consumer prices in India are GST-inclusive)
 */

import { getFYFromDate } from './dateUtils'
import { GST_SLABS_CURRENT, GST_SLABS_LEGACY } from './gstRates'
import { calculateGSTFromInclusive, getGSTRate } from './gstRateLookup'
import type { Transaction } from '@/types'

// Rate tables and rate lookup live in sibling modules; re-exported so every
// importer keeps a single `@/lib/gstCalculator` entry point.
export {
  DEFAULT_GST_RATES,
  DEFAULT_GST_RATES_LEGACY,
  GST_2_0_EFFECTIVE_DATE,
  GST_SLABS,
  GST_SLABS_CURRENT,
  GST_SLABS_LEGACY,
  getRateTableForDate,
} from './gstRates'
export { calculateGSTFromInclusive, getGSTRate } from './gstRateLookup'

// ────────────────────────────────────────────
// Types
// ────────────────────────────────────────────

export interface GSTCategoryBreakdown {
  category: string
  parentCategory: string
  spending: number
  gstRate: number
  gstAmount: number
  transactionCount: number
}

export interface GSTSlabBreakdown {
  slab: number
  spending: number
  gstAmount: number
  categoryCount: number
}

export interface GSTMonthlyTrend {
  month: string       // "YYYY-MM"
  monthLabel: string   // "Apr '25"
  spending: number
  gstAmount: number
}

export interface GSTSummary {
  totalSpending: number
  totalGST: number
  effectiveRate: number
  categoryBreakdown: GSTCategoryBreakdown[]
  slabBreakdown: GSTSlabBreakdown[]
  monthlyTrend: GSTMonthlyTrend[]
}

/**
 * Compute full GST analysis for a set of expense transactions in a given FY.
 */
export function computeGSTAnalysis(
  transactions: Transaction[],
  selectedFY: string,
  fiscalYearStartMonth: number,
  customRates?: Record<string, number>,
): GSTSummary {
  // Filter to expenses in the selected FY
  const expenses = transactions.filter((tx) => {
    if (tx.type !== 'Expense') return false
    const fy = getFYFromDate(tx.date, fiscalYearStartMonth)
    return fy === selectedFY
  })

  // Aggregate by subcategory (more granular GST rates) or category as fallback.
  // Label = subcategory when available, else category.
  // GST is accumulated PER TRANSACTION (each with its own date-correct rate),
  // not recomputed from the category total with a single rate -- a category
  // spanning the 2025-09-22 GST 2.0 cutover has transactions under two
  // different slab tables, and collapsing them to one rate mis-states the FY
  // total (measured ~3.8% understatement on real data).
  const categoryMap = new Map<
    string,
    { spending: number; count: number; gst: number; parent: string }
  >()
  const monthMap = new Map<string, { spending: number; gst: number }>()

  for (const tx of expenses) {
    const cat = tx.category || 'Uncategorized'
    const sub = tx.subcategory
    const label = sub || cat
    // Date-aware: a transaction before 2025-09-22 uses the legacy slab table,
    // on/after uses GST 2.0. customRates (if any) override both.
    const rate = getGSTRate(cat, sub, customRates, tx.date)
    const txGst = calculateGSTFromInclusive(tx.amount, rate)

    const existing = categoryMap.get(label) ?? { spending: 0, count: 0, gst: 0, parent: cat }
    existing.spending += tx.amount
    existing.count += 1
    existing.gst += txGst
    categoryMap.set(label, existing)

    // Monthly aggregation
    const monthKey = tx.date.substring(0, 7) // "YYYY-MM"
    const monthEntry = monthMap.get(monthKey) ?? { spending: 0, gst: 0 }
    monthEntry.spending += tx.amount
    monthEntry.gst += txGst
    monthMap.set(monthKey, monthEntry)
  }

  // Build category breakdown
  const categoryBreakdown: GSTCategoryBreakdown[] = []
  let totalSpending = 0
  let totalGST = 0

  for (const [category, data] of categoryMap) {
    // Effective inclusive rate implied by the exact per-transaction GST:
    // gst = spending * r / (100 + r)  =>  r = 100 * gst / (spending - gst).
    // For a category entirely within one slab table this recovers the slab
    // rate exactly; cross-cutover categories get the true blended rate.
    const effectiveRate =
      data.spending - data.gst > 0 ? (100 * data.gst) / (data.spending - data.gst) : 0
    // Snap to the slab integer when within float noise so slab-keyed UI
    // colors keep matching; keep one decimal for genuinely blended rates.
    const snapped = Math.abs(effectiveRate - Math.round(effectiveRate)) < 0.005
      ? Math.round(effectiveRate)
      : Math.round(effectiveRate * 10) / 10
    categoryBreakdown.push({
      category,
      parentCategory: data.parent,
      spending: data.spending,
      gstRate: snapped,
      gstAmount: data.gst,
      transactionCount: data.count,
    })
    totalSpending += data.spending
    totalGST += data.gst
  }

  // Sort by GST amount descending
  categoryBreakdown.sort((a, b) => b.gstAmount - a.gstAmount)

  // Build slab breakdown. An FY can straddle the GST 2.0 cutover, so a single
  // analysis may legitimately contain both legacy (12/28%) and current (40%)
  // rates. Bucket on the union of both slab sets so each rate lands on its own
  // slab instead of snapping a 28% rate onto the nearest current slab.
  const ALL_SLABS = [...new Set([...GST_SLABS_LEGACY, ...GST_SLABS_CURRENT])].sort((a, b) => a - b)
  const slabMap = new Map<number, { spending: number; gst: number; categories: number }>()
  for (const slab of ALL_SLABS) {
    slabMap.set(slab, { spending: 0, gst: 0, categories: 0 })
  }
  for (const cat of categoryBreakdown) {
    // ALL_SLABS is always non-empty (built from the constant slab sets), but
    // seed reduce() with its first element so it never depends on that and an
    // empty array can't throw.
    const nearestSlab = ALL_SLABS.reduce(
      (prev, curr) => (Math.abs(curr - cat.gstRate) < Math.abs(prev - cat.gstRate) ? curr : prev),
      ALL_SLABS[0],
    )
    const entry = slabMap.get(nearestSlab)
    if (entry) {
      entry.spending += cat.spending
      entry.gst += cat.gstAmount
      entry.categories += 1
    }
  }

  const slabBreakdown: GSTSlabBreakdown[] = ALL_SLABS.map((slab) => {
    const data = slabMap.get(slab)
    return {
      slab,
      spending: data?.spending ?? 0,
      gstAmount: data?.gst ?? 0,
      categoryCount: data?.categories ?? 0,
    }
  }).filter((s) => s.spending > 0)

  // Build monthly trend (sorted chronologically)
  const monthlyTrend: GSTMonthlyTrend[] = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => {
      const [year, m] = month.split('-')
      const date = new Date(Number(year), Number(m) - 1)
      return {
        month,
        monthLabel: date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        spending: data.spending,
        gstAmount: data.gst,
      }
    })

  const effectiveRate = totalSpending > 0 ? (totalGST / totalSpending) * 100 : 0

  return {
    totalSpending,
    totalGST,
    effectiveRate,
    categoryBreakdown,
    slabBreakdown,
    monthlyTrend,
  }
}

/**
 * Get all unique FYs from expense transactions, sorted descending.
 */
export function getExpenseFYs(
  transactions: Transaction[],
  fiscalYearStartMonth: number,
): string[] {
  const fys = new Set<string>()
  for (const tx of transactions) {
    if (tx.type === 'Expense') {
      fys.add(getFYFromDate(tx.date, fiscalYearStartMonth))
    }
  }
  return Array.from(fys).sort((a, b) => b.localeCompare(a))
}
