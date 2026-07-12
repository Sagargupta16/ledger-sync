/**
 * Net-worth milestone detection + projection helpers.
 *
 * All three views (milestones table, ETA rows, chart projection overlay)
 * share ONE "current" value and ONE growth rate so the numbers stay
 * self-consistent. Anchor: the last point of the historical series that
 * the chart itself is rendering.
 */

export interface NetWorthPoint {
  date: string
  netWorth: number
}

export interface Milestone {
  /** Target threshold in base currency (INR). */
  value: number
  /** Human label like "₹1L" / "₹1Cr". */
  label: string
}

export type MilestoneStatus = 'achieved' | 'upcoming'

export interface MilestoneRow extends Milestone {
  status: MilestoneStatus
  /** ISO date YYYY-MM-DD. For 'achieved' = when it was crossed. For 'upcoming' = ETA. */
  date: string | null
  /**
   * For 'achieved': days elapsed from series start to this crossing.
   * For 'upcoming': months away from the anchor date (can be fractional).
   */
  distance: number | null
  /**
   * ISO date YYYY-MM-DD from which net worth never dropped back below this
   * milestone value. `null` when the row is upcoming, or when net worth has
   * dipped below the threshold after the most recent crossing and is still
   * below at the anchor. When the milestone was crossed once and never dipped,
   * equals the `date` field.
   */
  stableSince: string | null
}

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
 * Compute average monthly net-worth change over the last ``lookbackMonths``.
 * Returns 0 if there's not enough data.
 *
 * This LINEAR model is deliberate: the net-worth series is built from
 * cumulative cash flows (income - expense), i.e. BOOK VALUE -- there is no
 * market-price feed. A flow-accumulation series grows by roughly "what you
 * save each month", not exponentially, so extrapolating it with a compound
 * rate treats savings as an asset return and explodes (a real-data audit
 * measured a geometric fit projecting ₹28 Cr in 5 years where the linear
 * trend gives ~₹0.9 Cr). If a market-value feed ever lands, a compound model
 * belongs on THAT series -- not on this one.
 */
export function computeAvgMonthlyGrowth(
  series: readonly NetWorthPoint[],
  lookbackMonths = 12,
): number {
  if (series.length < 2) return 0
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date))

  // Bucket by month, keep last point per month (end-of-month net worth)
  const monthlyLast: Record<string, number> = {}
  for (const point of sorted) {
    const month = point.date.substring(0, 7)
    monthlyLast[month] = point.netWorth
  }

  const months = Object.keys(monthlyLast).sort((a, b) => a.localeCompare(b))
  if (months.length < 2) return 0

  const windowMonths = months.slice(-Math.max(2, lookbackMonths + 1))
  const deltas: number[] = []
  for (let i = 1; i < windowMonths.length; i++) {
    deltas.push(monthlyLast[windowMonths[i]] - monthlyLast[windowMonths[i - 1]])
  }
  if (deltas.length === 0) return 0
  return deltas.reduce((sum, d) => sum + d, 0) / deltas.length
}

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
 * Project future monthly net-worth points from ``anchor`` at a constant
 * ABSOLUTE monthly delta (linear extrapolation).
 *
 * The anchor's own ``date`` is not included in the output; the first projected
 * point is one month after the anchor.
 */
export function projectNetWorth(
  anchor: NetWorthPoint,
  monthlyGrowth: number,
  horizonMonths = 60,
): NetWorthPoint[] {
  if (horizonMonths <= 0) return []
  const points: NetWorthPoint[] = []
  const start = new Date(anchor.date)
  start.setUTCHours(0, 0, 0, 0)
  for (let i = 1; i <= horizonMonths; i++) {
    const d = new Date(start)
    d.setUTCMonth(d.getUTCMonth() + i)
    points.push({
      date: d.toISOString().substring(0, 10),
      netWorth: anchor.netWorth + monthlyGrowth * i,
    })
  }
  return points
}

/**
 * Compute the average monthly net-worth change AND the standard deviation of
 * the individual monthly deltas over the last ``lookbackMonths``.
 *
 * - ``growth``: same value ``computeAvgMonthlyGrowth`` returns. Rupees/month.
 * - ``sigma``: sample stddev (n-1 denominator) of the monthly deltas. Used by
 *   ``projectNetWorthLinearBand`` to widen the band as sqrt(time) -- the
 *   correct scaling when each month adds an independent savings delta.
 *
 * Returns ``{growth: 0, sigma: 0}`` when fewer than 3 month-end points are
 * available (need at least 2 monthly deltas to have any variance).
 */
export function computeLinearGrowthStats(
  series: readonly NetWorthPoint[],
  lookbackMonths = 12,
): { growth: number; sigma: number } {
  if (series.length < 3) return { growth: 0, sigma: 0 }
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date))

  const monthlyLast: Record<string, number> = {}
  for (const point of sorted) {
    monthlyLast[point.date.substring(0, 7)] = point.netWorth
  }

  const months = Object.keys(monthlyLast).sort((a, b) => a.localeCompare(b))
  if (months.length < 3) return { growth: 0, sigma: 0 }

  const windowMonths = months.slice(-Math.max(3, lookbackMonths + 1))
  const deltas: number[] = []
  for (let i = 1; i < windowMonths.length; i++) {
    deltas.push(monthlyLast[windowMonths[i]] - monthlyLast[windowMonths[i - 1]])
  }
  if (deltas.length < 2) return { growth: 0, sigma: 0 }

  const growth = deltas.reduce((sum, d) => sum + d, 0) / deltas.length
  const variance =
    deltas.reduce((sum, d) => sum + (d - growth) ** 2, 0) / (deltas.length - 1)
  return { growth, sigma: Math.sqrt(variance) }
}

/** A single projected point with a 1-stddev confidence band. */
export interface NetWorthProjectionBandPoint {
  date: string
  mean: number
  upper: number
  lower: number
}

/**
 * Project future monthly net worth with a 1-sigma confidence band under a
 * random-walk-with-drift model (linear trend, additive noise).
 *
 * For month ``n`` after the anchor:
 *   mean  = anchor + monthlyGrowth * n
 *   upper = mean + sigma * sqrt(n)
 *   lower = mean - sigma * sqrt(n)
 *
 * The sqrt(n) scaling is the correct uncertainty-grows-with-time behaviour
 * when each month contributes an independent delta: roughly 68 % of plausible
 * trajectories fall within the band, and the band widens further out (the
 * projection is confident next month, less confident in 5 years).
 *
 * When ``sigma <= 0`` the band collapses to the mean (visually a single line).
 */
export function projectNetWorthLinearBand(
  anchor: NetWorthPoint,
  monthlyGrowth: number,
  sigma: number,
  horizonMonths = 60,
): NetWorthProjectionBandPoint[] {
  if (horizonMonths <= 0) return []
  const points: NetWorthProjectionBandPoint[] = []
  const start = new Date(anchor.date)
  start.setUTCHours(0, 0, 0, 0)
  for (let i = 1; i <= horizonMonths; i++) {
    const d = new Date(start)
    d.setUTCMonth(d.getUTCMonth() + i)
    const mean = anchor.netWorth + monthlyGrowth * i
    const halfBand = sigma > 0 ? sigma * Math.sqrt(i) : 0
    points.push({
      date: d.toISOString().substring(0, 10),
      mean,
      upper: mean + halfBand,
      lower: mean - halfBand,
    })
  }
  return points
}

/** First-crossing scan: returns value -> ISO date for every milestone reached. */
function scanAchievements(
  series: readonly NetWorthPoint[],
  milestones: readonly Milestone[],
): Map<number, string> {
  const achieved = new Map<number, string>()
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date))
  const remaining = new Set(milestones.map((m) => m.value))
  for (const point of sorted) {
    if (remaining.size === 0) break
    for (const m of milestones) {
      if (remaining.has(m.value) && point.netWorth >= m.value) {
        achieved.set(m.value, point.date.substring(0, 10))
        remaining.delete(m.value)
      }
    }
  }
  return achieved
}

/**
 * Find the date from which net worth never dropped below `target`.
 *
 * Scans from the end backward: finds the last index where value < target.
 * - If no such index exists: stable since the first crossing.
 * - If that index is the final point: not stable (still below).
 * - Otherwise: stable since the crossing that immediately follows that dip.
 */
function findStableSince(
  sortedSeries: readonly NetWorthPoint[],
  target: number,
  firstCrossing: string,
): string | null {
  if (sortedSeries.length === 0) return null

  // Find last index where value is below target
  let lastBelowIndex = -1
  for (let i = sortedSeries.length - 1; i >= 0; i--) {
    if (sortedSeries[i].netWorth < target) {
      lastBelowIndex = i
      break
    }
  }

  // Never dipped below target -> stable from first crossing
  if (lastBelowIndex === -1) return firstCrossing

  // Currently below target -> not stable
  if (lastBelowIndex === sortedSeries.length - 1) return null

  // Stable from the first point after the last dip that's >= target
  for (let i = lastBelowIndex + 1; i < sortedSeries.length; i++) {
    if (sortedSeries[i].netWorth >= target) {
      return sortedSeries[i].date.substring(0, 10)
    }
  }
  return null
}

function buildUpcomingRow(
  m: Milestone,
  anchor: NetWorthPoint,
  monthlyGrowth: number,
): MilestoneRow {
  if (monthlyGrowth <= 0 || m.value <= anchor.netWorth) {
    return { ...m, status: 'upcoming', date: null, distance: null, stableSince: null }
  }
  const monthsAway = (m.value - anchor.netWorth) / monthlyGrowth
  const eta = new Date(anchor.date)
  eta.setUTCDate(eta.getUTCDate() + Math.round(monthsAway * 30.44))
  return {
    ...m,
    status: 'upcoming',
    date: eta.toISOString().substring(0, 10),
    distance: Math.round(monthsAway * 10) / 10,
    stableSince: null,
  }
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
  if (series.length === 0 || anchor === null) {
    // No history yet: show the first ``upcomingWindow`` targets as a preview.
    return [...milestones]
      .sort((a, b) => a.value - b.value)
      .slice(0, Math.max(0, upcomingWindow))
      .map((m) => ({
        ...m,
        status: 'upcoming',
        date: null,
        distance: null,
        stableSince: null,
      }))
  }

  const achievedDate = scanAchievements(series, milestones)
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date))
  const startDate = new Date(sorted[0].date)

  const rows: MilestoneRow[] = milestones.map((m) => {
    const dateStr = achievedDate.get(m.value)
    if (dateStr !== undefined) {
      const daysFromStart = Math.max(
        0,
        Math.round((new Date(dateStr).getTime() - startDate.getTime()) / 86_400_000),
      )
      return {
        ...m,
        status: 'achieved' as const,
        date: dateStr,
        distance: daysFromStart,
        stableSince: findStableSince(sorted, m.value, dateStr),
      }
    }
    return buildUpcomingRow(m, anchor, monthlyGrowth)
  })

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
