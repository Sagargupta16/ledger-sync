import { useCallback, useEffect, useRef, useState } from 'react'

import { convertedRsuPrice, needsHistoricalVestingPrice } from '@/lib/rsuVesting'
import { preferencesService } from '@/services/api/preferences'
import type { RsuGrant } from '@/types/salary'

export interface RsuPriceStatus {
  kind: 'error' | 'success'
  scope: 'current' | 'vesting'
  message: string
}

async function fetchConvertedPrice(symbol: string, targetCurrency: string, onDate?: string) {
  const quote = await preferencesService.getStockPrice(symbol, onDate)
  if (!quote.currency || (onDate && (!quote.as_of || quote.as_of > onDate))) {
    throw new Error('A dated price and its currency are required.')
  }
  let rate = 1
  if (quote.currency !== targetCurrency) {
    const exchange = await preferencesService.getExchangeRates(quote.currency, onDate)
    if (exchange.base !== quote.currency || exchange.fallback || exchange.stale) {
      throw new Error('A reliable exchange rate is unavailable.')
    }
    if (onDate && (!exchange.historical || exchange.requested_date !== onDate)) {
      throw new Error('The vest-date exchange rate is unavailable.')
    }
    rate = exchange.rates[targetCurrency]
  }
  const price = convertedRsuPrice(quote.price, rate)
  if (price == null) throw new Error('The converted price is unavailable.')
  return price
}

async function fetchHistoricalPrices(symbol: string, currency: string, dates: string[]) {
  const fetched = new Map<string, number>()
  for (const date of dates) {
    try {
      fetched.set(date, await fetchConvertedPrice(symbol, currency, date))
    } catch {
      // Failed dates remain unlocked estimates for an explicit retry.
    }
  }
  return fetched
}

/** Explicit price actions only; reading saved settings never locks historical prices. */
export function useRsuPrices(
  grants: RsuGrant[],
  updateGrants: (grants: RsuGrant[]) => void,
  displayCurrency: string,
) {
  const latest = useRef({ grants, updateGrants, displayCurrency })
  useEffect(() => {
    latest.current = { grants, updateGrants, displayCurrency }
  }, [grants, updateGrants, displayCurrency])
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  const busy = useRef(false)
  const [pending, setPending] = useState<{ grantId: string; scope: 'current' | 'vesting' } | null>(null)
  const [priceStatusByGrant, setPriceStatusByGrant] = useState<Record<string, RsuPriceStatus | undefined>>({})

  const fetchStockPrice = useCallback(async (grant: RsuGrant) => {
    if (busy.current || !grant.stock_name.trim()) return
    busy.current = true
    setPending({ grantId: grant.id, scope: 'current' })
    setPriceStatusByGrant((previous) => ({ ...previous, [grant.id]: undefined }))
    try {
      const price = await fetchConvertedPrice(grant.stock_name.trim(), displayCurrency)
      const current = latest.current.grants.find((item) => item.id === grant.id)
      if (!mounted.current) return
      if (!current || current.stock_name !== grant.stock_name
        || latest.current.displayCurrency !== displayCurrency || current.stock_price !== grant.stock_price) {
        throw new Error('The grant changed while its price was loading.')
      }
      latest.current.updateGrants(latest.current.grants.map(
        (item) => item.id === grant.id ? { ...item, stock_price: price } : item,
      ))
      setPriceStatusByGrant((previous) => ({
        ...previous,
        [grant.id]: { kind: 'success', scope: 'current', message: `Current price loaded in ${displayCurrency}. Save settings to keep it.` },
      }))
    } catch {
      if (mounted.current) setPriceStatusByGrant((previous) => ({
        ...previous,
        [grant.id]: {
          kind: 'error', scope: 'current',
          message: `Could not load a valid price in ${displayCurrency}. Existing prices were kept. Retry, check the symbol, or enter a price manually.`,
        },
      }))
    } finally {
      busy.current = false
      if (mounted.current) setPending(null)
    }
  }, [displayCurrency])

  const fetchVestPrices = useCallback(async (grant: RsuGrant) => {
    if (busy.current || !grant.stock_name.trim()) return
    const dates = [...new Set(grant.vestings.filter((vesting) => needsHistoricalVestingPrice(vesting))
      .map((vesting) => vesting.date))]
    if (dates.length === 0) return
    busy.current = true
    setPending({ grantId: grant.id, scope: 'vesting' })
    setPriceStatusByGrant((previous) => ({ ...previous, [grant.id]: undefined }))
    const fetched = await fetchHistoricalPrices(grant.stock_name.trim(), displayCurrency, dates)
    busy.current = false
    if (!mounted.current) return
    setPending(null)
    const current = latest.current.grants.find((item) => item.id === grant.id)
    if (!current || current.stock_name !== grant.stock_name
      || latest.current.displayCurrency !== displayCurrency) {
      setPriceStatusByGrant((previous) => ({
        ...previous,
        [grant.id]: {
          kind: 'error', scope: 'vesting',
          message: 'The grant or display currency changed while loading. Prices were kept; retry for the updated grant.',
        },
      }))
      return
    }
    let changed = false
    const vestings = current.vestings.map((vesting) => {
      const price = fetched.get(vesting.date)
      if (price == null || !needsHistoricalVestingPrice(vesting)) return vesting
      changed = true
      return { ...vesting, price_at_vest: price }
    })
    if (changed) latest.current.updateGrants(latest.current.grants.map(
      (item) => item.id === grant.id ? { ...item, vestings } : item,
    ))
    const failed = dates.length - fetched.size
    let message = 'The vesting dates or locked prices changed during the request; no prices were changed.'
    if (changed) message = 'Vest-date prices loaded. Existing locked prices were kept. Save settings to keep the new prices.'
    if (failed > 0) message = `${failed} vest-date price(s) could not be converted to ${displayCurrency}. Existing prices were kept; missing prices remain estimates. Retry when the price and exchange-rate services are available.`
    setPriceStatusByGrant((previous) => ({
      ...previous,
      [grant.id]: { kind: failed > 0 ? 'error' : 'success', scope: 'vesting', message },
    }))
  }, [displayCurrency])

  return {
    fetchingPriceFor: pending?.scope === 'current' ? pending.grantId : null,
    fetchingVestPricesFor: pending?.scope === 'vesting' ? pending.grantId : null,
    priceStatusByGrant,
    fetchStockPrice,
    fetchVestPrices,
  }
}
