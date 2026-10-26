/**
 * Intl formatters, built once and reused. `toLocaleString(locale, options)` and
 * `toLocaleDateString` build a new ICU formatter on every call, 25-45x the cost
 * of reusing one (Node 26, 2026-10-26), and every amount and date label passes
 * through here on each render. Keyed by value, not identity, because callers
 * pass fresh option literals.
 */

const numberFormats = new Map<string, Intl.NumberFormat>()
const dateFormats = new Map<string, Intl.DateTimeFormat>()

/** The formatter stored under `key`, built by `build` the first time. */
function cached<F>(cache: Map<string, F>, key: string, build: () => F): F {
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  const built = build()
  cache.set(key, built)
  return built
}

/**
 * The device time zone's offsets in January and July plus today's. A date formatter keeps the
 * zone it was built in, so a device that moves to a zone with a different offset or DST pattern
 * mid-session gets a fresh formatter instead of one that prints dates a day off.
 */
function zoneSignature(): string {
  const now = new Date()
  const year = now.getFullYear()
  return `${new Date(year, 0, 1).getTimezoneOffset()}|${new Date(year, 6, 1).getTimezoneOffset()}|${now.getTimezoneOffset()}`
}

export function numberFormat(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  return cached(numberFormats, `${locale}|${JSON.stringify(options)}`, () => new Intl.NumberFormat(locale, options))
}

/**
 * A reused `Intl.DateTimeFormat`. Differs from `toLocaleDateString` only when the options name
 * no date field: a time-only bag prints the time alone, and `timeStyle` alone no longer throws.
 */
export function dateFormat(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  return cached(dateFormats, `${locale}|${zoneSignature()}|${JSON.stringify(options)}`,
    () => new Intl.DateTimeFormat(locale, options))
}
