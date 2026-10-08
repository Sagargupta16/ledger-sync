import { useSyncExternalStore } from 'react'

import { getRawColorsVersion, subscribeRawColorsVersion } from '@/constants/colors'

const snapshots = new WeakMap<object, { version: number; value: object }>()

/**
 * Copy of an in-place-refreshed palette (`rawColors.app`, `CHART_COLORS`,
 * `INCOME_CATEGORY_COLORS`, ...) whose identity changes on every theme toggle.
 *
 * Palettes keep one identity on purpose, so a `useMemo` that reads one directly
 * never re-runs and keeps painting the load-time theme. Read the snapshot inside
 * the memo and list it as a dependency instead. The calling component also
 * re-renders on a toggle, even under a memoized parent.
 */
export function usePaletteSnapshot<T extends object | undefined>(palette: T): T {
  const version = useSyncExternalStore(subscribeRawColorsVersion, getRawColorsVersion)
  if (palette === undefined) return palette
  const cached = snapshots.get(palette)
  if (cached?.version === version) return cached.value as T
  const value = (Array.isArray(palette) ? [...palette] : { ...palette }) as T & object
  snapshots.set(palette, { version, value })
  return value
}
