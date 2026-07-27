/**
 * Central-tendency helpers for the skewed money distributions a ledger produces.
 *
 * Measured on the real 8,181-row ledger: expense mean 796.56 vs median 76.00,
 * and the largest 1% of rows are 56.65% of all spend. So the mean stops
 * describing anything a user would recognise as typical, while still being the
 * only correct number for budget/burn/runway math -- you spend the total, not
 * the median. The rule these helpers support is therefore not "always median":
 * it is keep the statistic the label claims, and disclose the other one when
 * the gap is big enough that a single number misinforms.
 *
 * The 1.2 mean/median ratio is the standard skew diagnostic:
 * https://metricgate.com/blogs/mean-vs-median-when-to-use/
 */

/** Mean/median ratio at or above which one number stops being representative. */
export const SKEW_THRESHOLD = 1.2

/** Median of an unsorted list. Returns 0 for an empty list. */
export function medianOf(values: readonly number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  }
  return sorted[mid]
}

/**
 * How many times the mean exceeds the median, or `null` when the median cannot
 * serve as a denominator: an empty series, or a median of zero, which is what an
 * all-calendar-days spending series looks like (real ledger: 1,389 of 2,769
 * calendar days carry no expense, so the median across every calendar day is 0).
 */
export function skewFactor(mean: number, medianValue: number): number | null {
  if (!Number.isFinite(mean) || !Number.isFinite(medianValue)) return null
  if (medianValue <= 0) return null
  return mean / medianValue
}

/**
 * True when the mean runs far enough above the median that presenting the mean
 * alone would misinform. Deliberately one-sided: spending tails run upward and
 * the copy this gates says the mean is the higher number, which a left-skewed
 * series would make false.
 */
export function isHeavySkew(
  mean: number,
  medianValue: number,
  threshold: number = SKEW_THRESHOLD,
): boolean {
  const factor = skewFactor(mean, medianValue)
  return factor !== null && factor >= threshold
}

/** Render a skew factor for UI copy: "1.4x", "10x". */
export function formatSkewFactor(factor: number): string {
  return factor >= 10 ? `${Math.round(factor)}x` : `${factor.toFixed(1)}x`
}

/** Mean and median of a period series (per-day or per-month totals). */
export interface SeriesShape {
  readonly mean: number
  readonly median: number
}

/**
 * Mean and median of one period series, or `null` for an empty series so
 * callers cannot accidentally render a 0 as a real statistic.
 */
export function seriesShape(values: readonly number[]): SeriesShape | null {
  if (values.length === 0) return null
  const sum = values.reduce((total, value) => total + value, 0)
  return { mean: sum / values.length, median: medianOf(values) }
}

// ─── Subtitle copy ───────────────────────────────────────────────────────────
// Lives here rather than in the card builder so the wording is unit-testable
// against measured numbers, and so one skew rule drives every KPI that shows a
// mean. Each helper returns `fallback` unchanged when the series is not skewed:
// a second number on an unskewed distribution is noise, not disclosure.

/**
 * Subtitle for a rate KPI whose headline is legitimately a mean (daily spend,
 * monthly burn -- runway math needs the total spread over the period, so the
 * median would be the wrong number in the headline). `meanClause` states the
 * denominator plainly; the typical period is appended so the mean cannot be
 * read as a typical one. Returns `meanClause` alone when the median is missing
 * or the series is not skewed enough for a second number to inform.
 */
export function meanRateSubtitle(
  mean: number,
  medianValue: number | null,
  formatMoney: (n: number) => string,
  copy: { readonly meanClause: string; readonly typicalNoun: string },
): string {
  if (medianValue === null || !isHeavySkew(mean, medianValue)) return copy.meanClause
  return `${copy.meanClause}; typical ${copy.typicalNoun} ${formatMoney(medianValue)}`
}

/**
 * Subtitle for a KPI whose headline is a mean with no budget justification
 * (average transaction size). Names it a mean and quotes the typical value it
 * is a multiple of.
 */
export function meanVsTypicalSubtitle(
  mean: number,
  medianValue: number,
  formatMoney: (n: number) => string,
  fallback: string,
): string {
  const factor = skewFactor(mean, medianValue)
  if (factor === null || factor < SKEW_THRESHOLD) return fallback
  return `Mean; ${formatSkewFactor(factor)} the typical ${formatMoney(medianValue)}`
}

/**
 * Subtitle for a KPI whose headline is already the median. Quotes the mean as
 * the absolute amount rather than a ratio -- "the mean is 10.5x higher" is the
 * phrasing that silently turns a 10.5x multiple into an 11.5x claim.
 */
export function typicalVsMeanSubtitle(
  mean: number,
  medianValue: number,
  formatMoney: (n: number) => string,
  copy: { readonly skewed: string; readonly even: string },
): string {
  if (!isHeavySkew(mean, medianValue)) return copy.even
  return `${copy.skewed} ${formatMoney(mean)}`
}
