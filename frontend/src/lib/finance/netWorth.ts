import { addDaysToKey, addFractionalMonthsToKey, addMonthsToKey, monthKeysBetween, MS_PER_DAY } from '@/lib/dateUtils'

export interface NetWorthPoint {
  date: string
  netWorth: number
}

export interface NetWorthProjectionBandPoint {
  date: string
  mean: number
  upper: number
  lower: number
}

export type NetWorthMilestoneStatus = 'achieved' | 'upcoming'

export interface NetWorthMilestoneProgress {
  status: NetWorthMilestoneStatus
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
 * Last balance in each calendar month, carrying the previous balance through
 * inactive months. The final point keeps its observed date so an in-progress
 * month is never moved into the future. No history is invented before the
 * first observation or after the last one.
 */
export function buildMonthlyNetWorthBalances(
  series: readonly NetWorthPoint[],
): NetWorthPoint[] {
  if (series.length === 0) return []
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date))
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const monthBalances = new Map<string, number>()
  for (const point of sorted) {
    monthBalances.set(point.date.slice(0, 7), point.netWorth)
  }

  const lastMonth = last.date.slice(0, 7)
  let balance = first.netWorth
  return monthKeysBetween(first.date, last.date).map((month) => {
    balance = monthBalances.get(month) ?? balance
    return {
      date: month === lastMonth
        ? last.date
        : addDaysToKey(addMonthsToKey(`${month}-01`, 1), -1),
      netWorth: balance,
    }
  })
}

/** A lookback counts calendar intervals, including months with no change. */
function monthlyNetWorthDeltas(
  series: readonly NetWorthPoint[],
  lookbackMonths: number,
): number[] {
  const intervalCount = Math.max(0, Math.floor(lookbackMonths))
  if (intervalCount === 0) return []
  const monthly = buildMonthlyNetWorthBalances(series).slice(-(intervalCount + 1))
  return monthly.slice(1).map((point, index) => point.netWorth - monthly[index].netWorth)
}

/** Average absolute change in base-currency units per calendar month. */
export function computeAvgMonthlyGrowth(
  series: readonly NetWorthPoint[],
  lookbackMonths = 12,
): number {
  const deltas = monthlyNetWorthDeltas(series, lookbackMonths)
  if (deltas.length === 0) return 0
  return deltas.reduce((sum, delta) => sum + delta, 0) / deltas.length
}

/**
 * Calendar-month mean and sample standard deviation of absolute balance
 * changes. At least two deltas are required for the projection's variance.
 */
export function computeLinearGrowthStats(
  series: readonly NetWorthPoint[],
  lookbackMonths = 12,
): { growth: number; sigma: number } {
  const deltas = monthlyNetWorthDeltas(series, lookbackMonths)
  if (deltas.length < 2) return { growth: 0, sigma: 0 }
  const growth = deltas.reduce((sum, delta) => sum + delta, 0) / deltas.length
  const variance = deltas.reduce((sum, delta) => sum + (delta - growth) ** 2, 0)
    / (deltas.length - 1)
  return { growth, sigma: Math.sqrt(variance) }
}

/** Linear projection of cumulative cash flow, not compounded market returns. */
export function projectNetWorth(
  anchor: NetWorthPoint,
  monthlyGrowth: number,
  horizonMonths = 60,
): NetWorthPoint[] {
  const points: NetWorthPoint[] = []
  for (let month = 1; month <= horizonMonths; month++) {
    points.push({
      date: addMonthsToKey(anchor.date, month),
      netWorth: anchor.netWorth + monthlyGrowth * month,
    })
  }
  return points
}

/** One sample-standard-deviation band under the existing additive model. */
export function projectNetWorthLinearBand(
  anchor: NetWorthPoint,
  monthlyGrowth: number,
  sigma: number,
  horizonMonths = 60,
): NetWorthProjectionBandPoint[] {
  const points: NetWorthProjectionBandPoint[] = []
  for (let month = 1; month <= horizonMonths; month++) {
    const mean = anchor.netWorth + monthlyGrowth * month
    const halfBand = sigma > 0 ? sigma * Math.sqrt(month) : 0
    points.push({
      date: addMonthsToKey(anchor.date, month),
      mean,
      upper: mean + halfBand,
      lower: mean - halfBand,
    })
  }
  return points
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

/** First attainment, recovery, or ETA for one threshold in chronological history. */
export function computeNetWorthMilestoneProgress(
  sortedSeries: readonly NetWorthPoint[],
  anchor: NetWorthPoint | null,
  monthlyGrowth: number,
  target: number,
): NetWorthMilestoneProgress {
  if (sortedSeries.length === 0 || anchor === null) {
    return { status: 'upcoming', date: null, distance: null, stableSince: null }
  }

  const crossing = sortedSeries.find((point) => point.netWorth >= target)
  if (crossing !== undefined) {
    const date = crossing.date.substring(0, 10)
    const startDate = new Date(sortedSeries[0].date)
    const daysFromStart = Math.max(
      0,
      Math.round((new Date(date).getTime() - startDate.getTime()) / MS_PER_DAY),
    )
    return {
      status: 'achieved',
      date,
      distance: daysFromStart,
      stableSince: findStableSince(sortedSeries, target, date),
    }
  }

  if (monthlyGrowth <= 0 || target <= anchor.netWorth) {
    return { status: 'upcoming', date: null, distance: null, stableSince: null }
  }
  const monthsAway = (target - anchor.netWorth) / monthlyGrowth
  return {
    status: 'upcoming',
    date: addFractionalMonthsToKey(anchor.date, monthsAway),
    distance: Math.round(monthsAway * 10) / 10,
    stableSince: null,
  }
}

export interface CategorizedAccountBalance {
  category: string
  balance: number
}

/**
 * Account totals include every signed balance. The asset allocation uses only
 * positive balances in included categories, with that same set as denominator.
 */
export function summarizeNetWorthAccounts(
  accounts: readonly CategorizedAccountBalance[],
  excludedCategories: readonly string[],
) {
  let totalAssets = 0
  let totalLiabilities = 0
  let includedAssets = 0
  const categoryTotals = new Map<string, number>()
  const excluded = new Set(excludedCategories)

  for (const { category, balance } of accounts) {
    if (balance < 0) {
      totalLiabilities -= balance
      continue
    }
    totalAssets += balance
    if (balance === 0 || excluded.has(category)) continue
    includedAssets += balance
    categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + balance)
  }

  const categoryProportions = Object.fromEntries(
    [...categoryTotals].map(([category, total]) => [category, total / includedAssets]),
  )
  return {
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
    assetCategories: [...categoryTotals.keys()],
    categoryProportions,
  }
}

/**
 * Cumulative income less all expenses. `netWorth` is the existing chart field
 * name; this is cash-flow history, not a reconstruction of account balances.
 * Category bands allocate positive cash flow using supplied present-day shares.
 */
export function computeNetWorthTimeSeries(
  transactions: readonly { date: string; type: string; amount: number }[],
  allCategories: readonly string[],
  categoryProportions: Readonly<Record<string, number>>,
): Array<Record<string, number | string>> {
  const dailyMap: Record<string, { income: number; expense: number }> = {}
  for (const tx of transactions) {
    const day = tx.date.slice(0, 10)
    if (!dailyMap[day]) dailyMap[day] = { income: 0, expense: 0 }
    if (tx.type === 'Income') dailyMap[day].income += tx.amount
    else if (tx.type === 'Expense') dailyMap[day].expense += tx.amount
  }

  let cumulativeIncome = 0
  let cumulativeExpenses = 0
  let netWorth = 0
  return Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { income, expense }]) => {
      cumulativeIncome += income
      cumulativeExpenses += expense
      netWorth += income - expense
      const point: Record<string, number | string> = {
        date,
        netWorth,
        dailyFlow: income - expense,
        cumulativeIncome,
        cumulativeExpenses,
      }
      for (const category of allCategories) {
        point[category] = Math.max(netWorth, 0) * (categoryProportions[category] ?? 0)
      }
      return point
    })
}
