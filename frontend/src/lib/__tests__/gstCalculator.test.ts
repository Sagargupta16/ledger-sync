import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GST_RATES,
  DEFAULT_GST_RATES_LEGACY,
  GST_SLABS,
  GST_SLABS_CURRENT,
  GST_SLABS_LEGACY,
  calculateGSTFromInclusive,
  computeGSTAnalysis,
  getExpenseFYs,
  getGSTRate,
  getRateTableForDate,
} from '../gstCalculator'
import type { Transaction } from '@/types'

const expense = (overrides: Partial<Transaction>): Transaction => ({
  id: 'tx',
  date: '2025-06-15',
  amount: 1000,
  type: 'Expense',
  category: 'Shopping',
  account: 'HDFC',
  ...overrides,
})

describe('GST_SLABS', () => {
  it('current (GST 2.0) slabs drop 12/28 and add 40', () => {
    expect(GST_SLABS_CURRENT).toEqual([0, 3, 5, 18, 40])
    expect(GST_SLABS).toEqual([0, 3, 5, 18, 40]) // back-compat export = current
  })

  it('legacy (pre-2025-09-22) slabs keep 12 and 28', () => {
    expect(GST_SLABS_LEGACY).toEqual([0, 3, 5, 12, 18, 28])
  })
})

describe('DEFAULT_GST_RATES (GST 2.0, current)', () => {
  it('maps known categories to their current slabs', () => {
    expect(DEFAULT_GST_RATES['Restaurants']).toBe(5)
    expect(DEFAULT_GST_RATES['Jewellery']).toBe(3)
    expect(DEFAULT_GST_RATES['Rent']).toBe(0)
  })

  it('reflects GST 2.0 changes: luxury 40, insurance/electricity/water exempt, apparel 5', () => {
    expect(DEFAULT_GST_RATES['Luxury']).toBe(40)
    expect(DEFAULT_GST_RATES['Tobacco']).toBe(40)
    expect(DEFAULT_GST_RATES['Insurance']).toBe(0)
    expect(DEFAULT_GST_RATES['Electricity']).toBe(0)
    expect(DEFAULT_GST_RATES['Water']).toBe(0)
    expect(DEFAULT_GST_RATES['Clothing']).toBe(5)
  })

  it('legacy table keeps the pre-reform rates', () => {
    expect(DEFAULT_GST_RATES_LEGACY['Luxury']).toBe(28)
    expect(DEFAULT_GST_RATES_LEGACY['Insurance']).toBe(18)
    expect(DEFAULT_GST_RATES_LEGACY['Electricity']).toBe(5)
    expect(DEFAULT_GST_RATES_LEGACY['Clothing']).toBe(18)
  })
})

describe('getRateTableForDate (GST 2.0 cutover)', () => {
  it('uses legacy rates before 2025-09-22', () => {
    expect(getRateTableForDate('2025-09-21').rates['Luxury']).toBe(28)
  })
  it('uses GST 2.0 rates on/after 2025-09-22', () => {
    expect(getRateTableForDate('2025-09-22').rates['Luxury']).toBe(40)
    expect(getRateTableForDate('2026-01-01').rates['Insurance']).toBe(0)
  })
})

describe('getGSTRate date-awareness', () => {
  it('returns the legacy luxury rate for a pre-reform date', () => {
    expect(getGSTRate('Luxury', undefined, undefined, '2025-06-15')).toBe(28)
  })
  it('returns the GST 2.0 luxury rate for a post-reform date', () => {
    expect(getGSTRate('Luxury', undefined, undefined, '2025-12-15')).toBe(40)
  })
  it('defaults to the current table when no date is given', () => {
    expect(getGSTRate('Luxury')).toBe(40)
  })
})

describe('calculateGSTFromInclusive', () => {
  it('returns 0 when rate is 0', () => {
    expect(calculateGSTFromInclusive(1000, 0)).toBe(0)
  })

  it('returns 0 when rate is negative', () => {
    expect(calculateGSTFromInclusive(1000, -5)).toBe(0)
  })

  it('extracts 180 GST from 1180 inclusive at 18%', () => {
    expect(calculateGSTFromInclusive(1180, 18)).toBeCloseTo(180, 10)
  })

  it('extracts the embedded GST at 28%', () => {
    // 1280 inclusive at 28% -> 1280 * 28 / 128 = 280
    expect(calculateGSTFromInclusive(1280, 28)).toBeCloseTo(280, 10)
  })

  it('extracts the embedded GST at 5%', () => {
    // 105 inclusive at 5% -> 105 * 5 / 105 = 5
    expect(calculateGSTFromInclusive(105, 5)).toBeCloseTo(5, 10)
  })

  it('does not crash and returns 0 for amount 0', () => {
    expect(calculateGSTFromInclusive(0, 18)).toBe(0)
  })
})

describe('getGSTRate', () => {
  it('returns the mapped rate for an exact category match', () => {
    expect(getGSTRate('Restaurants')).toBe(5)
  })

  it('is case-insensitive on exact match', () => {
    expect(getGSTRate('restaurants')).toBe(5)
    expect(getGSTRate('LUXURY')).toBe(40) // GST 2.0 luxury de-merit rate
  })

  it('returns the default 18 for a fully unmapped category', () => {
    // "Zzzzz" matches no key by exact nor substring
    expect(getGSTRate('Zzzzz')).toBe(18)
  })

  it('prefers the subcategory rate over the category rate', () => {
    // Rent (0%) under a Housing category (unmapped -> would be 18%)
    expect(getGSTRate('Housing', 'Rent')).toBe(0)
  })

  it('falls back to category when subcategory does not match', () => {
    expect(getGSTRate('Restaurants', 'Zzzzz')).toBe(5)
  })

  it('honors a customRates override and ignores the default map', () => {
    expect(getGSTRate('Restaurants', undefined, { Restaurants: 12 })).toBe(12)
    // not in custom map, no substring hit -> default 18
    expect(getGSTRate('Jewellery', undefined, { Restaurants: 12 })).toBe(18)
  })

  it('word-matches a longer label against a known keyword', () => {
    // "Fine Dining" contains the word "Dining" (5%)
    expect(getGSTRate('Fine Dining')).toBe(5)
    // "Air" appears as a word inside the "Air Travel" key (18%)
    expect(getGSTRate('Air')).toBe(18)
    // Multi-word key inside a longer label
    expect(getGSTRate('Public Transport Pass')).toBe(5)
  })

  it('does NOT match on raw substrings inside words (regression)', () => {
    // These were false positives under the old bidirectional substring
    // fallback: "Bus" ⊂ "Business" and "Train" ⊂ "Training" pulled 5%.
    // Word-boundary matching sends them to the correct fallback instead.
    // (Labels where a key IS a whole word, like "Gold Coin", still match --
    // that's intended.)
    expect(getGSTRate('Business Services')).toBe(18) // not the "Bus" 5% key
    expect(getGSTRate('Training')).toBe(18) // not the "Train" 5% key
    expect(getGSTRate('Automobile')).toBe(18) // not the "Auto" 5% key
    // "Go" is not a whole-word match for "Gold" -> default 18, not 3.
    expect(getGSTRate('Go')).toBe(18)
  })

  it("word-boundary still matches possessive-free word sequences", () => {
    // "Gold Coin Purchase" contains the word "Gold" -> 3%.
    expect(getGSTRate('Gold Coin Purchase')).toBe(3)
    // "Bus" as an exact standalone key still resolves.
    expect(getGSTRate('Bus')).toBe(5)
  })
})

describe('computeGSTAnalysis', () => {
  it('returns a zeroed/empty summary for no transactions', () => {
    const result = computeGSTAnalysis([], 'FY 2025-26', 4)
    expect(result.totalSpending).toBe(0)
    expect(result.totalGST).toBe(0)
    expect(result.effectiveRate).toBe(0)
    expect(result.categoryBreakdown).toEqual([])
    expect(result.slabBreakdown).toEqual([])
    expect(result.monthlyTrend).toEqual([])
  })

  it('ignores non-expense transactions and other fiscal years', () => {
    const txns: Transaction[] = [
      expense({ id: '1', date: '2025-06-15', category: 'Restaurants', amount: 1050 }),
      expense({ id: '2', type: 'Income', category: 'Salary', amount: 50000 }),
      expense({ id: '3', date: '2024-06-15', category: 'Restaurants', amount: 9999 }),
    ]
    const result = computeGSTAnalysis(txns, 'FY 2025-26', 4)
    expect(result.totalSpending).toBe(1050)
    expect(result.categoryBreakdown).toHaveLength(1)
  })

  it('aggregates totals, categories, slabs, and monthly trend', () => {
    const txns: Transaction[] = [
      // Restaurants 5%, two txns across two months
      expense({ id: '1', date: '2025-04-10', category: 'Restaurants', amount: 1050 }),
      expense({ id: '2', date: '2025-05-10', category: 'Restaurants', amount: 2100 }),
      // Electronics 18%, one txn
      expense({ id: '3', date: '2025-04-20', category: 'Electronics', amount: 1180 }),
    ]
    const result = computeGSTAnalysis(txns, 'FY 2025-26', 4)

    // Totals
    expect(result.totalSpending).toBe(4330)
    // Restaurants: (1050+2100)*5/105 = 150 ; Electronics: 1180*18/118 = 180
    expect(result.totalGST).toBeCloseTo(330, 6)
    expect(result.effectiveRate).toBeCloseTo((330 / 4330) * 100, 6)

    // Category breakdown: aggregated by label (category here, no subcategory)
    expect(result.categoryBreakdown).toHaveLength(2)
    const restaurants = result.categoryBreakdown.find((c) => c.category === 'Restaurants')!
    expect(restaurants.spending).toBe(3150)
    expect(restaurants.gstRate).toBe(5)
    expect(restaurants.gstAmount).toBeCloseTo(150, 6)
    expect(restaurants.transactionCount).toBe(2)
    // Sorted by GST amount descending -> Electronics (180) before Restaurants (150)
    expect(result.categoryBreakdown[0].category).toBe('Electronics')

    // Slab breakdown: only slabs with spending, exact rates land on their own slab
    const slab5 = result.slabBreakdown.find((s) => s.slab === 5)!
    const slab18 = result.slabBreakdown.find((s) => s.slab === 18)!
    expect(slab5.spending).toBe(3150)
    expect(slab5.categoryCount).toBe(1)
    expect(slab18.spending).toBe(1180)
    expect(result.slabBreakdown.find((s) => s.slab === 0)).toBeUndefined()

    // Monthly trend: two months, chronological
    expect(result.monthlyTrend.map((m) => m.month)).toEqual(['2025-04', '2025-05'])
    const april = result.monthlyTrend[0]
    // April spending: 1050 (rest) + 1180 (elec) = 2230 ; GST 50 + 180 = 230
    expect(april.spending).toBe(2230)
    expect(april.gstAmount).toBeCloseTo(230, 6)
  })

  it('aggregates by subcategory label when present', () => {
    const txns: Transaction[] = [
      expense({ id: '1', category: 'Housing', subcategory: 'Rent', amount: 20000 }),
      expense({ id: '2', category: 'Housing', subcategory: 'Furniture', amount: 1180 }),
    ]
    const result = computeGSTAnalysis(txns, 'FY 2025-26', 4)
    const rent = result.categoryBreakdown.find((c) => c.category === 'Rent')!
    expect(rent.gstRate).toBe(0)
    expect(rent.parentCategory).toBe('Housing')
    const furniture = result.categoryBreakdown.find((c) => c.category === 'Furniture')!
    expect(furniture.gstRate).toBe(18)
  })

  it('category spanning the 2025-09-22 cutover sums per-transaction GST, not one collapsed rate', () => {
    // Luxury: 28% before the cutover, 40% after. FY 2025-26 spans both.
    const preAmount = 1280 // inclusive of 28% -> GST = 1280*28/128 = 280
    const postAmount = 1400 // inclusive of 40% -> GST = 1400*40/140 = 400
    const txns: Transaction[] = [
      expense({ id: '1', date: '2025-06-15', category: 'Luxury', amount: preAmount }),
      expense({ id: '2', date: '2025-12-15', category: 'Luxury', amount: postAmount }),
    ]
    const result = computeGSTAnalysis(txns, 'FY 2025-26', 4)
    const luxury = result.categoryBreakdown.find((c) => c.category === 'Luxury')!
    // Exact per-transaction sum: 280 + 400 = 680. The old collapsed-rate path
    // rated the whole 2680 at one slab (28% -> 586.25 or 40% -> 765.71).
    expect(luxury.gstAmount).toBeCloseTo(680, 6)
    expect(result.totalGST).toBeCloseTo(680, 6)
    // Effective blended rate: 100*680/(2680-680) = 34%.
    expect(luxury.gstRate).toBeCloseTo(34, 1)
  })

  it('single-table category still reports its exact slab rate', () => {
    const txns: Transaction[] = [
      expense({ id: '1', date: '2025-12-01', category: 'Luxury', amount: 1400 }),
      expense({ id: '2', date: '2026-01-01', category: 'Luxury', amount: 2800 }),
    ]
    const result = computeGSTAnalysis(txns, 'FY 2025-26', 4)
    const luxury = result.categoryBreakdown.find((c) => c.category === 'Luxury')!
    expect(luxury.gstRate).toBe(40) // snapped back to the integer slab
    expect(luxury.gstAmount).toBeCloseTo((1400 * 40) / 140 + (2800 * 40) / 140, 6)
  })
})

describe('getExpenseFYs', () => {
  it('buckets transactions across the India FY boundary (March vs April)', () => {
    const txns: Transaction[] = [
      expense({ id: '1', date: '2025-03-31' }), // FY 2024-25 (March)
      expense({ id: '2', date: '2025-04-01' }), // FY 2025-26 (April)
    ]
    const fys = getExpenseFYs(txns, 4)
    expect(fys).toEqual(['FY 2025-26', 'FY 2024-25'])
  })

  it('ignores non-expense transactions', () => {
    const txns: Transaction[] = [
      expense({ id: '1', date: '2025-06-01', type: 'Income' }),
      expense({ id: '2', date: '2025-06-01', type: 'Transfer' }),
      expense({ id: '3', date: '2025-06-01' }),
    ]
    expect(getExpenseFYs(txns, 4)).toEqual(['FY 2025-26'])
  })

  it('returns an empty array when there are no expenses', () => {
    expect(getExpenseFYs([], 4)).toEqual([])
  })

  it('deduplicates and sorts FYs descending', () => {
    const txns: Transaction[] = [
      expense({ id: '1', date: '2023-06-01' }),
      expense({ id: '2', date: '2025-06-01' }),
      expense({ id: '3', date: '2024-06-01' }),
      expense({ id: '4', date: '2025-09-01' }),
    ]
    expect(getExpenseFYs(txns, 4)).toEqual(['FY 2025-26', 'FY 2024-25', 'FY 2023-24'])
  })
})
