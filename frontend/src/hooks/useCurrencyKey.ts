import { usePreferencesStore } from '@/store/preferencesStore'

/**
 * Changes whenever formatCurrency's output would: the display currency or its exchange rate.
 * formatCurrency reads both from the store at call time, so a memo that caches formatted text
 * lists this key to rebuild when the user switches currency.
 */
export function useCurrencyKey(): string {
  return usePreferencesStore((state) => `${state.displayCurrency}|${state.exchangeRate}`)
}
