import { describe, expect, it } from 'vitest'

import {
  PARETO_THRESHOLD,
  cadenceLabel,
  computeStats,
  countKinds,
  filterByKind,
  isPlaceholderLabel,
  paretoCut,
  toLabelKind,
  toSpendByLabel,
  usableMerchants,
} from '../merchantUtils'
import type { MerchantRow } from '../types'

function row(overrides: Partial<MerchantRow> & { merchant: string }): MerchantRow {
  return {
    label_kind: 'brand',
    aliases: [],
    category: 'Food & Dining',
    subcategory: null,
    total_spent: 1000,
    transaction_count: 4,
    avg_transaction: 250,
    first_transaction: '2026-01-01',
    last_transaction: '2026-04-01',
    months_active: 4,
    avg_days_between: 30,
    is_recurring: false,
    ...overrides,
  }
}

describe('isPlaceholderLabel', () => {
  it('rejects the placeholder notes the backend extractor also drops', () => {
    // Mirrors PLACEHOLDER_NOTES in core/analytics/merchant_extract.py. On the
    // real ledger "Unknown" was the single largest label by count.
    for (const label of ['Unknown', 'unknown', 'N/A', 'na', 'none', '-', '--', '?', 'Misc', 'Other']) {
      expect(isPlaceholderLabel(label)).toBe(true)
    }
  })

  it('ignores surrounding whitespace and case', () => {
    expect(isPlaceholderLabel('  UNKNOWN  ')).toBe(true)
  })

  it('keeps real payee names', () => {
    expect(isPlaceholderLabel('Uber')).toBe(false)
    expect(isPlaceholderLabel('Other Bank Transfer')).toBe(false)
  })
})

describe('usableMerchants', () => {
  it('drops placeholder, blank, zero-spend and zero-count rows', () => {
    const rows = [
      row({ merchant: 'Uber' }),
      row({ merchant: 'Unknown', total_spent: 116_644, transaction_count: 360 }),
      row({ merchant: '   ' }),
      row({ merchant: 'Zero Spend', total_spent: 0 }),
      row({ merchant: 'Zero Count', transaction_count: 0 }),
    ]
    expect(usableMerchants(rows).map((r) => r.merchant)).toEqual(['Uber'])
  })
})

describe('toLabelKind', () => {
  it('narrows only the two kinds the backend emits', () => {
    expect(toLabelKind('brand')).toBe('brand')
    expect(toLabelKind('descriptor')).toBe('descriptor')
    expect(toLabelKind('BRAND')).toBeNull()
    expect(toLabelKind(undefined)).toBeNull()
  })
})

describe('countKinds', () => {
  it('separates brands, descriptors and pre-classification rows', () => {
    const rows = [
      row({ merchant: 'Uber' }),
      row({ merchant: 'Apple' }),
      row({ merchant: 'Juice - Pineapple', label_kind: 'descriptor' }),
      row({ merchant: 'Legacy Row', label_kind: undefined }),
    ]
    expect(countKinds(rows)).toEqual({ brand: 2, descriptor: 1, unclassified: 1 })
  })
})

describe('filterByKind', () => {
  const rows = [
    row({ merchant: 'Uber' }),
    row({ merchant: 'Juice - Pineapple', label_kind: 'descriptor' }),
    row({ merchant: 'Legacy Row', label_kind: undefined }),
  ]

  it('passes everything through for "all"', () => {
    expect(filterByKind(rows, 'all')).toHaveLength(3)
  })

  it('returns only the requested kind', () => {
    expect(filterByKind(rows, 'brand').map((r) => r.merchant)).toEqual(['Uber'])
    expect(filterByKind(rows, 'descriptor').map((r) => r.merchant)).toEqual(['Juice - Pineapple'])
  })

  it('exposes pre-classification rows under their own filter', () => {
    // A rollup built before label_kind existed still has to be reachable -- but
    // as its own bucket, not smuggled into the other two.
    expect(filterByKind(rows, 'unclassified').map((r) => r.merchant)).toEqual(['Legacy Row'])
  })

  it('partitions the rows, so each chip count equals what the chip yields', () => {
    // The defect this replaces: on the real ledger all 39 payees were
    // unclassified, so the toggle read "All 39 / Brands 0 / Notes 0" and then
    // listed all 39 rows when Brands was pressed. Verified live in the browser
    // before the fix.
    const counts = countKinds(rows)
    expect(filterByKind(rows, 'brand')).toHaveLength(counts.brand)
    expect(filterByKind(rows, 'descriptor')).toHaveLength(counts.descriptor)
    expect(filterByKind(rows, 'unclassified')).toHaveLength(counts.unclassified)
    expect(counts.brand + counts.descriptor + counts.unclassified).toBe(rows.length)
  })

  it('yields nothing for a kind the ledger does not contain', () => {
    const brandsOnly = [row({ merchant: 'Uber' }), row({ merchant: 'Apple' })]
    expect(filterByKind(brandsOnly, 'descriptor')).toHaveLength(0)
    expect(filterByKind(brandsOnly, 'unclassified')).toHaveLength(0)
  })
})

describe('paretoCut', () => {
  it('counts how few labels reach the threshold', () => {
    const rows = [
      row({ merchant: 'A', total_spent: 80 }),
      row({ merchant: 'B', total_spent: 10 }),
      row({ merchant: 'C', total_spent: 5 }),
      row({ merchant: 'D', total_spent: 5 }),
    ]
    expect(paretoCut(rows)).toEqual({ count: 1, share: 80 })
  })

  it('does not depend on the caller\'s sort order', () => {
    const ascending = [
      row({ merchant: 'C', total_spent: 5 }),
      row({ merchant: 'B', total_spent: 15 }),
      row({ merchant: 'A', total_spent: 80 }),
    ]
    expect(paretoCut(ascending).count).toBe(1)
  })

  it('returns the whole set when no prefix reaches the threshold', () => {
    const flat = Array.from({ length: 5 }, (_, i) =>
      row({ merchant: `M${i}`, total_spent: 100 }),
    )
    // 4 of 5 reaches exactly 80%, so the cut lands there, not at 5.
    expect(paretoCut(flat)).toEqual({ count: 4, share: 80 })
  })

  it('is safe on empty input', () => {
    expect(paretoCut([])).toEqual({ count: 0, share: 0 })
  })
})

describe('computeStats', () => {
  const rows = [
    row({ merchant: 'Home', label_kind: 'descriptor', total_spent: 8000, transaction_count: 2, avg_transaction: 4000 }),
    row({ merchant: 'Uber', total_spent: 1500, transaction_count: 30, avg_transaction: 50 }),
    row({ merchant: 'Apple', total_spent: 500, transaction_count: 2, avg_transaction: 250 }),
  ]
  const stats = computeStats(rows)

  it('picks the top payee by spend and the top by frequency separately', () => {
    // The most expensive payee and the most frequent one are different rows --
    // the whole reason both KPIs exist.
    expect(stats.topBySpend?.merchant).toBe('Home')
    expect(stats.topByFrequency?.merchant).toBe('Uber')
  })

  it('averages per payment, not per payee', () => {
    // 10,000 spend over 34 payments.
    expect(stats.trackedSpend).toBe(10_000)
    expect(stats.trackedPayments).toBe(34)
    expect(stats.avgTicket).toBeCloseTo(10_000 / 34, 6)
  })

  it('reports the median payee average so skew is visible', () => {
    expect(stats.medianMerchantTicket).toBe(250)
  })

  it('reports the top payee share and the vital-few cut', () => {
    expect(stats.topShare).toBe(80)
    expect(stats.vitalFewCount).toBe(1)
    expect(stats.vitalFewShare).toBe(80)
    expect(stats.merchantCount).toBe(3)
  })

  it('never divides by zero on an empty set', () => {
    const empty = computeStats([])
    expect(empty).toMatchObject({
      merchantCount: 0,
      trackedSpend: 0,
      trackedPayments: 0,
      topBySpend: null,
      topByFrequency: null,
      avgTicket: 0,
      medianMerchantTicket: 0,
      topShare: 0,
      vitalFewCount: 0,
      vitalFewShare: 0,
    })
  })

  it('uses the shared default threshold', () => {
    expect(PARETO_THRESHOLD).toBe(80)
  })
})

describe('toSpendByLabel', () => {
  it('sums labels that collide across kinds instead of overwriting', () => {
    // "Apple" can exist as both a brand row and a fruit descriptor row; an
    // overwrite would make the Pareto chart disagree with the KPI totals.
    const rows = [
      row({ merchant: 'Apple', total_spent: 700 }),
      row({ merchant: 'Apple', label_kind: 'descriptor', total_spent: 300 }),
      row({ merchant: 'Uber', total_spent: 200 }),
    ]
    expect(toSpendByLabel(rows)).toEqual({ Apple: 1000, Uber: 200 })
  })
})

describe('cadenceLabel', () => {
  it('describes the gap in the unit that reads naturally', () => {
    expect(cadenceLabel(row({ merchant: 'A', avg_days_between: 1 }))).toBe('Almost daily')
    expect(cadenceLabel(row({ merchant: 'A', avg_days_between: 7 }))).toBe('Every ~7 days')
    expect(cadenceLabel(row({ merchant: 'A', avg_days_between: 28 }))).toBe('Every ~4 weeks')
    expect(cadenceLabel(row({ merchant: 'A', avg_days_between: 90 }))).toBe('Every ~3 months')
  })

  it('does not claim a cadence without at least two payments', () => {
    expect(cadenceLabel(row({ merchant: 'A', transaction_count: 1 }))).toBe('One-off pattern')
    expect(cadenceLabel(row({ merchant: 'A', avg_days_between: null }))).toBe('One-off pattern')
    expect(cadenceLabel(row({ merchant: 'A', avg_days_between: 0 }))).toBe('One-off pattern')
  })
})
