/**
 * Net-worth milestone detection + projection helpers.
 *
 * All three views (milestones table, ETA rows, chart projection overlay)
 * share ONE "current" value and ONE growth rate so the numbers stay
 * self-consistent. Anchor: the last point of the historical series that
 * the chart itself is rendering.
 *
 * Every future date is stepped with `addMonthsToKey`, never `setUTCMonth`.
 * The anchor is the last day of the user's selected window, which lands on day
 * 29-31 for most period choices, and `setUTCMonth` overflows those into the
 * following month -- so the overlay skipped calendar months and stacked two
 * points on others.
 */

import {
  computeNetWorthMilestoneProgress,
  type NetWorthMilestoneProgress,
  type NetWorthPoint,
} from '@/lib/finance/netWorth'

export {
  computeAvgMonthlyGrowth,
  computeLinearGrowthStats,
  projectNetWorth,
  projectNetWorthLinearBand,
} from '@/lib/finance/netWorth'
export type {
  NetWorthMilestoneStatus as MilestoneStatus,
  NetWorthPoint,
  NetWorthProjectionBandPoint,
} from '@/lib/finance/netWorth'

export interface Milestone {
  /** Target threshold in base currency (INR). */
  value: number
  /** Human label like "₹1L" / "₹1Cr". */
  label: string
}

export type MilestoneRow = Milestone & NetWorthMilestoneProgress

/** Format a rupee amount as a short Indian milestone label: ₹50k, ₹5L, ₹1.5Cr. */
export function formatMilestoneLabel(value: number): string {
  if (value >= 10_000_000) {
    const cr = value / 10_000_000
    return `₹${Number.isInteger(cr) ? cr : Number(cr.toFixed(1))}Cr`
  }
  // Below ₹1L, thousands read more naturally than a fractional lakh (₹50k, not ₹0.5L).
  if (value < 100_000) {
    return `₹${Math.round(value / 1_000)}k`
  }
  const lakh = value / 100_000
  return `₹${Number.isInteger(lakh) ? lakh : Number(lakh.toFixed(1))}L`
}

/**
 * Tiered milestone thresholds for an Indian-rupee net-worth context.
 *
 * Early rungs are close together so a new saver sees frequent wins, then the
 * step widens as values grow -- granular where thresholds are actually crossed,
 * without exploding into hundreds of rows at the top:
 *   - first rungs  : ₹50k, ₹1L, ₹2L (early-saver wins)
 *   - up to ₹1Cr   : every ₹5L   (₹5L, ₹10L, ... ₹95L, ₹1Cr)
 *   - ₹1Cr - ₹5Cr  : every ₹25L
 *   - ₹5Cr and up  : every ₹1Cr
 *
 * The full ladder runs to ₹10Cr; callers window it (achieved history + the
 * next few upcoming) so the far-future rows never render as noise.
 */
function generateMilestones(): Milestone[] {
  const values: number[] = [50_000, 100_000, 200_000] // early-saver rungs
  for (let v = 500_000; v < 10_000_000; v += 500_000) values.push(v) // ₹5L step to <₹1Cr
  for (let v = 10_000_000; v < 50_000_000; v += 2_500_000) values.push(v) // ₹25L step ₹1Cr-₹5Cr
  for (let v = 50_000_000; v <= 100_000_000; v += 10_000_000) values.push(v) // ₹1Cr step to ₹10Cr
  return values.map((value) => ({ value, label: formatMilestoneLabel(value) }))
}

export const DEFAULT_MILESTONES: readonly Milestone[] = generateMilestones()

/**
 * Default number of upcoming milestones to surface. Achieved milestones are
 * always kept (they're history); only the FUTURE list is capped so the table
 * doesn't show a "₹10Cr in 72 years" row.
 */
export const DEFAULT_UPCOMING_WINDOW = 6

/**
 * Downsample a daily series to one point per month (the LAST point per month).
 * Used when the chart needs to show historical + projected together at the
 * same monthly resolution so the x-axis doesn't visually stretch the future.
 */
export function downsampleToMonthly(
  series: readonly NetWorthPoint[],
): NetWorthPoint[] {
  if (series.length === 0) return []
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date))
  const byMonth: Record<string, NetWorthPoint> = {}
  for (const p of sorted) {
    byMonth[p.date.substring(0, 7)] = p
  }
  return Object.keys(byMonth)
    .sort((a, b) => a.localeCompare(b))
    .map((m) => byMonth[m])
}

/**
 * Build a SINGLE unified list of milestones with status + date + distance,
 * consistent with the anchor + growth rate used by the chart overlay.
 *
 * - achieved: rows whose value was ever crossed by the series (ALL kept -- they
 *   are history).
 * - upcoming: rows whose value is above the anchor's net worth. ETA is
 *   anchor.date + (value - anchor.netWorth) / monthlyGrowth months. Omitted
 *   from the upcoming set when growth <= 0. Capped to ``upcomingWindow`` so the
 *   table shows the next few reachable targets, not a "₹10Cr in 72 years" row.
 */
export function buildMilestoneRows(
  series: readonly NetWorthPoint[],
  anchor: NetWorthPoint | null,
  monthlyGrowth: number,
  milestones: readonly Milestone[] = DEFAULT_MILESTONES,
  upcomingWindow: number = DEFAULT_UPCOMING_WINDOW,
): MilestoneRow[] {
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date))
  const rows: MilestoneRow[] = milestones.map((m) => ({
    ...m,
    ...computeNetWorthMilestoneProgress(sorted, anchor, monthlyGrowth, m.value),
  }))

  // Keep ALL achieved rows (history); cap the upcoming rows to the nearest
  // ``upcomingWindow`` so far-future thresholds don't clutter the table.
  const achieved = rows.filter((r) => r.status === 'achieved')
  const upcoming = rows
    .filter((r) => r.status === 'upcoming')
    .sort((a, b) => a.value - b.value)
    .slice(0, Math.max(0, upcomingWindow))

  // Sort the combined set by value so the table reads low-to-high.
  return [...achieved, ...upcoming].sort((a, b) => a.value - b.value)
}
