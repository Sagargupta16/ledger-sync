/**
 * The robust statistics the demo anomaly detectors share, ported from
 * `core/analytics/anomaly_detectors.py`: the month grade (modified Z over
 * median and MAD, the IQR fence when MAD is 0) and the log-space outlier gate
 * for single amounts. Plus the sorted-list helpers the trailing-year window
 * walk uses.
 */

import { medianOf } from '@/lib/distribution'

/** Iglewicz-Hoaglin constant and the NIST cutoff, as the backend's defaults. */
const MZ = 0.6745
const Z_CUTOFF = 3.5

export type Grade = 'high' | 'medium' | null

function mad(values: readonly number[], base: number): number {
  return medianOf(values.map((v) => Math.abs(v - base)))
}

/** Q3 + 1.5 * IQR with Python's default (exclusive) quantile method. */
function upperFence(values: readonly number[]): number | null {
  if (values.length < 4) return null
  const sorted = [...values].sort((a, b) => a - b)
  const quartile = (i: number) => {
    const scaled = (sorted.length + 1) * i
    const j = Math.min(Math.max(Math.floor(scaled / 4), 1), sorted.length - 1)
    const delta = scaled - j * 4
    return (sorted[j - 1] * (4 - delta) + sorted[j] * delta) / 4
  }
  return quartile(3) + 1.5 * (quartile(3) - quartile(1))
}

/** `_grade_month`: modified Z over median + MAD, the IQR fence when MAD is 0. */
export function grade(value: number, window: readonly number[]): Grade {
  const med = medianOf(window)
  const spread = mad(window, med)
  if (spread === 0) {
    const fence = upperFence(window)
    if (fence === null || value <= fence) return null
    return value > med * 2.5 ? 'high' : 'medium'
  }
  const z = (MZ * (value - med)) / spread
  if (z <= Z_CUTOFF) return null
  return z >= Z_CUTOFF * 1.5 ? 'high' : 'medium'
}

/** `_passes_log_dispersion_gate`: an outlier of its own log-amount distribution. */
export function passesLogGate(amount: number, window: readonly number[]): boolean {
  const logs = window.filter((v) => v > 0).map(Math.log)
  if (logs.length === 0) return true
  const med = medianOf(logs)
  const spread = mad(logs, med)
  return spread <= 0 || (MZ * (Math.log(amount) - med)) / spread > Z_CUTOFF
}

/** First index of ascending *sorted* whose value is not below *value*. */
export function lowerBound(sorted: readonly number[], value: number): number {
  let lo = 0
  let hi = sorted.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (sorted[mid] < value) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** `medianOf` for a list already in ascending order (0 for none, like it). */
export function sortedMedian(asc: readonly number[]): number {
  if (asc.length === 0) return 0
  const mid = asc.length >> 1
  return asc.length % 2 === 1 ? asc[mid] : (asc[mid - 1] + asc[mid]) / 2
}
