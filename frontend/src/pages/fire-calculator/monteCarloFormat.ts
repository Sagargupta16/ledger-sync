import { formatPercent } from '@/lib/formatters'

/**
 * A share of simulated runs as a whole percent. A few thousand runs cannot
 * support a decimal (a new seed moves it), and a share that is not exactly 0 or
 * 1 never rounds to either end: 99.96% reads >99%, not 100%.
 */
export function formatRunShare(share: number): string {
  if (share > 0 && share < 0.01) return `<${formatPercent(1, false, 0)}`
  if (share > 0.99 && share < 1) return `>${formatPercent(99, false, 0)}`
  return formatPercent(share * 100, false, 0)
}

/**
 * How far sampling alone can move a success rate: the 95% margin of a share
 * estimated from `runs` runs, in percentage points. Null at 0 or 1, where the
 * binomial estimate says nothing useful.
 */
export function samplingMarginPoints(share: number, runs: number): number | null {
  if (share <= 0 || share >= 1 || runs <= 0) return null
  return 1.96 * Math.sqrt((share * (1 - share)) / runs) * 100
}
