/**
 * The ONE recurrence-frequency table for the whole app.
 *
 * Every surface that turns a recurrence frequency into a period count, a
 * monthly cost, an annual cost, or a calendar expansion reads from here.
 * Before this module existed the same table was re-typed per page and each
 * copy disagreed: the subscription tracker had no `daily` row, the analytics
 * adapter keyed the map by UPPERCASE, and the bill calendar had no all-days
 * branch. A `daily` subscription was therefore costed as MONTHLY -- a ~30x
 * understatement -- and never rendered on the calendar at all.
 *
 * Two tables, both keyed by `RecurrenceFrequency`, so TypeScript refuses to
 * compile a new frequency until BOTH are filled in. That is the property that
 * keeps a future `DAILY`-shaped hole from reopening.
 *
 * Day-count convention: 365, matching the backend's own recurrence table in
 * `api/analytics_v2_impl/recurring.py` (`daily: 1 ... yearly: 365`). The
 * 365.25 constants in `dateUtils` are deliberately NOT used here -- they are
 * scoped to annualized-return math (XIRR) and to spreading a fractional month
 * over days, neither of which is a recurrence period count.
 */

/**
 * The frequency values the backend can emit, verbatim and in the backend's own
 * lowercase casing (`db/_models/enums.py: RecurrenceFrequency`).
 *
 * Detection (`core/analytics/recurring.py: _FREQ_BANDS`) emits seven of these;
 * `daily` additionally reaches the API through the manual create and the
 * frequency PATCH, both of which accept it (`_VALID_FREQUENCIES`).
 */
export const RECURRENCE_FREQUENCIES = [
  'daily',
  'weekly',
  'biweekly',
  'monthly',
  'bimonthly',
  'quarterly',
  'semiannual',
  'yearly',
] as const

export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number]

/** Days in a year for recurrence period counts. */
export const DAYS_PER_YEAR = 365

/**
 * Non-enum spellings the per-page tables used to accept. Kept so replacing
 * those tables does not silently narrow what resolves, and resolved centrally
 * so no call site has to know about them.
 */
const FREQUENCY_ALIASES: Readonly<Record<string, RecurrenceFrequency>> = {
  fortnightly: 'biweekly',
  annually: 'yearly',
}

/** Occurrences per year. The money table. */
const PERIODS_PER_YEAR: Readonly<Record<RecurrenceFrequency, number>> = {
  daily: DAYS_PER_YEAR,
  weekly: 52,
  biweekly: 26,
  monthly: 12,
  bimonthly: 6,
  quarterly: 4,
  semiannual: 2,
  yearly: 1,
}

/**
 * How far apart two occurrences are. The calendar table.
 *
 * `day` strides walk a fixed number of days from an anchor date; `month`
 * strides land on the same day-of-month every N months. They are different
 * kinds of step, which is why this is not derivable from `PERIODS_PER_YEAR`.
 */
export type RecurrenceCadence =
  | { readonly unit: 'day'; readonly stride: number }
  | { readonly unit: 'month'; readonly stride: number }

const CADENCE: Readonly<Record<RecurrenceFrequency, RecurrenceCadence>> = {
  daily: { unit: 'day', stride: 1 },
  weekly: { unit: 'day', stride: 7 },
  biweekly: { unit: 'day', stride: 14 },
  monthly: { unit: 'month', stride: 1 },
  bimonthly: { unit: 'month', stride: 2 },
  quarterly: { unit: 'month', stride: 3 },
  semiannual: { unit: 'month', stride: 6 },
  yearly: { unit: 'month', stride: 12 },
}

const MONTHS_IN_YEAR = PERIODS_PER_YEAR.monthly

function isRecurrenceFrequency(value: string): value is RecurrenceFrequency {
  return (RECURRENCE_FREQUENCIES as readonly string[]).includes(value)
}

/**
 * Resolve any stored/user-entered frequency to a canonical value.
 *
 * Casing is normalized HERE, once. Call sites must not pre-`toLowerCase()` or
 * `toUpperCase()` -- two different pre-normalizations in two files is exactly
 * how the maps drifted apart.
 *
 * Returns `null` for absent or unrecognized input so callers can pick their own
 * fallback instead of inheriting a silent one.
 */
export function normalizeFrequency(frequency: string | null | undefined): RecurrenceFrequency | null {
  if (!frequency) return null
  const key = frequency.trim().toLowerCase()
  if (isRecurrenceFrequency(key)) return key
  return FREQUENCY_ALIASES[key] ?? null
}

/**
 * Occurrences per year for a frequency.
 *
 * Unknown input falls back to 12 (monthly) to match the historical behaviour of
 * the per-page tables this replaced. `daily` is a real row now, so the fallback
 * is no longer load-bearing for it.
 */
export function periodsPerYear(frequency: string | null | undefined): number {
  const normalized = normalizeFrequency(frequency)
  return normalized ? PERIODS_PER_YEAR[normalized] : MONTHS_IN_YEAR
}

/** Convert an amount charged at `frequency` into its monthly equivalent. */
export function toMonthlyAmount(amount: number, frequency: string | null | undefined): number {
  return (Math.abs(amount) * periodsPerYear(frequency)) / MONTHS_IN_YEAR
}

/** Interval between two occurrences, or `null` for unrecognized input. */
export function recurrenceCadence(frequency: string | null | undefined): RecurrenceCadence | null {
  const normalized = normalizeFrequency(frequency)
  return normalized ? CADENCE[normalized] : null
}
