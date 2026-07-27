/**
 * Baseline reference line -- the "is this bar actually unusual?" framing that
 * bar charts otherwise lack (they plot the series and stop).
 *
 * Kept out of `chartDefaults` so that module stays a styling-tokens file.
 */

import { formatCurrencyShort } from '@/lib/formatters'

import { referenceLine, type ReferenceLineVariant } from './chartDefaults'

/**
 * Median of a numeric sample. Even-length samples average the two middle
 * values. Non-finite entries are ignored; an empty sample returns 0.
 *
 * Median rather than mean because financial series are spiky by nature -- one
 * annual insurance premium or a bonus month drags a mean baseline far enough
 * that "unusual" stops meaning anything.
 */
export function median(values: readonly number[]): number {
  const clean = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b)
  if (clean.length === 0) return 0
  const mid = Math.floor(clean.length / 2)
  return clean.length % 2 === 1 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2
}

/** Mean of a numeric sample, ignoring non-finite entries. 0 for an empty sample. */
function mean(values: readonly number[]): number {
  const clean = values.filter((v) => Number.isFinite(v))
  if (clean.length === 0) return 0
  return clean.reduce((sum, v) => sum + v, 0) / clean.length
}

export interface BaselineOptions {
  /**
   * How many points to summarize, counted from the END of the series. Omit to
   * use every point.
   *
   * Only pass a window when the series is chronological -- then it reads as
   * "typical recent period" instead of an all-time figure that stale history
   * skews. For cyclical buckets (day-of-week, month-of-year) the order is not a
   * timeline, so a window would summarize an arbitrary slice; leave it unset.
   */
  window?: number
  /** `'median'` (default, outlier-resistant) or `'mean'`. */
  statistic?: 'median' | 'mean'
}

function statOf(values: readonly number[], statistic: 'median' | 'mean'): number {
  return statistic === 'mean' ? mean(values) : median(values)
}

/**
 * A `<ReferenceLine>` at the median (or mean) of a series -- "here's normal"
 * drawn across the plot, so the tall bars read as significant rather than just
 * tall. Returns `null` when there is nothing to summarize (Recharts renders that
 * as nothing).
 *
 * Consumed by `StandardBarChart`'s `baseline` prop; prefer that to calling this
 * directly.
 *
 * @param options.label - On-line label prefix. Defaults to `Median`/`Avg` per statistic.
 * @param options.format - Label value formatter. Defaults to `formatCurrencyShort`.
 */
export function baselineLine<T>(
  rows: readonly T[],
  valueOf: (row: T) => number,
  options?: BaselineOptions & {
    label?: string
    format?: (value: number) => string
    variant?: ReferenceLineVariant
  },
) {
  const window = options?.window
  const scoped = window === undefined ? rows : rows.slice(-Math.max(1, window))
  const statistic = options?.statistic ?? 'median'
  const values = scoped.map(valueOf).filter((v) => Number.isFinite(v))
  if (values.length === 0) return null

  const y = statOf(values, statistic)
  const format = options?.format ?? formatCurrencyShort
  const prefix = options?.label ?? (statistic === 'mean' ? 'Avg' : 'Median')
  return referenceLine({
    y,
    label: `${prefix}: ${format(y)}`,
    variant: options?.variant ?? 'avg',
  })
}
