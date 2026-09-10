/**
 * Shared RSU vesting helpers -- single source of truth for "is this vesting
 * vested?" and "what price does it get valued at?" used by the settings UI,
 * the tax projection calculator, and the TDS schedule calculator.
 */

import { toLocalDateKey } from '@/lib/dateUtils'
import type { RsuGrant, RsuVesting, ValuedRsuVesting } from '@/types/salary'

export type { ValuedRsuVesting } from '@/types/salary'

/** Planning assumption only; actual sell-to-cover quantities override it. */
export const DEFAULT_RSU_TAX_PERCENT = 30
export const DEFAULT_RSU_CESS_PERCENT = 4

/** Today's date as a local YYYY-MM-DD key. */
export function todayKey(): string {
  return toLocalDateKey(new Date())
}

/** A vesting is vested once its date is today or earlier. */
export function isVested(v: RsuVesting, today: string = todayKey()): boolean {
  return Boolean(v.date) && v.date <= today
}

export function hasLockedVestingPrice(v: RsuVesting, today: string = todayKey()): boolean {
  return isVested(v, today) && v.price_at_vest != null && v.price_at_vest > 0
}

export function needsHistoricalVestingPrice(v: RsuVesting, today: string = todayKey()): boolean {
  return isVested(v, today) && !hasLockedVestingPrice(v, today)
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
  if (hasLockedVestingPrice(v, today)) {
    return Number(v.price_at_vest)
  }
  return Number(grant.stock_price) || 0
}

/** Gross perquisite value, including shares withheld to pay tax. */
export function grossVestingValue(v: RsuVesting, pricePerShare: number): number {
  return Number(v.quantity) * pricePerShare
}

/** Estimate received units after 30% tax and 4% cess on that tax, without rounding units. */
export function estimateNetRsuQuantity(grossQuantity: number): number {
  const taxQuantity = grossQuantity * DEFAULT_RSU_TAX_PERCENT / 100
  const cessQuantity = taxQuantity * DEFAULT_RSU_CESS_PERCENT / 100
  return grossQuantity - taxQuantity - cessQuantity
}

/**
 * Actual received units take precedence, including zero for full withholding.
 * Missing actuals use the planning estimate without changing the saved vest.
 */
export function netVestingQuantity(v: RsuVesting): number {
  return v.net_quantity == null
    ? estimateNetRsuQuantity(Number(v.quantity))
    : Number(v.net_quantity)
}

/**
 * Received value at the same price as the gross vest, estimated if no actual
 * units were entered. This is received compensation; projections and TDS retain
 * grossVestingValue as their tax basis and treat withheld shares as tax payment.
 */
export function netVestingValue(v: RsuVesting, pricePerShare: number): number {
  return netVestingQuantity(v) * pricePerShare
}

/** An invalid/missing exchange rate cannot become a saved price in another currency. */
export function convertedRsuPrice(price: number, rate: number): number | null {
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(rate) || rate <= 0) return null
  const converted = Math.round(price * rate * 100) / 100
  return converted > 0 ? converted : null
}

export interface RsuValuationOptions {
  fyStartMonth: number
  stockAppreciationPct?: number
  baseStartYear?: number
  today?: string
}

function valueVesting(
  grant: RsuGrant,
  vesting: RsuVesting,
  options: RsuValuationOptions,
): ValuedRsuVesting | null {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(vesting.date)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  if (month < 1 || month > 12) return null
  const fyStartYear = month >= options.fyStartMonth ? year : year - 1
  const today = options.today ?? todayKey()
  const vested = isVested(vesting, today)
  const yearsFromBase = vested ? 0 : Math.max(0, fyStartYear - (options.baseStartYear ?? fyStartYear))
  const price = vestingPrice(grant, vesting, today)
    * Math.pow(1 + (options.stockAppreciationPct ?? 0) / 100, yearsFromBase)
  const grossValue = grossVestingValue(vesting, price)
  const netValue = netVestingValue(vesting, price)
  const isNetQuantityEstimated = vesting.net_quantity == null
  const isPriceEstimated = !hasLockedVestingPrice(vesting, today)
  return {
    grantId: grant.id,
    stockName: grant.stock_name,
    date: vesting.date,
    fy: `${fyStartYear}-${String((fyStartYear + 1) % 100).padStart(2, '0')}`,
    fyStartYear,
    monthIndex: (month - options.fyStartMonth + 12) % 12,
    vested,
    price,
    grossQuantity: Number(vesting.quantity),
    netQuantity: netVestingQuantity(vesting),
    grossValue,
    netValue,
    withholdingValue: Math.max(0, grossValue - netValue),
    isNetQuantityEstimated,
    isPriceEstimated,
    isWithholdingEstimated: isNetQuantityEstimated || isPriceEstimated,
  }
}

/** Canonical vest valuation shared by FY projections and monthly tax schedules. */
export function valueRsuVestings(
  grants: RsuGrant[],
  options: RsuValuationOptions,
): ValuedRsuVesting[] {
  const events: ValuedRsuVesting[] = []
  for (const grant of grants) {
    for (const vesting of grant.vestings) {
      const event = valueVesting(grant, vesting, options)
      if (event) events.push(event)
    }
  }
  return events
}

/** Keep recorded share withholding distinct from planning estimates. */
export function sumRsuCompensation(events: ValuedRsuVesting[]) {
  return events.reduce((totals, event) => ({
    grossValue: totals.grossValue + event.grossValue,
    netValue: totals.netValue + event.netValue,
    withholdingValue: totals.withholdingValue + event.withholdingValue,
    recordedWithholding: totals.recordedWithholding
      + (event.isWithholdingEstimated ? 0 : event.withholdingValue),
    estimatedWithholding: totals.estimatedWithholding
      + (event.isWithholdingEstimated ? event.withholdingValue : 0),
  }), { grossValue: 0, netValue: 0, withholdingValue: 0, recordedWithholding: 0, estimatedWithholding: 0 })
}

interface RsuTotals {
  shares: number
  value: number
  receivedShares: number
  receivedValue: number
  hasEstimates: boolean
  hasEstimatedPrices: boolean
}

export interface RsuSplitTotals {
  vested: RsuTotals
  upcoming: RsuTotals
}

/** Keep gross tax-basis totals alongside received totals, split by vesting status. */
export function splitRsuTotals(grants: RsuGrant[], today: string = todayKey()): RsuSplitTotals {
  const totals: RsuSplitTotals = {
    vested: { shares: 0, value: 0, receivedShares: 0, receivedValue: 0, hasEstimates: false, hasEstimatedPrices: false },
    upcoming: { shares: 0, value: 0, receivedShares: 0, receivedValue: 0, hasEstimates: false, hasEstimatedPrices: false },
  }
  for (const g of grants) {
    for (const v of g.vestings) {
      const bucket = isVested(v, today) ? totals.vested : totals.upcoming
      const price = vestingPrice(g, v, today)
      bucket.shares += Number(v.quantity)
      bucket.value += grossVestingValue(v, price)
      bucket.receivedShares += netVestingQuantity(v)
      bucket.receivedValue += netVestingValue(v, price)
      if (v.quantity > 0 && v.net_quantity == null) bucket.hasEstimates = true
      if (v.quantity > 0 && !hasLockedVestingPrice(v, today)) bucket.hasEstimatedPrices = true
    }
  }
  return totals
}
