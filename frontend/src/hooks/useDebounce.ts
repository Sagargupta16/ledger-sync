import { useEffect, useState } from 'react'

/**
 * Debounce a changing value: returns the latest value only after it has been
 * stable for `delay` ms. The standard rate control for type-ahead inputs that
 * feed network requests -- unlike `useDeferredValue`, which only defers
 * re-rendering and does not coalesce fetches.
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debouncedValue
}
