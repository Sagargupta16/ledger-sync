/**
 * GST Calculator - Estimates indirect tax (GST) paid on expenses
 *
 * Applies assumed GST rates per expense category to back-calculate
 * the GST component from consumer (inclusive) prices.
 *
 * Formula: GST = amount × rate / (100 + rate)
 * (Consumer prices in India are GST-inclusive)
 */

import { getFYFromDate } from './taxCalculator'
import type { Transaction } from '@/types'

// ────────────────────────────────────────────
// GST Slab Rates (India) — date-aware (GST 2.0)
// ────────────────────────────────────────────

/**
 * GST 2.0 (56th GST Council, effective 2025-09-22) collapsed the slab
 * structure: the 12% and 28% slabs were BOTH removed, a 40% de-merit rate was
 * added for luxury/sin goods, and many former-12% items split between 5% and
 * 18%. FY 2025-26 straddles this cutover, so we pick the rate table by the
 * transaction date rather than applying one flat set — the same per-period
 * approach used in tax-config/.
 */
export const GST_2_0_EFFECTIVE_DATE = '2025-09-22'

/** Slab set in force on or after 2025-09-22 (GST 2.0). */
export const GST_SLABS_CURRENT = [0, 3, 5, 18, 40] as const
/** Slab set in force before 2025-09-22 (pre-GST 2.0). */
export const GST_SLABS_LEGACY = [0, 3, 5, 12, 18, 28] as const

/** Back-compat export — the CURRENT (GST 2.0) slab set. */
export const GST_SLABS = GST_SLABS_CURRENT

/**
 * Default GST rates by category — CURRENT (GST 2.0, effective 2025-09-22).
 *
 * Slabs: 0%, 5%, 18%, 40% (12% and 28% removed); 3% special rate for
 * gold/jewellery. 40% is the luxury/sin-goods de-merit rate.
 *
 * - Restaurants: 5% (no ITC); cabs/autos 5%
 * - Electronics/ACs/TVs: 18% (moved down from 28%)
 * - Individual health & life insurance: Nil (0%) since GST 2.0
 * - Electricity & municipal water: GST-exempt (state electricity duty applies)
 * - Petrol/diesel: outside GST; residential rent: exempt; transfers: 0%
 */
export const DEFAULT_GST_RATES: Record<string, number> = {
  // ── 0% — Exempt / Not a purchase / Not under GST ──────────────
  'Family': 0,               // money transfers to family
  'Friends': 0,              // money transfers to friends
  'Charity': 0,              // donations (no GST on charity)
  'Donations': 0,
  'Religious Offerings': 0,
  'Rent': 0,                 // residential rent is GST-exempt
  'Domestic Help': 0,        // unorganized sector, no GST
  'EMI': 0,
  'Loan Repayment': 0,
  'Cash Withdrawal': 0,
  'ATM Withdrawal': 0,
  'Fuel': 0,                 // petrol/diesel not under GST
  'Petrol': 0,
  'Diesel': 0,
  'Investment Charges & Loss': 0, // brokerage via STT, not GST
  'Bank Fees': 0,            // already subject to 18% but negligible
  'Electricity': 0,          // electricity is OUTSIDE GST (HSN 2716 exempt; state electricity duty applies)
  'Water': 0,                // municipal/piped drinking water (HSN 2201) is GST-exempt
  'Insurance': 0,            // individual health & life insurance: Nil since GST 2.0
  'Utilities': 0,            // electricity & water exempt; only piped gas/LPG carries GST
  'Bills': 0,

  // ── 3% — Gold / Precious metals ───────────────────────────────
  'Jewellery': 3,
  'Jewelry': 3,
  'Gold': 3,
  'Silver': 3,

  // ── 5% — Food, transport, essentials, everyday apparel ────────
  'Food & Dining': 5,        // restaurants 5% since Jan 2019
  'Restaurants': 5,
  'Dining': 5,
  'Dining Out': 5,
  'Delivery Apps': 5,        // Swiggy/Zomato: 5% GST
  'Food': 5,
  'Groceries': 5,            // packaged foods 5%; fresh 0% (avg ~5%)
  'Snacks & Beverages': 5,
  'Transportation': 5,       // cab, auto, bus, train (economy)
  'Daily Commute': 5,
  'InterCity Travel': 5,
  'Cab': 5,
  'Auto': 5,
  'Bus': 5,
  'Train': 5,
  'Public Transport': 5,
  'Healthcare': 5,           // medicines mostly 5%, doctor 0-5%
  'Medical': 5,
  'Pharmacy': 5,
  'Medicine': 5,
  'Medicines & Supplements': 5,
  'Doctor Visits': 5,
  'LPG': 5,                  // domestic LPG / piped gas
  'Books & Supplies': 5,     // printed books: 0-5%
  // Everyday apparel <=Rs 2,500/pc moved to 5% under GST 2.0 (the >Rs 2,500
  // 18% edge isn't modellable from a category aggregate, so use 5%).
  'Personal Care': 5,
  'Clothing': 5,
  'Apparel': 5,
  'Fashion': 5,
  'Household Items': 5,      // utensils, many household goods moved to 5%
  'Grooming Products': 18,   // shampoo, soap, cosmetics stay 18%

  // ── 18% — Services, electronics, durables, maintenance ────────
  'Home Maintenance': 18,
  'Maintenance & Repairs': 18,
  'Gadgets & Accessories': 18, // phones/laptops/electronics: 18%
  'Electronics': 18,         // ACs/TVs/monitors moved 28% -> 18%
  'Devices': 18,
  'Accessories': 18,
  'Technology': 18,
  'Software': 18,
  'Entertainment & Recreations': 18,
  'Recharge': 18,            // mobile recharge: 18%
  'OTT Subscriptions': 18,
  'Movies & Events': 18,
  'Parties & Treats': 18,
  'Hobbies': 18,
  'Subscriptions': 18,
  'Streaming': 18,
  'Internet': 18,
  'Mobile Recharge': 18,
  'Telecom': 18,
  'Education': 18,           // coaching/courses: 18% (school: 0%)
  'Courses & Workshops': 18,
  'Exam Fees': 18,
  'Haircut & Grooming': 18,  // salon services: 18%
  'Salon': 18,
  'Beauty': 18,
  'Fitness': 18,             // gym membership: 18%
  'Gym': 18,
  'Home Decor': 18,
  'Furniture': 18,
  'Travel': 18,              // hotels/flights: 12-18% (avg 18%)
  'Hotel': 18,
  'Accommodation': 18,
  'Flight': 18,
  'Air Travel': 18,
  'Professional Services': 18,
  'Office Supplies': 18,
  'Shopping': 18,
  'Miscellaneous': 18,       // default for unclassified
  'Software Subscriptions': 18,
  'Gifts': 18,
  'General': 18,
  'Other': 18,

  // ── 40% — Luxury / sin goods (GST 2.0 de-merit rate) ──────────
  'Luxury': 40,
  'Aerated Drinks': 40,
  'Tobacco': 40,
  'Gaming': 40,              // online gaming/betting
  'Gambling': 40,
  'Casino': 40,
}

/**
 * LEGACY rates — in force BEFORE 2025-09-22 (pre-GST 2.0). Differs from the
 * current table where GST 2.0 changed a rate: insurance 18%, electricity/water
 * 5% (as previously modelled), apparel/household 18%, luxury/sin 28%.
 */
export const DEFAULT_GST_RATES_LEGACY: Record<string, number> = {
  ...DEFAULT_GST_RATES,
  'Insurance': 18,
  'Electricity': 5,
  'Water': 5,
  'Utilities': 5,
  'Bills': 5,
  'Personal Care': 18,
  'Clothing': 18,
  'Apparel': 18,
  'Fashion': 18,
  'Household Items': 18,
  'Luxury': 28,
  'Aerated Drinks': 28,
  'Tobacco': 28,
  'Gaming': 28,
  'Gambling': 28,
  'Casino': 28,
}

/** Default rate for categories not in the mapping */
const DEFAULT_UNMAPPED_RATE = 18

/** Pick the rate table + slab set in force for a given transaction date. */
export function getRateTableForDate(dateStr: string): {
  rates: Record<string, number>
  slabs: readonly number[]
} {
  const isPostReform = dateStr.slice(0, 10) >= GST_2_0_EFFECTIVE_DATE
  return isPostReform
    ? { rates: DEFAULT_GST_RATES, slabs: GST_SLABS_CURRENT }
    : { rates: DEFAULT_GST_RATES_LEGACY, slabs: GST_SLABS_LEGACY }
}

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

// ────────────────────────────────────────────
// Core Functions
// ────────────────────────────────────────────

/**
 * Get the GST rate for a label (case-insensitive fuzzy match).
 * Tries exact match first, then partial match against known categories.
 */
function matchRate(
  label: string,
  rates: Record<string, number>,
): number | null {
  const lower = label.toLowerCase()

  // Exact match (case-insensitive)
  for (const [key, rate] of Object.entries(rates)) {
    if (key.toLowerCase() === lower) return rate
  }

  // Partial match — label contains a known keyword or vice versa
  for (const [key, rate] of Object.entries(rates)) {
    if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) {
      return rate
    }
  }

  return null
}

/**
 * Get the GST rate for a transaction.
 * Tries subcategory first (more specific), then category, then default.
 *
 * `forDate` selects the GST 2.0 vs legacy rate table (ignored when customRates
 * is supplied). Defaults to the current (post-reform) table.
 */
export function getGSTRate(
  category: string,
  subcategory?: string,
  customRates?: Record<string, number>,
  forDate?: string,
): number {
  const rates = customRates ?? (forDate ? getRateTableForDate(forDate).rates : DEFAULT_GST_RATES)

  // Try subcategory first (e.g. "Rent" under "Housing" → 0%)
  if (subcategory) {
    const subRate = matchRate(subcategory, rates)
    if (subRate !== null) return subRate
  }

  // Fall back to category
  const catRate = matchRate(category, rates)
  if (catRate !== null) return catRate

  return DEFAULT_UNMAPPED_RATE
}

/**
 * Calculate GST from a GST-inclusive amount.
 * GST = amount × rate / (100 + rate)
 */
export function calculateGSTFromInclusive(amount: number, ratePercent: number): number {
  if (ratePercent <= 0) return 0
  return (amount * ratePercent) / (100 + ratePercent)
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
  const categoryMap = new Map<string, { spending: number; count: number; rate: number; parent: string }>()
  const monthMap = new Map<string, { spending: number; gst: number }>()

  for (const tx of expenses) {
    const cat = tx.category || 'Uncategorized'
    const sub = tx.subcategory
    const label = sub || cat
    // Date-aware: a transaction before 2025-09-22 uses the legacy slab table,
    // on/after uses GST 2.0. customRates (if any) override both.
    const rate = getGSTRate(cat, sub, customRates, tx.date)

    const existing = categoryMap.get(label) ?? { spending: 0, count: 0, rate, parent: cat }
    existing.spending += tx.amount
    existing.count += 1
    categoryMap.set(label, existing)

    // Monthly aggregation
    const monthKey = tx.date.substring(0, 7) // "YYYY-MM"
    const monthEntry = monthMap.get(monthKey) ?? { spending: 0, gst: 0 }
    monthEntry.spending += tx.amount
    monthEntry.gst += calculateGSTFromInclusive(tx.amount, rate)
    monthMap.set(monthKey, monthEntry)
  }

  // Build category breakdown
  const categoryBreakdown: GSTCategoryBreakdown[] = []
  let totalSpending = 0
  let totalGST = 0

  for (const [category, data] of categoryMap) {
    const rate = data.rate
    const gst = calculateGSTFromInclusive(data.spending, rate)
    categoryBreakdown.push({
      category,
      parentCategory: data.parent,
      spending: data.spending,
      gstRate: rate,
      gstAmount: gst,
      transactionCount: data.count,
    })
    totalSpending += data.spending
    totalGST += gst
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
