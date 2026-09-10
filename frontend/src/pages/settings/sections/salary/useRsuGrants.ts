import { useCallback } from 'react'

import type { RsuGrant, RsuVesting } from '@/types/salary'

import { sortVestings } from '@/lib/rsuVesting'
import { useRsuPrices } from './useRsuPrices'

/** RSU grant/vesting edits and explicit price actions for salary settings. */
export function useRsuGrants(
  localRsuGrants: RsuGrant[],
  updateRsuGrants: (grants: RsuGrant[]) => void,
  displayCurrency: string,
) {
  const priceActions = useRsuPrices(localRsuGrants, updateRsuGrants, displayCurrency)

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

  return {
    ...priceActions,
    addGrant,
    removeGrant,
    updateGrant,
    addVesting,
    updateVesting,
    removeVesting,
    sortGrantVestings,
  }
}
