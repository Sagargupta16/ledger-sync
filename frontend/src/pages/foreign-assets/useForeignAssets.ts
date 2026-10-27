import { useMemo, useState } from 'react'

import { useFastDs, useForeignAssetLots, useScheduleFa } from '@/hooks/api/useRsuTax'
import { useDemoStore } from '@/store/demoStore'

/** Calendar years from the first lot to now, newest first. */
function calendarYears(firstYear: number | null, currentYear: number): number[] {
  if (firstYear == null || currentYear < firstYear) return []
  return Array.from({ length: currentYear - firstYear + 1 }, (_, index) => currentYear - index)
}

/**
 * Page state for Foreign Assets: the lot ledger loads first (database only),
 * then Schedule FA for the chosen calendar year and the FAST-DS valuation,
 * which both wait on market data.
 */
export function useForeignAssets() {
  const isDemoMode = useDemoStore((state) => state.isDemoMode)
  const lots = useForeignAssetLots()
  const currentYear = lots.data?.current_year ?? 0
  const years = useMemo(
    () => calendarYears(lots.data?.first_year ?? null, currentYear),
    [lots.data?.first_year, currentYear],
  )
  const [pickedYear, setYear] = useState<number | null>(null)
  // The last complete calendar year is the one a return is usually being filed for.
  const defaultYear = years.find((year) => year < currentYear) ?? years[0] ?? null
  const year = pickedYear != null && years.includes(pickedYear) ? pickedYear : defaultYear
  const hasLots = (lots.data?.lots.length ?? 0) > 0
  const schedule = useScheduleFa(hasLots ? year : null)
  const fastDs = useFastDs(hasLots)

  return { isDemoMode, lots, years, year, setYear, hasLots, schedule, fastDs }
}

export type ForeignAssetsModel = ReturnType<typeof useForeignAssets>
