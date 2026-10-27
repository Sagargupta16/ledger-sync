/**
 * Compound projection for the Net Worth trend.
 *
 * The trend is cumulative cash flow (book value). Compounding it at its own
 * historical growth would count savings as market returns, which is how the
 * old projection reached 28 Cr. What compounds here is the saving itself: the
 * average monthly saving (the straight line's slope) grows every year at the
 * measured CAGR of yearly savings, so a rising salary bends the line up and a
 * shrinking saving bends it down. It compounds only across the five years the
 * chart draws; after that the saving holds at its fifth-year level, so a
 * milestone ETA never stretches a three-year trend over decades. Without a
 * measurable rate it is the straight line. Market returns stay out, as
 * everywhere else on this page.
 */

import { addFractionalMonthsToKey } from '@/lib/dateUtils'
import { completeMonthAverage } from '@/lib/finance/monthlyAverage'
import {
  projectNetWorthLinearBand,
  type NetWorthMilestoneProgress,
  type NetWorthPoint,
} from '@/lib/finance/netWorth'

export interface SavingsGrowth {
  /** Yearly growth applied to the monthly saving, after the cap; 0 is the straight line. */
  readonly rate: number
  /** The measured CAGR before the cap; null when the window cannot support one. */
  readonly measured: number | null
  /** Complete 12-month blocks compared; at least 2 for a rate. */
  readonly years: number
}

export const NO_SAVINGS_GROWTH: SavingsGrowth = { rate: 0, measured: null, years: 0 }
/** One exceptional year cannot compound away: the rate stays within 15% a year either way. */
export const SAVINGS_GROWTH_CAP = 0.15
/** Months the chart projects, and the only months the saving compounds over. */
export const PROJECTION_HORIZON_MONTHS = 60
const LOOKBACK_YEARS = 3
const MONTHS = 12

/**
 * CAGR of yearly savings across the window's last (up to) three complete
 * 12-month blocks, oldest to newest. The newest block is the same trailing 12
 * complete months as the average monthly saving. Needs 24 complete months and
 * a positive first and last block; anything else is no growth.
 */
export function measureSavingsGrowth(
  netByMonth: ReadonlyMap<string, number>,
  window: { readonly start?: string | null; readonly end?: string | null },
  now: Date = new Date(),
): SavingsGrowth {
  const span = completeMonthAverage(netByMonth, { ...window, trailingMonths: LOOKBACK_YEARS * MONTHS }, now)
  const years = Math.floor((span?.values.length ?? 0) / MONTHS)
  if (!span || years < 2) return NO_SAVINGS_GROWTH
  const recent = span.values.slice(-years * MONTHS)
  const blocks = Array.from({ length: years }, (_, block) =>
    recent.slice(block * MONTHS, (block + 1) * MONTHS).reduce((sum, value) => sum + value, 0))
  const first = blocks[0]
  const last = blocks[years - 1]
  if (first <= 0 || last <= 0) return { ...NO_SAVINGS_GROWTH, years }
  const measured = (last / first) ** (1 / (years - 1)) - 1
  return { rate: Math.min(SAVINGS_GROWTH_CAP, Math.max(-SAVINGS_GROWTH_CAP, measured)), measured, years }
}

export interface CompoundProjectionPoint {
  readonly date: string
  /** The saving grows at the yearly rate. */
  readonly compound: number
  /** The previous model: the same saving every month. */
  readonly linear: number
  readonly lower: number
  readonly upper: number
}

const monthlyFactor = (annualGrowth: number) => (1 + annualGrowth) ** (1 / MONTHS)

/**
 * Month k adds monthly x q^k, q being the monthly factor, up to the horizon;
 * each later month adds the horizon month's saving. The band is one standard
 * deviation of the summed savings with each month's spread scaled like its
 * mean. At rate 0 this is the straight line and its sigma x sqrt(k) band,
 * taken from projectNetWorthLinearBand itself.
 */
export function projectNetWorthCompound(
  anchor: NetWorthPoint,
  monthly: number,
  sigma: number,
  annualGrowth: number,
  horizonMonths = PROJECTION_HORIZON_MONTHS,
): CompoundProjectionPoint[] {
  const straight = projectNetWorthLinearBand(anchor, monthly, sigma, horizonMonths)
  if (annualGrowth === 0) {
    return straight.map(({ date, mean, lower, upper }) => ({ date, compound: mean, linear: mean, lower, upper }))
  }
  const q = monthlyFactor(annualGrowth)
  let factor = 1
  let saved = 0
  let variance = 0
  return straight.map(({ date, mean }, index) => {
    if (index < PROJECTION_HORIZON_MONTHS) factor *= q
    saved += monthly * factor
    variance += (sigma * factor) ** 2
    const compound = anchor.netWorth + saved
    const half = Math.sqrt(variance)
    return { date, compound, linear: mean, lower: compound - half, upper: compound + half }
  })
}

/**
 * Fractional months for the projection to gain `gap`: solved on the compounding
 * stretch when the gap closes inside the horizon, otherwise the rest at the
 * horizon month's saving. Null only without a positive saving.
 */
export function monthsToGainCompound(gap: number, monthly: number, annualGrowth: number): number | null {
  if (gap <= 0) return 0
  if (monthly <= 0) return null
  if (annualGrowth === 0) return gap / monthly
  const q = monthlyFactor(annualGrowth)
  const horizon = PROJECTION_HORIZON_MONTHS
  // Saved after k compounding months is monthly x q x (q^k - 1) / (q - 1).
  const savedByHorizon = (monthly * q * (q ** horizon - 1)) / (q - 1)
  if (gap <= savedByHorizon) return Math.log(1 + (gap * (q - 1)) / (monthly * q)) / Math.log(q)
  return horizon + (gap - savedByHorizon) / (monthly * q ** horizon)
}

/** Re-times an upcoming ETA along the compound path; achieved rows and the straight line pass through. */
export function withCompoundEta(
  progress: NetWorthMilestoneProgress,
  anchor: NetWorthPoint | null,
  monthly: number,
  annualGrowth: number,
  target: number,
): NetWorthMilestoneProgress {
  if (annualGrowth === 0 || anchor === null || progress.status !== 'upcoming' || progress.date === null) return progress
  const months = monthsToGainCompound(target - anchor.netWorth, monthly, annualGrowth)
  if (months === null) return { ...progress, date: null, distance: null }
  return { ...progress, date: addFractionalMonthsToKey(anchor.date, months), distance: Math.round(months * 10) / 10 }
}
