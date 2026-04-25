/**
 * Net-worth milestone detection + projection helpers.
 *
 * Pure functions. No React, no side effects. Used by MilestonesTimeline and
 * NetWorthProjection components.
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

export interface MilestoneAchieved extends Milestone {
  /** ISO date YYYY-MM-DD when net worth first crossed this threshold. */
  achievedOn: string
  /** How many days it took from the first tracked point to this milestone. */
  daysFromStart: number
}

export interface MilestoneETA extends Milestone {
  /** Projected ISO date when net worth will reach this milestone. */
  etaDate: string
  /** Months from today. */
  monthsAway: number
}

/**
 * Default milestones for an Indian-rupee net-worth context.
 * Hand-picked to span useful ranges. Could be preference-driven later.
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
 * Walk a chronologically-sorted net-worth series and find the date each
 * milestone was first reached (net worth >= threshold).
 *
 * Returns only milestones actually achieved, in chronological order.
 */
export function detectMilestonesAchieved(
  series: readonly NetWorthPoint[],
  milestones: readonly Milestone[] = DEFAULT_MILESTONES,
): MilestoneAchieved[] {
  if (series.length === 0) return []

  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date))
  const startDate = new Date(sorted[0].date)
  const achieved: MilestoneAchieved[] = []
  const remaining = new Set(milestones)

  for (const point of sorted) {
    if (remaining.size === 0) break
    for (const milestone of milestones) {
      if (!remaining.has(milestone)) continue
      if (point.netWorth >= milestone.value) {
        const d = new Date(point.date)
        const daysFromStart = Math.max(
          0,
          Math.round((d.getTime() - startDate.getTime()) / 86_400_000),
        )
        achieved.push({
          ...milestone,
          achievedOn: point.date.substring(0, 10),
          daysFromStart,
        })
        remaining.delete(milestone)
      }
    }
  }

  return achieved
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

  // Take only the tail
  const windowMonths = months.slice(-Math.max(2, lookbackMonths + 1))
  const deltas: number[] = []
  for (let i = 1; i < windowMonths.length; i++) {
    deltas.push(monthlyLast[windowMonths[i]] - monthlyLast[windowMonths[i - 1]])
  }
  if (deltas.length === 0) return 0

  return deltas.reduce((sum, d) => sum + d, 0) / deltas.length
}

/**
 * Project future net-worth points at a constant monthly growth rate.
 *
 * @param currentNetWorth  Net worth today (last observed value).
 * @param monthlyGrowth    Expected net-worth delta per month.
 * @param horizonMonths    How many months into the future to project.
 * @returns One data point per month (start from "today + 1 month").
 */
export function projectNetWorth(
  currentNetWorth: number,
  monthlyGrowth: number,
  horizonMonths = 60,
): NetWorthPoint[] {
  if (horizonMonths <= 0) return []
  const points: NetWorthPoint[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  for (let i = 1; i <= horizonMonths; i++) {
    const d = new Date(today)
    d.setMonth(d.getMonth() + i)
    points.push({
      date: d.toISOString().substring(0, 10),
      netWorth: currentNetWorth + monthlyGrowth * i,
    })
  }
  return points
}

/**
 * Compute ETA (date + months-away) for each milestone that hasn't been hit yet.
 *
 * If monthly growth is zero or negative, milestones that aren't already
 * achieved are omitted -- projection would be infinite / non-convergent.
 */
export function computeMilestoneETAs(
  currentNetWorth: number,
  monthlyGrowth: number,
  achieved: readonly MilestoneAchieved[],
  milestones: readonly Milestone[] = DEFAULT_MILESTONES,
): MilestoneETA[] {
  if (monthlyGrowth <= 0) return []

  const achievedValues = new Set(achieved.map(m => m.value))
  const pending = milestones.filter(m => !achievedValues.has(m.value) && m.value > currentNetWorth)
  if (pending.length === 0) return []

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return pending.map(milestone => {
    const monthsAway = (milestone.value - currentNetWorth) / monthlyGrowth
    const eta = new Date(today)
    eta.setDate(eta.getDate() + Math.round(monthsAway * 30.44))
    return {
      ...milestone,
      etaDate: eta.toISOString().substring(0, 10),
      monthsAway: Math.round(monthsAway * 10) / 10,
    }
  })
}
