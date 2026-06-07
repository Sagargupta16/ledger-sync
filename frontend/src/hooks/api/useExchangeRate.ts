import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { preferencesService } from '@/services/api/preferences'
import { usePreferencesStore } from '@/store/preferencesStore'
import { useAuthStore } from '@/store/authStore'
import { BASE_CURRENCY } from '@/constants/currencies'
import { MS_PER_DAY } from '@/lib/dateUtils'

const EXCHANGE_RATE_KEY = ['exchange-rates']

export function useExchangeRate() {
  const displayCurrency = usePreferencesStore((s) => s.displayCurrency)
  const setExchangeRate = usePreferencesStore((s) => s.setExchangeRate)
  const accessToken = useAuthStore((s) => s.accessToken)

  const needsConversion = displayCurrency !== BASE_CURRENCY

  const query = useQuery({
    queryKey: [...EXCHANGE_RATE_KEY, displayCurrency],
    queryFn: () => preferencesService.getExchangeRates(BASE_CURRENCY),
    enabled: !!accessToken && needsConversion,
    staleTime: MS_PER_DAY,
    gcTime: MS_PER_DAY,
  })

  // Push fetched rate into Zustand for synchronous access by formatters.
  // Only update if the rate actually changed to avoid unnecessary re-renders.
  useEffect(() => {
    if (query.data?.rates && displayCurrency !== BASE_CURRENCY) {
      const rate = query.data.rates[displayCurrency]
      if (rate != null && rate !== usePreferencesStore.getState().exchangeRate) {
        const updatedAt = query.data.fetched_at
          ? new Date(query.data.fetched_at * 1000).toISOString()
          : new Date().toISOString()
        setExchangeRate(rate, updatedAt)
      }
    }
  }, [query.data, displayCurrency, setExchangeRate])

  return {
    rate: query.data?.rates?.[displayCurrency] ?? null,
    isLoading: query.isLoading,
    error: query.error,
    isStale: query.data?.stale === true,
    isFallback: query.data?.fallback === true,
    updatedAt: query.data?.fetched_at
      ? new Date(query.data.fetched_at * 1000).toISOString()
      : null,
  }
}
