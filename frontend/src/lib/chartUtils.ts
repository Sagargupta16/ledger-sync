/**
 * Shared rolling-average helpers for the monthly trend charts.
 */

/** Rolling-average window shared by every monthly trend chart, in months. */
export const ROLLING_AVG_MONTHS = 3

/**
 * Count the rolling-average points that actually exist on a series.
 *
 * A trailing average is `undefined`/`null` until a full window is behind it, so
 * there are always fewer average points than data points. The caption needs
 * that count: a line needs two defined points, so a single average is drawn
 * as a dot (LineSeries' `showDots: 'auto'`), and the caption must not promise
 * a line that is not there.
 */
export function countRollingAvgPoints<T>(
  series: readonly T[],
  avg: (row: T) => number | null | undefined,
): number {
  return series.filter((row) => avg(row) != null).length
}

/**
 * What a caption may honestly claim about a rolling-average line, given how
 * many average points actually exist.
 *
 * Exactly `windowMonths` complete months is the DEFAULT view on several pages,
 * which is the single-invisible-point case -- so describe what is on screen
 * rather than what the window label implies.
 */
export function rollingAvgCaption(pointCount: number, windowMonths: number): string {
  if (pointCount === 0) {
    return `A ${windowMonths}-month rolling average needs ${windowMonths} completed months, so none is drawn yet.`
  }
  if (pointCount === 1) {
    return `Only one ${windowMonths}-month average exists so far, so it is marked as a point rather than a line.`
  }
  return `Rolling average uses a ${windowMonths}-month window and spans the last ${pointCount} months.`
}
