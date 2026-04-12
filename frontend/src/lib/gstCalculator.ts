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
// GST Slab Rates (India)
// ────────────────────────────────────────────

export const GST_SLABS = [0, 3, 5, 18, 28] as const

/**
 * Default GST rates by common expense category.
 *
 * Slabs: 0%, 5%, 18%, 28% (post GST 2.0 reform, 12% merged into 18%).
 * 3% is a special rate for gold/jewellery only.
 *
 * - Restaurants: 5% (all restaurants since Jan 2019, no ITC)
 * - Cab/auto rides: 5% (Ola, Uber, etc.)
 * - Clothing, electronics, services: 18%
 * - Gold/jewellery: 3% (special rate)
 * - Petrol/diesel: NOT under GST (excise + VAT)
 * - Residential rent: Exempt
 * - Family/friend transfers: Not a purchase — 0%
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

  // ── 3% — Gold / Precious metals ───────────────────────────────
  'Jewellery': 3,
  'Jewelry': 3,
  'Gold': 3,
  'Silver': 3,

  // ── 5% — Food, transport, essential goods ─────────────────────
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
  'LPG': 5,                  // domestic LPG
  'Electricity': 5,          // domestic electricity ~5%
  'Water': 5,

  // ── 18% — Clothing, household, maintenance (post 12% merger) ───
  'Personal Care': 18,       // clothing + grooming services
  'Clothing': 18,
  'Apparel': 18,
  'Fashion': 18,
  'Grooming Products': 18,   // shampoo, soap, cosmetics
  'Household Items': 18,     // kitchenware, cleaning supplies
  'Home Maintenance': 18,
  'Maintenance & Repairs': 18,

  // ── 5% — Utilities (electricity, water, gas) ─────────────────
  'Utilities': 5,
  'Bills': 5,

  // ── 18% — Services, electronics, subscriptions ────────────────
  'Gadgets & Accessories': 18, // phones/laptops/electronics: 18%
  'Electronics': 18,
  'Devices': 18,
  'Accessories': 18,
  'Technology': 18,
  'Software': 18,
  'Entertainment & Recreations': 18, // OTT 18%, movies 12-18%
  'Recharge': 18,            // mobile recharge: 18%
  'OTT Subscriptions': 18,
  'Movies & Events': 18,     // cinema tickets: 12-18% (avg 18%)
  'Parties & Treats': 18,
  'Hobbies': 18,
  'Subscriptions': 18,
  'Streaming': 18,
  'Internet': 18,
  'Mobile Recharge': 18,
  'Telecom': 18,
  'Insurance': 18,           // health/life insurance: 18%
  'Education': 18,           // coaching/courses: 18% (school: 0%)
  'Courses & Workshops': 18,
  'Exam Fees': 18,
  'Books & Supplies': 5,     // printed books: 0-5%
  'Haircut & Grooming': 18,  // salon services: 18%
  'Salon': 18,
  'Beauty': 18,
  'Fitness': 18,             // gym membership: 18%
  'Gym': 18,
  'Home Decor': 18,
  'Furniture': 18,
  'Travel': 18,              // business flights 12%, hotels 12-18%
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

  // ── 28% — Luxury / sin goods ──────────────────────────────────
  'Luxury': 28,
  'Aerated Drinks': 28,
  'Tobacco': 28,
  'Gaming': 28,              // online gaming/betting: 28%
  'Gambling': 28,
  'Casino': 28,
}

/** Default rate for categories not in the mapping */
const DEFAULT_UNMAPPED_RATE = 18

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
 */
export function getGSTRate(
  category: string,
  subcategory?: string,
  customRates?: Record<string, number>,
): number {
  const rates = customRates ?? DEFAULT_GST_RATES

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
    const rate = getGSTRate(cat, sub, customRates)

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

  // Build slab breakdown
  const slabMap = new Map<number, { spending: number; gst: number; categories: number }>()
  for (const slab of GST_SLABS) {
    slabMap.set(slab, { spending: 0, gst: 0, categories: 0 })
  }
  for (const cat of categoryBreakdown) {
    const nearestSlab = GST_SLABS.reduce((prev, curr) =>
      Math.abs(curr - cat.gstRate) < Math.abs(prev - cat.gstRate) ? curr : prev,
    )
    const entry = slabMap.get(nearestSlab)
    if (entry) {
      entry.spending += cat.spending
      entry.gst += cat.gstAmount
      entry.categories += 1
    }
  }

  const slabBreakdown: GSTSlabBreakdown[] = GST_SLABS.map((slab) => {
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
