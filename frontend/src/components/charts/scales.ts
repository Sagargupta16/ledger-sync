/**
 * Scale math for the in-house chart kit. Pure functions, no DOM: a linear
 * value scale with "nice" ticks, and a category scale that serves both bar
 * bands and line/area points.
 */

export interface LinearScale {
  (value: number): number
  readonly domain: readonly [number, number]
  readonly range: readonly [number, number]
  invert: (pixel: number) => number
  ticks: (count?: number) => number[]
}

/** 1, 2 or 5 times a power of ten, the step d3 and most axes settle on. */
export function tickStep(min: number, max: number, count: number): number {
  const raw = Math.abs(max - min) / Math.max(1, count)
  if (!Number.isFinite(raw) || raw === 0) return 1
  const power = 10 ** Math.floor(Math.log10(raw))
  const error = raw / power
  if (error >= 7.07) return power * 10
  if (error >= 3.16) return power * 5
  if (error >= 1.41) return power * 2
  return power
}

/** Widen a degenerate or reversed domain so the scale never divides by zero. */
function safeDomain([min, max]: readonly [number, number]): [number, number] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1]
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1
    return [min - pad, max + pad]
  }
  return min < max ? [min, max] : [max, min]
}

/** Extend a domain outward to tick boundaries. */
export function niceDomain(domain: readonly [number, number], count = 5): [number, number] {
  const [min, max] = safeDomain(domain)
  const step = tickStep(min, max, count)
  return [Math.floor(min / step) * step, Math.ceil(max / step) * step]
}

export function linearScale(
  domain: readonly [number, number],
  range: readonly [number, number],
  { nice = true, tickCount = 5 }: { nice?: boolean; tickCount?: number } = {},
): LinearScale {
  const [d0, d1] = nice ? niceDomain(domain, tickCount) : safeDomain(domain)
  const [r0, r1] = range
  const ratio = (r1 - r0) / (d1 - d0)
  const scale = ((value: number) => r0 + (value - d0) * ratio) as LinearScale
  return Object.assign(scale, {
    domain: [d0, d1] as const,
    range: [r0, r1] as const,
    invert: (pixel: number) => d0 + (pixel - r0) / ratio,
    ticks: (count = tickCount) => {
      const step = tickStep(d0, d1, count)
      const first = Math.ceil(d0 / step)
      const last = Math.floor(d1 / step)
      // Rounding to the step's precision keeps 0.30000000000000004 off the axis.
      const digits = Math.max(0, -Math.floor(Math.log10(step)))
      return Array.from({ length: last - first + 1 }, (_, index) =>
        Number(((first + index) * step).toFixed(digits)),
      )
    },
  })
}

export interface CategoryScale {
  readonly keys: readonly string[]
  /** Distance between neighbouring categories. */
  readonly step: number
  /** Width of one bar band; 0 for a point scale. */
  readonly bandwidth: number
  /** Leading edge of category `index`'s band. */
  start: (index: number) => number
  /** Middle of category `index`, where lines, dots and tooltips anchor. */
  center: (index: number) => number
  /** Nearest category for a pixel offset, clamped to the data. */
  indexAt: (pixel: number) => number
}

/**
 * `band` spaces bars with inner and outer padding (fractions of a step);
 * `point` puts the first and last category on the range edges, like a
 * time-series axis.
 */
export function categoryScale(
  keys: readonly string[],
  [r0, r1]: readonly [number, number],
  {
    kind = 'band',
    paddingInner = 0.24,
    paddingOuter = 0.12,
  }: { kind?: 'band' | 'point'; paddingInner?: number; paddingOuter?: number } = {},
): CategoryScale {
  const count = keys.length
  const span = r1 - r0
  if (kind === 'point') {
    const step = count > 1 ? span / (count - 1) : 0
    const center = (index: number) => (count > 1 ? r0 + index * step : r0 + span / 2)
    return {
      keys,
      step,
      bandwidth: 0,
      start: center,
      center,
      indexAt: (pixel) => clampIndex(step > 0 ? Math.round((pixel - r0) / step) : 0, count),
    }
  }
  const step = span / Math.max(1, count - paddingInner + paddingOuter * 2)
  const bandwidth = step * (1 - paddingInner)
  const offset = r0 + step * paddingOuter
  const start = (index: number) => offset + index * step
  return {
    keys,
    step,
    bandwidth,
    start,
    center: (index) => start(index) + bandwidth / 2,
    indexAt: (pixel) => clampIndex(Math.floor((pixel - offset + (step - bandwidth) / 2) / step), count),
  }
}

function clampIndex(index: number, count: number): number {
  return Math.max(0, Math.min(count - 1, index))
}
