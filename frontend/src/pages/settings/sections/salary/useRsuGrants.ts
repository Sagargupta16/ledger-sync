import { useCallback, useEffect, useRef, useState } from 'react'

import { preferencesService } from '@/services/api/preferences'
import type { RsuGrant, RsuVesting } from '@/types/salary'

import { isVested, sortVestings, todayKey } from '@/lib/rsuVesting'

/**
 * RSU grant/vesting state handlers for the salary structure section.
 *
 * Also locks in vest-date prices: once a vesting date passes, the historical
 * close for that date is fetched once and stored as `price_at_vest` so the
 * vested value stops drifting with the current price.
 */
export function useRsuGrants(
  localRsuGrants: RsuGrant[],
  updateRsuGrants: (grants: RsuGrant[]) => void,
  displayCurrency: string,
) {
  const [fetchingPriceFor, setFetchingPriceFor] = useState<string | null>(null)

  const addGrant = useCallback(() => {
    const grant: RsuGrant = {
      id: crypto.randomUUID(),
      stock_name: '',
      stock_price: 0,
      grant_date: null,
      notes: null,
      vestings: [],
    }
    updateRsuGrants([...localRsuGrants, grant])
  }, [localRsuGrants, updateRsuGrants])

  const removeGrant = useCallback(
    (id: string) => updateRsuGrants(localRsuGrants.filter((g) => g.id !== id)),
    [localRsuGrants, updateRsuGrants],
  )

  const updateGrant = useCallback(
    (id: string, patch: Partial<RsuGrant>) => {
      updateRsuGrants(localRsuGrants.map((g) => (g.id === id ? { ...g, ...patch } : g)))
    },
    [localRsuGrants, updateRsuGrants],
  )

  const addVesting = useCallback(
    (grantId: string) => {
      updateGrant(grantId, {
        vestings: [
          ...(localRsuGrants.find((g) => g.id === grantId)?.vestings ?? []),
          { date: '', quantity: 0 },
        ],
      })
    },
    [localRsuGrants, updateGrant],
  )

  const updateVesting = useCallback(
    (grantId: string, vestIdx: number, patch: Partial<RsuVesting>) => {
      const grant = localRsuGrants.find((g) => g.id === grantId)
      if (!grant) return
      const vestings = grant.vestings.map((v, i) => {
        if (i !== vestIdx) return v
        // A changed date invalidates any locked vest-date price.
        const clearPrice = patch.date !== undefined && patch.date !== v.date
        return { ...v, ...patch, ...(clearPrice ? { price_at_vest: null } : {}) }
      })
      updateGrant(grantId, { vestings })
    },
    [localRsuGrants, updateGrant],
  )

  const removeVesting = useCallback(
    (grantId: string, vestIdx: number) => {
      const grant = localRsuGrants.find((g) => g.id === grantId)
      if (!grant) return
      updateGrant(grantId, { vestings: grant.vestings.filter((_, i) => i !== vestIdx) })
    },
    [localRsuGrants, updateGrant],
  )

  const sortGrantVestings = useCallback(
    (grantId: string) => {
      const grant = localRsuGrants.find((g) => g.id === grantId)
      if (!grant) return
      const sorted = sortVestings(grant.vestings)
      // Skip the no-op case so a mere focus/blur doesn't mark settings dirty.
      const changed = sorted.some((v, i) => v !== grant.vestings[i])
      if (changed) updateGrant(grantId, { vestings: sorted })
    },
    [localRsuGrants, updateGrant],
  )

  const convertPrice = useCallback(
    async (price: number, currency: string): Promise<number> => {
      if (!currency || currency === displayCurrency) return price
      const rates = await preferencesService.getExchangeRates(currency)
      const rate = rates.rates[displayCurrency]
      return rate ? Math.round(price * rate * 100) / 100 : price
    },
    [displayCurrency],
  )

  const fetchStockPrice = useCallback(
    async (grant: RsuGrant) => {
      if (!grant.stock_name.trim()) return
      setFetchingPriceFor(grant.id)
      try {
        const result = await preferencesService.getStockPrice(grant.stock_name.trim())
        const price = await convertPrice(result.price, result.currency)
        updateGrant(grant.id, { stock_price: price })
      } catch {
        /* user can still enter manually */
      } finally {
        setFetchingPriceFor(null)
      }
    },
    [updateGrant, convertPrice],
  )

  // Lock vest-date prices for vested rows that don't have one yet.
  // Attempted keys are remembered per session so upstream failures
  // (delisted ticker, Yahoo hiccup) don't retrigger on every render.
  const attemptedVestFetches = useRef(new Set<string>())
  useEffect(() => {
    const today = todayKey()
    const jobs: Array<{ grantId: string; symbol: string; date: string }> = []
    for (const g of localRsuGrants) {
      const symbol = g.stock_name.trim()
      if (!symbol) continue
      for (const v of g.vestings) {
        if (!isVested(v, today) || (v.price_at_vest != null && v.price_at_vest > 0)) continue
        const key = `${g.id}|${symbol}|${v.date}`
        if (attemptedVestFetches.current.has(key)) continue
        attemptedVestFetches.current.add(key)
        jobs.push({ grantId: g.id, symbol, date: v.date })
      }
    }
    if (jobs.length === 0) return

    let cancelled = false
    const run = async () => {
      const fetched = new Map<string, number>()
      for (const job of jobs) {
        try {
          const result = await preferencesService.getStockPrice(job.symbol, job.date)
          const price = await convertPrice(result.price, result.currency)
          if (price > 0) fetched.set(`${job.grantId}|${job.date}`, price)
        } catch {
          /* falls back to current price in the UI */
        }
      }
      if (cancelled || fetched.size === 0) return
      updateRsuGrants(
        localRsuGrants.map((g) => ({
          ...g,
          vestings: g.vestings.map((v) => {
            const price = fetched.get(`${g.id}|${v.date}`)
            return price !== undefined && (v.price_at_vest == null || v.price_at_vest <= 0)
              ? { ...v, price_at_vest: price }
              : v
          }),
        })),
      )
    }
    run()
    return () => {
      cancelled = true
    }
  }, [localRsuGrants, updateRsuGrants, convertPrice])

  return {
    fetchingPriceFor,
    addGrant,
    removeGrant,
    updateGrant,
    addVesting,
    updateVesting,
    removeVesting,
    sortGrantVestings,
    fetchStockPrice,
  }
}
