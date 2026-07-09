/**
 * Shared RSU vesting helpers -- single source of truth for "is this vesting
 * vested?" and "what price does it get valued at?" used by the settings UI,
 * the tax projection calculator, and the TDS schedule calculator.
 */

import { toLocalDateKey } from '@/lib/dateUtils'
import type { RsuGrant, RsuVesting } from '@/types/salary'

/** Today's date as a local YYYY-MM-DD key. */
export function todayKey(): string {
  return toLocalDateKey(new Date())
}

/** A vesting is vested once its date is today or earlier. */
export function isVested(v: RsuVesting, today: string = todayKey()): boolean {
  return Boolean(v.date) && v.date <= today
}

/**
 * Sort vestings chronologically. Rows without a date (still being typed)
 * keep their relative order at the end so a new blank row doesn't jump.
 */
export function sortVestings(vestings: RsuVesting[]): RsuVesting[] {
  return [...vestings].sort((a, b) => {
    if (!a.date && !b.date) return 0
    if (!a.date) return 1
    if (!b.date) return -1
    return a.date.localeCompare(b.date)
  })
}

/**
 * Effective per-share price for a vesting: vested rows use the locked
 * vest-date price when available, everything else falls back to the
 * grant's current price.
 */
export function vestingPrice(grant: RsuGrant, v: RsuVesting, today: string = todayKey()): number {
  if (isVested(v, today) && v.price_at_vest != null && v.price_at_vest > 0) {
    return Number(v.price_at_vest)
  }
  return Number(grant.stock_price) || 0
}

export interface RsuSplitTotals {
  vested: { shares: number; value: number }
  upcoming: { shares: number; value: number }
}

/** Split share/value totals across all grants into vested vs upcoming. */
export function splitRsuTotals(grants: RsuGrant[], today: string = todayKey()): RsuSplitTotals {
  const totals: RsuSplitTotals = {
    vested: { shares: 0, value: 0 },
    upcoming: { shares: 0, value: 0 },
  }
  for (const g of grants) {
    for (const v of g.vestings) {
      const bucket = isVested(v, today) ? totals.vested : totals.upcoming
      bucket.shares += v.quantity
      bucket.value += v.quantity * vestingPrice(g, v, today)
    }
  }
  return totals
}
