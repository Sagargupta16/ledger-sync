import { formatMonthKey } from '@/lib/dateUtils'
import type { NetWorthPoint } from '@/lib/finance/netWorth'

export interface NetWorthMonthOverMonth {
  /** The last 12 completed month-end balances, oldest first. */
  readonly sparkline: number[]
  /** Percent change between the last two completed months; undefined without a positive base. */
  readonly change: number | undefined
  /** What the badge compares. */
  readonly label: string
}

/**
 * The hero card's month-on-month badge and sparkline, both from completed
 * calendar-month balances. The change needs a positive prior month-end:
 * negative or zero bases make a "% change" nonsensical, so the card then omits
 * the badge. The label names the compared month because mid-month the most
 * recent completed month is NOT "last month" -- saying so is the difference
 * between an honest delta and a wrong one.
 */
export function summarizeMonthOverMonth(monthly: readonly NetWorthPoint[]): NetWorthMonthOverMonth {
  const sparkline = monthly.slice(-12).map((p) => p.netWorth)
  if (monthly.length < 2) return { sparkline, change: undefined, label: 'vs last month' }
  const prev = monthly.at(-2)?.netWorth ?? 0
  const curr = monthly.at(-1)?.netWorth ?? 0
  const latestMonth = monthly.at(-1)?.date.slice(0, 7)
  return {
    sparkline,
    change: prev > 0 ? Math.round(((curr - prev) / prev) * 1000) / 10 : undefined,
    label: latestMonth
      ? `${formatMonthKey(latestMonth, { month: 'short', year: '2-digit' })} vs prior month`
      : 'vs last month',
  }
}
