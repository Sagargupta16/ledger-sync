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

/**
 * Default milestones for an Indian-rupee net-worth context.
 * Hand-picked round numbers; could be preference-driven later.
 */
export const DEFAULT_MILESTONES: readonly Milestone[] = [
  { value: 100_000, label: '₹1L' },
  { value: 500_000, label: '₹5L' },
  { value: 1_000_000, label: '₹10L' },
  { value: 2_500_000, label: '₹25L' },
  { value: 5_000_000, label: '₹50L' },
  { value: 10_000_000, label: '₹1Cr' },
  { value: 25_000_000, label: '₹2.5Cr' },
  { value: 50_000_000, label: '₹5Cr' },
  { value: 100_000_000, label: '₹10Cr' },
] as const

/**
 * Compute the monthly COMPOUND growth rate over the last `lookbackMonths`
 * (as a decimal -- 0.01 means 1 % per month).
 *
 * Uses the geometric mean of month-end net worth over the window:
 *     r = (end / start)^(1 / n) - 1
 *
 * Returns 0 when:
 *   - fewer than 2 month-end points in the window
 *   - start net worth <= 0 (compound growth is undefined from zero / negative)
 *   - end net worth <= 0
 *
 * This is the correct model for an investing/saving user because savings + asset
 * growth both compound. The earlier linear model (`computeAvgMonthlyGrowth`)
 * dramatically underestimates time-to-target for users with returns -- a ₹50L
 * portfolio growing at 12 % annualized reaches ₹1Cr in ~6 years by compound,
 * but ~17 years by linear extrapolation of the recent monthly delta.
 */
export function computeMonthlyGrowthRate(
  series: readonly NetWorthPoint[],
  lookbackMonths = 12,
): number {
  if (series.length < 2) return 0
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date))

  const monthlyLast: Record<string, number> = {}
  for (const point of sorted) {
    monthlyLast[point.date.substring(0, 7)] = point.netWorth
  }

  const months = Object.keys(monthlyLast).sort((a, b) => a.localeCompare(b))
  if (months.length < 2) return 0

  const windowMonths = months.slice(-Math.max(2, lookbackMonths + 1))
  const lastMonth = windowMonths.at(-1)
  if (lastMonth === undefined) return 0
  const start = monthlyLast[windowMonths[0]]
  const end = monthlyLast[lastMonth]
  const spanMonths = windowMonths.length - 1

  if (start <= 0 || end <= 0 || spanMonths <= 0) return 0

  return (end / start) ** (1 / spanMonths) - 1
}

/**
 * Compute average monthly net-worth change over the last ``lookbackMonths``.
 * Returns 0 if there's not enough data.
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
 * Kept for backwards compatibility. Prefer `projectNetWorthCompound` for any
 * new consumer -- linear underestimates time-to-target for users with
 * compound return (equity / MF / PPF / EPF).
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
 * Project future monthly net-worth points from ``anchor`` at a constant
 * COMPOUND monthly rate (geometric growth).
 *
 * `monthlyRate` is a decimal (0.01 = 1 % per month). Typical realistic values:
 *   - 0.005-0.015 for a saver-investor in INR assets (6-20 % annual)
 *   - > 0.02 rarely sustainable; clamp at the call site if desired
 *
 * Unlike the linear `projectNetWorth`, this reflects the actual compounding
 * behaviour of equity / MF / PPF / EPF holdings. For a user with monthly
 * savings contributions *and* market returns, both effects fold into the
 * observed monthly rate -- the geometric-mean lookback captures the blended
 * historical growth directly.
 */
export function projectNetWorthCompound(
  anchor: NetWorthPoint,
  monthlyRate: number,
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
      netWorth: anchor.netWorth * (1 + monthlyRate) ** i,
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

/**
 * Compute how many months from `anchor` until compound growth at `monthlyRate`
 * reaches `target`. Solves `anchor * (1 + r)^n = target` for n:
 *     n = ln(target / anchor) / ln(1 + r)
 *
 * Returns `null` when growth is non-positive or the target is already met.
 */
function monthsToTargetCompound(
  anchorValue: number,
  target: number,
  monthlyRate: number,
): number | null {
  if (target <= anchorValue) return null
  if (anchorValue <= 0) return null
  if (monthlyRate <= 0) return null
  return Math.log(target / anchorValue) / Math.log(1 + monthlyRate)
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

function buildUpcomingRowCompound(
  m: Milestone,
  anchor: NetWorthPoint,
  monthlyRate: number,
): MilestoneRow {
  const monthsAway = monthsToTargetCompound(anchor.netWorth, m.value, monthlyRate)
  if (monthsAway === null) {
    return { ...m, status: 'upcoming', date: null, distance: null, stableSince: null }
  }
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
 * - achieved: rows whose value was ever crossed by the series.
 * - upcoming: rows whose value is above the anchor's net worth. ETA is
 *   anchor.date + (value - anchor.netWorth) / monthlyGrowth months.
 *   Omitted from the upcoming set when growth <= 0.
 */
export function buildMilestoneRows(
  series: readonly NetWorthPoint[],
  anchor: NetWorthPoint | null,
  monthlyGrowth: number,
  milestones: readonly Milestone[] = DEFAULT_MILESTONES,
): MilestoneRow[] {
  if (series.length === 0 || anchor === null) {
    return milestones.map((m) => ({
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
        status: 'achieved',
        date: dateStr,
        distance: daysFromStart,
        stableSince: findStableSince(sorted, m.value, dateStr),
      }
    }
    return buildUpcomingRow(m, anchor, monthlyGrowth)
  })

  // Sort by value so the table reads low-to-high regardless of status.
  return rows.sort((a, b) => a.value - b.value)
}

/**
 * Compound-growth equivalent of `buildMilestoneRows`.
 *
 * `monthlyRate` is a decimal (0.01 = 1 % per month). Historic "achieved" rows
 * are identical to the linear version -- only the ETA for upcoming rows is
 * computed using compound growth instead of a fixed monthly delta.
 */
export function buildMilestoneRowsCompound(
  series: readonly NetWorthPoint[],
  anchor: NetWorthPoint | null,
  monthlyRate: number,
  milestones: readonly Milestone[] = DEFAULT_MILESTONES,
): MilestoneRow[] {
  if (series.length === 0 || anchor === null) {
    return milestones.map((m) => ({
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
        status: 'achieved',
        date: dateStr,
        distance: daysFromStart,
        stableSince: findStableSince(sorted, m.value, dateStr),
      }
    }
    return buildUpcomingRowCompound(m, anchor, monthlyRate)
  })

  return rows.sort((a, b) => a.value - b.value)
}
