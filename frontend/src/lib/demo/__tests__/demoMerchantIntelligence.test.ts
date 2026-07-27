import { describe, expect, it } from 'vitest'

import { countKinds, filterByKind, usableMerchants } from '@/pages/merchant-intelligence/merchantUtils'

import { generateDemoMerchantIntelligence } from '../demoComputedReads'
import { generateDemoTransactions } from '../generateTransactions'

const rows = generateDemoMerchantIntelligence(generateDemoTransactions())

describe('generateDemoMerchantIntelligence label_kind', () => {
  it('produces rows at all', () => {
    // Guards the assertions below from passing vacuously on an empty list.
    expect(rows.length).toBeGreaterThan(0)
  })

  it('tags every row with a kind the backend actually emits', () => {
    // extract_merchant() in core/analytics/merchant_extract.py returns only
    // 'brand' or 'descriptor'; anything else would land in "Unclassified".
    for (const row of rows) {
      expect(row.label_kind).toBe('descriptor')
    }
  })

  it('leaves the Unclassified bucket empty', () => {
    // 'unclassified' is reserved for rollups built before the label_kind
    // column existed. Demo mode must not masquerade as a stale rollup.
    const counts = countKinds(usableMerchants(rows))
    expect(counts.unclassified).toBe(0)
    expect(counts.descriptor).toBe(counts.brand + counts.descriptor)
  })

  it('is reachable through the Notes filter chip', () => {
    const usable = usableMerchants(rows)
    expect(filterByKind(usable, 'descriptor')).toHaveLength(usable.length)
    expect(filterByKind(usable, 'unclassified')).toHaveLength(0)
  })

  it('labels rows with the raw narration, which is why the kind is descriptor', () => {
    // The generator groups by `t.note`, so a branded note keeps its full text
    // ("Amazon Fashion") rather than folding to the canonical brand
    // ("Amazon"). No fold happened, so 'brand' would be a false claim.
    const branded = rows.find((row) => row.merchant.startsWith('Amazon '))
    expect(branded).toBeDefined()
    expect(branded?.label_kind).toBe('descriptor')
  })
})
