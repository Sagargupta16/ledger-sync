/**
 * Forward TDS schedule -- models how an employer deducts tax month by month.
 *
 * Unlike a reactive "tax on income received to date" view, payroll projects
 * your full-year income from April and deducts tax proportionally, truing-up
 * whenever income changes. The rule this app uses (confirmed with the user):
 *
 *   - Base salary + bonus are configured/known -> projected from month 1, so
 *     they set a flat TDS baseline.
 *   - RSU vestings are dated but uncertain -> folded into the projection only
 *     in the month they vest, which makes that month's TDS spike as payroll
 *     catches up the under-deducted tax across the remaining months.
 *
 * Per month the algorithm is:
 *   baselineMonthly = calculateTax(regular*12) / 12          (flat all year)
 *   on an extra's month, add the MARGINAL tax on that extra:
 *     calculateTax(regular*12 + extrasIncludingThis)
 *       - calculateTax(regular*12 + extrasBeforeThis)
 *
 * So regular salary TDS is a flat baseline, and a bonus/RSU's tax appears as
 * a one-month spike in the month it lands -- matching a real payslip. The
 * marginal tax is computed progressively (including prior extras) so slab
 * stacking stays correct, and the monthly amounts telescope to exactly the
 * full-year tax on total income.
 */

import { calculateTax, type TaxSlab } from '@/lib/taxCalculator'
import { MONTHS_PER_YEAR } from '@/lib/dateUtils'
import type { RsuGrant } from '@/types/salary'

/** Month labels in fiscal-year order, starting from the FY start month. */
const ALL_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

/** One row of the month-by-month TDS schedule. */
export interface TdsMonthRow {
  /** Short month label, e.g. "Apr". */
  month: string
  /** 0-based index within the fiscal year (0 = FY start month). */
  monthIndex: number
  /** Taxable income credited this month (regular + any RSU vesting). */
  monthIncome: number
  /** Projected full-year income known as of this month. */
  projectedAnnual: number
  /** Tax on the projected annual income at this point in the year. */
  annualTax: number
  /** TDS deducted this month (remaining liability / remaining months). */
  monthlyTds: number
  /** Running total of TDS deducted through this month. */
  cumulativeTds: number
  /** Take-home this month (monthIncome - monthlyTds). */
  takeHome: number
}

export interface TdsScheduleParams {
  /** Regular taxable income per month (base + hra + special + other + bonus, net of exempt EPF). */
  regularMonthlyIncome: number
  /** RSU (or other dated) income keyed by 0-based FY month index. */
  extraByMonth: Record<number, number>
  /** Month (1-12) the fiscal year starts on (India: 4 = April). */
  fyStartMonth: number
  slabs: TaxSlab[]
  standardDeduction: number
  isNewRegime: boolean
  fyStartYear: number
}

/**
 * Bucket RSU vestings into 0-based fiscal-month indices for a target FY.
 *
 * Only vestings that fall inside the given fiscal year are included; the
 * returned map feeds ``extraByMonth``. Index 0 = the FY start month.
 */
export function rsuExtrasByFyMonth(
  grants: RsuGrant[],
  fyStartYear: number,
  fyStartMonth: number,
): Record<number, number> {
  const out: Record<number, number> = {}
  for (const grant of grants) {
    for (const v of grant.vestings) {
      const d = new Date(v.date)
      const m = d.getMonth() + 1 // 1-12
      const y = d.getFullYear()
      // Which FY does this vesting belong to?
      const vestingFyStart = m >= fyStartMonth ? y : y - 1
      if (vestingFyStart !== fyStartYear) continue
      const idx = (m - fyStartMonth + MONTHS_PER_YEAR) % MONTHS_PER_YEAR
      out[idx] = (out[idx] ?? 0) + v.quantity * (Number(grant.stock_price) || 0)
    }
  }
  return out
}

/** Month label for a given 0-based offset from the FY start month. */
function monthLabel(fyStartMonth: number, offset: number): string {
  // fyStartMonth is 1-12; ALL_MONTHS is 0-indexed by calendar month.
  return ALL_MONTHS[(fyStartMonth - 1 + offset) % MONTHS_PER_YEAR]
}

/**
 * Build the 12-month forward TDS schedule.
 *
 * Returns one row per fiscal month. TDS for a month is the remaining annual
 * liability spread over the remaining months, so a mid-year RSU vesting
 * produces a one-month spike followed by a lower steady state.
 */
export function buildTdsSchedule(params: TdsScheduleParams): TdsMonthRow[] {
  const {
    regularMonthlyIncome,
    extraByMonth,
    fyStartMonth,
    slabs,
    standardDeduction,
    isNewRegime,
    fyStartYear,
  } = params

  const regularAnnual = regularMonthlyIncome * MONTHS_PER_YEAR

  const taxOn = (income: number): number =>
    calculateTax(income, slabs, standardDeduction, true, MONTHS_PER_YEAR, isNewRegime, fyStartYear)
      .totalTax

  // Flat baseline TDS: the tax on regular salary alone, spread evenly.
  const regularAnnualTax = taxOn(regularAnnual)
  const baselineMonthlyTds = regularAnnualTax / MONTHS_PER_YEAR

  const rows: TdsMonthRow[] = []
  let cumulativeTds = 0
  let extrasBefore = 0 // extras that landed in earlier months

  for (let i = 0; i < MONTHS_PER_YEAR; i++) {
    const extra = extraByMonth[i] ?? 0
    const monthIncome = regularMonthlyIncome + extra

    // Marginal tax on THIS month's extra, stacked on regular + prior extras so
    // progressive slabs apply correctly. Zero in months with no extra.
    const marginalExtraTax = extra > 0
      ? taxOn(regularAnnual + extrasBefore + extra) - taxOn(regularAnnual + extrasBefore)
      : 0
    extrasBefore += extra

    // Projected annual income known as of this month (regular + extras landed).
    const projectedAnnual = regularAnnual + extrasBefore

    const monthlyTds = Math.max(0, baselineMonthlyTds + marginalExtraTax)
    cumulativeTds += monthlyTds

    rows.push({
      month: monthLabel(fyStartMonth, i),
      monthIndex: i,
      monthIncome,
      projectedAnnual,
      annualTax: taxOn(projectedAnnual),
      monthlyTds,
      cumulativeTds,
      takeHome: monthIncome - monthlyTds,
    })
  }

  return rows
}
