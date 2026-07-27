import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { preferencesService, type ExchangeRatesResponse } from '@/services/api/preferences'
import { usePreferencesStore } from '@/store/preferencesStore'
import { useAuthStore } from '@/store/authStore'
import { BASE_CURRENCY } from '@/constants/currencies'
import { MS_PER_DAY } from '@/lib/dateUtils'

const EXCHANGE_RATE_KEY = ['exchange-rates']

export function useExchangeRate() {
  const displayCurrency = usePreferencesStore((s) => s.displayCurrency)
  const setExchangeRate = usePreferencesStore((s) => s.setExchangeRate)
  const accessToken = useAuthStore((s) => s.accessToken)

  const query = useQuery({
    // Keyed on the BASE currency only, which is the sole input `queryFn` uses.
    // The key used to carry `displayCurrency` while the request ignored it, so
    // every currency the user tried opened its own cache entry and re-fetched an
    // identical payload.
    queryKey: [...EXCHANGE_RATE_KEY, BASE_CURRENCY],
    queryFn: () => preferencesService.getExchangeRates(BASE_CURRENCY),
    // Runs even while the user is on the base currency and needs no conversion:
    // the payload is also the answer to "which currencies can be offered at
    // all", and the switcher has to know that BEFORE the user picks one. Gating
    // it on `displayCurrency !== BASE_CURRENCY` meant the option list could only
    // be learned after making a selection that might be unpriceable -- which is
    // precisely how AED stayed selectable. One cached request per day.
    enabled: !!accessToken,
    staleTime: MS_PER_DAY,
    gcTime: MS_PER_DAY,
  })

  // Push fetched rate into Zustand for synchronous access by formatters.
  // Only update if the rate actually changed to avoid unnecessary re-renders.
  useEffect(() => {
    if (query.data?.rates && displayCurrency !== BASE_CURRENCY) {
      const rate = query.data.rates[displayCurrency]
      if (rate != null && rate !== usePreferencesStore.getState().exchangeRate) {
        setExchangeRate(rate, rateAsOf(query.data))
      }
    }
  }, [query.data, displayCurrency, setExchangeRate])

  return {
    rate: query.data?.rates?.[displayCurrency] ?? null,
    /**
     * Currency codes the served payload can actually price. Feeds
     * `selectableCurrencies` so the switcher only offers what is convertible --
     * see the note there on why the `CURRENCIES` catalogue is not that list.
     */
    ratedCodes: query.data?.rates ? Object.keys(query.data.rates) : [],
    isLoading: query.isLoading,
    error: query.error,
    isStale: query.data?.stale === true,
    isFallback: query.data?.fallback === true,
    updatedAt: query.data ? rateAsOf(query.data) : null,
  }
}

/**
 * When the served rates were actually captured.
 *
 * The fallback branch is the reason this exists. On it the backend sends
 * `fetched_at: null` plus `fallback_as_of` (the date the hardcoded table was
 * captured, currently months back), and this used to fall through to
 * `new Date()` -- so the sidebar reported an approximate baked-in rate as
 * "just now" and the user had no way to know their converted totals were built
 * on a stale table.
 */
function rateAsOf(data: ExchangeRatesResponse): string {
  if (data.fetched_at) return new Date(data.fetched_at * 1000).toISOString()
  if (data.fallback_as_of) return new Date(data.fallback_as_of).toISOString()
  return new Date().toISOString()
}
