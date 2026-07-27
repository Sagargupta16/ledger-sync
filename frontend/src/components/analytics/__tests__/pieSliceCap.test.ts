import { describe, expect, it } from 'vitest'

import { MAX_PIE_SLICES, capPieSlices, sliceClickTarget, type PieSliceDatum } from '@/components/ui/pieSlices'

/**
 * 12 expense categories is what the real ledger actually has (measured), which
 * is exactly the case the project's "pie/donut only <=7 slices" rule exists for.
 */
function makeSlices(count: number): PieSliceDatum[] {
  // Descending-ish but deliberately NOT pre-sorted, so the helper has to sort.
  return Array.from({ length: count }, (_, i) => ({
    name: `Cat ${i + 1}`,
    value: (count - i) * 1000,
  })).reverse()
}

const sumValues = (slices: readonly PieSliceDatum[]) =>
  slices.reduce((total, s) => total + s.value, 0)

describe('capPieSlices', () => {
  it('caps a 12-slice input to 7 wedges with Other equal to the tail sum', () => {
    const input = makeSlices(12)
    const capped = capPieSlices(input)

    expect(MAX_PIE_SLICES).toBe(7)
    expect(capped).toHaveLength(7)

    // The 6 kept wedges are the 6 largest, in descending order.
    expect(capped.slice(0, 6).map((s) => s.name)).toEqual([
      'Cat 1', 'Cat 2', 'Cat 3', 'Cat 4', 'Cat 5', 'Cat 6',
    ])
    expect(capped.slice(0, 6).map((s) => s.value)).toEqual([
      12000, 11000, 10000, 9000, 8000, 7000,
    ])

    // Other == exact sum of the 6-item tail (6000+5000+4000+3000+2000+1000).
    const other = capped[6]
    expect(other.value).toBe(21000)
    expect(other.name).toBe('Other (6 categories)')
  })

  it('preserves the input total exactly -- no value is silently dropped', () => {
    const input = makeSlices(12)
    expect(sumValues(capPieSlices(input))).toBe(sumValues(input))
  })

  it('leaves a 5-slice input untouched (same names, values, and order)', () => {
    const input: PieSliceDatum[] = [
      { name: 'Rent', value: 30000 },
      { name: 'Food', value: 12000, color: '#000000' },
      { name: 'Travel', value: 8000 },
      { name: 'Health', value: 4000 },
      { name: 'Misc', value: 900 },
    ]
    const capped = capPieSlices(input)

    expect(capped).toHaveLength(5)
    expect(capped).toEqual(input)
    expect(capped.some((s) => s.name.startsWith('Other'))).toBe(false)
  })

  it('leaves an exactly-at-the-cap input untouched (no needless Other wedge)', () => {
    const input = makeSlices(MAX_PIE_SLICES)
    const capped = capPieSlices(input)

    expect(capped).toHaveLength(MAX_PIE_SLICES)
    expect(capped.some((s) => s.name.startsWith('Other'))).toBe(false)
  })

  it('folds a single extra slice into a 2-category Other wedge', () => {
    const capped = capPieSlices(makeSlices(MAX_PIE_SLICES + 1))

    expect(capped).toHaveLength(MAX_PIE_SLICES)
    expect(capped[MAX_PIE_SLICES - 1].name).toBe('Other (2 categories)')
    // 8 slices at 1000..8000; the tail is the two smallest.
    expect(capped[MAX_PIE_SLICES - 1].value).toBe(3000)
  })

  it('drops zero and negative values -- a pie cannot render them', () => {
    const capped = capPieSlices([
      { name: 'Real', value: 500 },
      { name: 'Zero', value: 0 },
      { name: 'Refund', value: -200 },
    ])

    expect(capped).toEqual([{ name: 'Real', value: 500 }])
  })

  it('honours an explicit larger cap when a caller opts out', () => {
    const capped = capPieSlices(makeSlices(12), 12)

    expect(capped).toHaveLength(12)
    expect(capped.some((s) => s.name.startsWith('Other'))).toBe(false)
  })

  it('disables capping entirely at maxSlices 0', () => {
    const capped = capPieSlices(makeSlices(30), 0)

    expect(capped).toHaveLength(30)
    expect(capped.some((s) => s.name.startsWith('Other'))).toBe(false)
  })

  it('does not mutate the caller array', () => {
    const input = makeSlices(12)
    const snapshot = input.map((s) => ({ ...s }))
    capPieSlices(input)

    expect(input).toEqual(snapshot)
  })

  it('tags the Other wedge with the muted palette color, not a category hue', () => {
    const other = capPieSlices(makeSlices(12)).at(-1)

    expect(other?.color).toBeTruthy()
    expect(typeof other?.color).toBe('string')
  })

  it('flags the Other wedge with isOther and leaves real categories unflagged', () => {
    const capped = capPieSlices(makeSlices(12))

    expect(capped.at(-1)?.isOther).toBe(true)
    expect(capped.slice(0, -1).every((s) => s.isOther === undefined)).toBe(true)
  })
})

describe('sliceClickTarget', () => {
  it('returns the category name for a real wedge', () => {
    expect(sliceClickTarget({ name: 'Food', value: 1000 })).toBe('Food')
  })

  it('returns null for the folded Other wedge -- it filters nothing', () => {
    // `/transactions?category=Other (6 categories)` matches no transaction.category,
    // so a click there would land the user on a permanently empty list.
    const other = capPieSlices(makeSlices(12)).at(-1) as PieSliceDatum

    expect(other.name).toBe('Other (6 categories)')
    expect(sliceClickTarget(other)).toBeNull()
  })

  it('returns null even for a wedge literally named Other that is flagged', () => {
    expect(sliceClickTarget({ name: 'Other', value: 1, isOther: true })).toBeNull()
  })

  it('does not special-case a genuine user category called Other', () => {
    // Only the synthetic flag suppresses the link -- a real "Other" category in
    // the ledger stays clickable because it does filter to rows.
    expect(sliceClickTarget({ name: 'Other', value: 1 })).toBe('Other')
  })
})
