import { describe, expect, it } from 'vitest'

import { isVested, sortVestings, splitRsuTotals, vestingPrice } from '../rsuVesting'
import type { RsuGrant } from '@/types/salary'

const TODAY = '2026-07-09'

const grant: RsuGrant = {
  id: 'g1',
  stock_name: 'AMZN',
  stock_price: 200,
  grant_date: null,
  notes: null,
  vestings: [
    { date: '2026-08-15', quantity: 18 },
    { date: '2025-08-15', quantity: 6, price_at_vest: 150 },
    { date: '2026-02-15', quantity: 23 },
  ],
}

describe('isVested', () => {
  it('treats past and today as vested, future as not', () => {
    expect(isVested({ date: '2025-08-15', quantity: 1 }, TODAY)).toBe(true)
    expect(isVested({ date: TODAY, quantity: 1 }, TODAY)).toBe(true)
    expect(isVested({ date: '2026-08-15', quantity: 1 }, TODAY)).toBe(false)
  })

  it('treats a blank date (row being typed) as not vested', () => {
    expect(isVested({ date: '', quantity: 1 }, TODAY)).toBe(false)
  })
})

describe('sortVestings', () => {
  it('sorts chronologically', () => {
    const sorted = sortVestings(grant.vestings)
    expect(sorted.map((v) => v.date)).toEqual(['2025-08-15', '2026-02-15', '2026-08-15'])
  })

  it('keeps blank-date rows at the end in stable order', () => {
    const sorted = sortVestings([
      { date: '', quantity: 1 },
      { date: '2026-01-01', quantity: 2 },
      { date: '', quantity: 3 },
    ])
    expect(sorted.map((v) => v.quantity)).toEqual([2, 1, 3])
  })

  it('does not mutate the input array', () => {
    const input = [...grant.vestings]
    sortVestings(input)
    expect(input.map((v) => v.date)).toEqual(['2026-08-15', '2025-08-15', '2026-02-15'])
  })
})

describe('vestingPrice', () => {
  it('uses the locked vest-date price for vested rows', () => {
    expect(vestingPrice(grant, grant.vestings[1], TODAY)).toBe(150)
  })

  it('falls back to current price for vested rows without a locked price', () => {
    expect(vestingPrice(grant, grant.vestings[2], TODAY)).toBe(200)
  })

  it('uses current price for upcoming rows even if price_at_vest is set', () => {
    const future = { date: '2027-01-01', quantity: 5, price_at_vest: 999 }
    expect(vestingPrice(grant, future, TODAY)).toBe(200)
  })
})

describe('splitRsuTotals', () => {
  it('splits shares and value into vested vs upcoming buckets', () => {
    const totals = splitRsuTotals([grant], TODAY)
    // Vested: 6 @ locked 150 + 23 @ current 200
    expect(totals.vested.shares).toBe(29)
    expect(totals.vested.value).toBe(6 * 150 + 23 * 200)
    // Upcoming: 18 @ current 200
    expect(totals.upcoming.shares).toBe(18)
    expect(totals.upcoming.value).toBe(18 * 200)
  })

  it('returns zeros for no grants', () => {
    const totals = splitRsuTotals([], TODAY)
    expect(totals.vested.shares).toBe(0)
    expect(totals.upcoming.value).toBe(0)
  })
})
