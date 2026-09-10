import { describe, expect, it } from 'vitest'

import {
  estimateNetRsuQuantity,
  grossVestingValue,
  isVested,
  netVestingQuantity,
  netVestingValue,
  sortVestings,
  splitRsuTotals,
  vestingPrice,
} from '../rsuVesting'
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
    expect(totals.vested.receivedShares).toBeCloseTo(19.952, 6)
    expect(totals.vested.receivedValue).toBeCloseTo(3784, 2)
    expect(totals.upcoming.receivedShares).toBeCloseTo(12.384, 6)
    expect(totals.upcoming.receivedValue).toBeCloseTo(2476.8, 2)
    expect(totals.vested.hasEstimates).toBe(true)
    expect(totals.upcoming.hasEstimates).toBe(true)
  })

  it('returns zeros for no grants', () => {
    const totals = splitRsuTotals([], TODAY)
    expect(totals.vested.shares).toBe(0)
    expect(totals.upcoming.value).toBe(0)
    expect(totals.vested.receivedShares).toBe(0)
    expect(totals.upcoming.receivedValue).toBe(0)
    expect(totals.vested.hasEstimates).toBe(false)
  })
})

describe('received RSU quantities', () => {
  it('estimates 25 gross units as 17.2 after 30% tax and cess on the tax', () => {
    expect(estimateNetRsuQuantity(25)).toBe(17.2)
    expect(netVestingQuantity({ date: '2026-08-15', quantity: 25 })).toBe(17.2)
  })

  it('handles zero and fractional units without rounding to whole shares', () => {
    expect(estimateNetRsuQuantity(0)).toBe(0)
    expect(estimateNetRsuQuantity(1.25)).toBeCloseTo(0.86, 8)
    expect(
      netVestingQuantity({ date: '2026-08-15', quantity: 25, net_quantity: 17.200123 }),
    ).toBe(17.200123)
  })

  it.each([0, 17.2, 25])('uses actual %s units instead of estimating again', (actual) => {
    expect(
      netVestingQuantity({ date: '2026-08-15', quantity: 25, net_quantity: actual }),
    ).toBe(actual)
  })

  it('does not write an estimate into an existing vest', () => {
    const vesting = Object.freeze({ date: '2026-08-15', quantity: 25 })
    expect(netVestingQuantity(vesting)).toBe(17.2)
    expect(vesting).toEqual({ date: '2026-08-15', quantity: 25 })
  })
})

describe('netVestingValue', () => {
  it('values the shares actually received at the same per-share price', () => {
    // 6 vested, 4.127 credited after sell-to-cover, priced at the vest-date close.
    expect(netVestingValue({ date: '2025-08-15', quantity: 6, net_quantity: 4.127 }, 150)).toBe(
      619.05,
    )
  })

  it('estimates when actual units are missing, while respecting explicit full withholding', () => {
    expect(netVestingValue({ date: '2025-08-15', quantity: 25 }, 150)).toBe(2580)
    expect(netVestingValue({ date: '2025-08-15', quantity: 25, net_quantity: null }, 150)).toBe(2580)
    expect(netVestingValue({ date: '2025-08-15', quantity: 25, net_quantity: 0 }, 150)).toBe(0)
  })

  it('keeps gross totals unchanged while adding actual received totals', () => {
    const withNet: RsuGrant = {
      ...grant,
      vestings: grant.vestings.map((v) => ({ ...v, net_quantity: 1 })),
    }
    const totals = splitRsuTotals([withNet], TODAY)
    expect(totals.vested).toEqual({
      shares: 29,
      value: 5500,
      receivedShares: 2,
      receivedValue: 350,
      hasEstimates: false,
      hasEstimatedPrices: true,
    })
    expect(totals.upcoming).toEqual({
      shares: 18,
      value: 3600,
      receivedShares: 1,
      receivedValue: 200,
      hasEstimates: false,
      hasEstimatedPrices: true,
    })
  })

  it('uses locked vest prices for estimated and actual received values', () => {
    const estimated = { date: '2025-08-15', quantity: 25, price_at_vest: 150 }
    const actual = { ...estimated, net_quantity: 20 }
    expect(netVestingValue(estimated, vestingPrice(grant, estimated, TODAY))).toBe(2580)
    expect(netVestingValue(actual, vestingPrice(grant, actual, TODAY))).toBe(3000)
    expect(grossVestingValue(actual, vestingPrice(grant, actual, TODAY))).toBe(3750)
  })

  it('flags mixed summaries as estimated and retains zero actual units', () => {
    const mixed: RsuGrant = {
      ...grant,
      vestings: [
        { date: '2025-08-15', quantity: 25, net_quantity: 0 },
        { date: '2026-02-15', quantity: 25 },
      ],
    }
    const totals = splitRsuTotals([mixed], TODAY)
    expect(totals.vested.shares).toBe(50)
    expect(totals.vested.receivedShares).toBe(17.2)
    expect(totals.vested.receivedValue).toBe(3440)
    expect(totals.vested.hasEstimates).toBe(true)
  })
})
